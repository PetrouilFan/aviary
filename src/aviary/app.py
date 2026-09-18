"""FastAPI application: console API, live event stream and the SPA.

The console speaks to the embedded Canary agent directly (in-process). The full
Canary admin API is additionally mounted under ``/canary`` for advanced use.
"""

from __future__ import annotations

import asyncio
import json
import queue
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .runtime import Runtime

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


class EventHub:
    """Fans out periodic snapshots to all connected consoles."""

    def __init__(self, runtime: Runtime, interval: float = 2.0) -> None:
        self.runtime = runtime
        self.interval = interval
        self._subscribers: set[queue.Queue] = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="aviary-events", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3.0)

    def subscribe(self) -> queue.Queue:
        sub: queue.Queue = queue.Queue(maxsize=8)
        with self._lock:
            self._subscribers.add(sub)
        return sub

    def unsubscribe(self, sub: queue.Queue) -> None:
        with self._lock:
            self._subscribers.discard(sub)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                payload = self.runtime.snapshot()
            except Exception as exc:  # noqa: BLE001 - never kill the fan-out thread
                payload = {"type": "error", "error": str(exc)}
            with self._lock:
                subscribers = list(self._subscribers)
            for sub in subscribers:
                try:
                    sub.put_nowait(payload)
                except queue.Full:
                    pass
            self._stop.wait(self.interval)


class TurnStream:
    """Runs one agent turn in a thread and exposes its events as a queue."""

    def __init__(
        self,
        runtime: Runtime,
        message: str,
        session_id: str | None,
        model: str | None,
        fail_fast: bool = False,
    ) -> None:
        self.runtime = runtime
        self.message = message
        self.session_id = session_id
        self.model = model
        self.fail_fast = fail_fast
        self.events: queue.Queue = queue.Queue()
        self.response: str | None = None
        self.session_id_out: str | None = None
        self.error: str | None = None

    def start(self) -> None:
        threading.Thread(target=self._run, name="aviary-turn", daemon=True).start()

    def _run(self) -> None:
        try:
            self.response = self.runtime.agent.run(
                self.message,
                session_id=self.session_id,
                model=self.model,
                fail_fast=self.fail_fast,
                on_event=self.events.put,
            )
            self.session_id_out = (self.runtime.agent.last_result or {}).get("session_id")
        except Exception as exc:  # noqa: BLE001 - forwarded to the stream
            self.error = str(exc)
        finally:
            self.events.put(None)


def _session_or_404(runtime: Runtime, session_id: str):
    session = runtime.agent.sessions.load(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"unknown session {session_id!r}")
    return session


def create_app(runtime: Runtime) -> FastAPI:
    hub = EventHub(runtime)
    agent = runtime.agent

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        hub.start()
        try:
            yield
        finally:
            hub.stop()

    app = FastAPI(title="Aviary", version="0.1.0", lifespan=lifespan, docs_url="/api/docs")

    # -- status & snapshots --------------------------------------------------

    @app.get("/api/status")
    def status() -> dict[str, Any]:
        return runtime.status()

    @app.get("/api/snapshot")
    def snapshot() -> dict[str, Any]:
        return runtime.snapshot()

    @app.get("/api/events")
    async def events(request: Request) -> StreamingResponse:
        sub = hub.subscribe()

        async def gen():
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        payload = await asyncio.to_thread(sub.get, True, 15)
                    except queue.Empty:
                        yield ": ping\n\n"
                        continue
                    if payload is None:
                        break
                    yield sse("snapshot", payload)
            finally:
                hub.unsubscribe(sub)

        return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)

    # -- chat ----------------------------------------------------------------

    def resolve_chat_session(payload: dict) -> str:
        session_id = payload.get("session_id")
        if session_id:
            return str(session_id)
        session = agent.sessions.create(name="console")
        return session.id

    @app.post("/api/chat")
    async def chat(payload: dict = Body(...)) -> dict[str, Any]:
        message = str(payload.get("message") or "").strip()
        if not message:
            raise HTTPException(status_code=400, detail="message is required")
        session_id = resolve_chat_session(payload)
        try:
            response = await asyncio.to_thread(
                agent.run,
                message,
                session_id=session_id,
                model=payload.get("model"),
                fail_fast=bool(payload.get("fail_fast")),
            )
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"error": str(exc)}, status_code=409)
        return {
            "response": response,
            "session_id": session_id,
            "usage": agent.last_usage,
            "agent_id": agent.agent_id,
            "release_id": runtime.config.release_id,
        }

    @app.post("/api/chat/stream")
    async def chat_stream(payload: dict = Body(...)) -> StreamingResponse:
        message = str(payload.get("message") or "").strip()
        if not message:
            raise HTTPException(status_code=400, detail="message is required")
        session_id = resolve_chat_session(payload)
        turn = TurnStream(
            runtime,
            message,
            session_id,
            payload.get("model"),
            fail_fast=bool(payload.get("fail_fast")),
        )

        async def gen():
            turn.start()
            while True:
                try:
                    event = await asyncio.to_thread(turn.events.get, True, 15)
                except queue.Empty:
                    yield ": ping\n\n"
                    continue
                if event is None:
                    break
                yield sse(str(event.get("type", "event")), event)
            if turn.error:
                yield sse("error", {"error": turn.error})
            else:
                yield sse(
                    "done",
                    {
                        "response": turn.response,
                        "session_id": turn.session_id_out or turn.session_id,
                        "usage": agent.last_usage,
                    },
                )

        return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)

    # -- sessions ------------------------------------------------------------

    @app.get("/api/sessions")
    def sessions(include_archived: bool = False) -> dict[str, Any]:
        rows = runtime.sessions(include_archived=include_archived)
        return {"sessions": rows, "count": len(rows)}

    @app.get("/api/sessions/{session_id}")
    def session_detail(session_id: str, lines: int = Query(200, ge=1, le=2000)) -> dict[str, Any]:
        session = _session_or_404(runtime, session_id)
        return {
            "info": session.info(),
            "messages": [m.to_json() for m in session.history(last_n=lines)],
            "transcript": session.transcript(last_n=lines),
            "events": session.events(last_n=50),
            "pending_inbox": session.pending_inbox(),
        }

    @app.get("/api/sessions/{session_id}/events")
    async def session_events(session_id: str, request: Request) -> StreamingResponse:
        session = _session_or_404(runtime, session_id)
        try:
            start = int(request.headers.get("last-event-id", "0"))
        except ValueError:
            start = 0

        async def gen():
            index = start
            while True:
                if await request.is_disconnected():
                    break
                rows = await asyncio.to_thread(session.events)
                while index < len(rows):
                    event = rows[index]
                    yield (
                        f"id: {index}\nevent: {event.get('type', 'event')}\n"
                        f"data: {json.dumps(event, default=str)}\n\n"
                    )
                    index += 1
                await asyncio.sleep(0.5)

        return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)

    @app.post("/api/sessions/{session_id}/cancel")
    def session_cancel(session_id: str) -> dict[str, Any]:
        session = _session_or_404(runtime, session_id)
        session.request_cancel()
        return {"ok": True, "session_id": session_id}

    @app.post("/api/sessions/{session_id}/inject")
    def session_inject(session_id: str, payload: dict = Body(...)) -> dict[str, Any]:
        message = str(payload.get("message") or "").strip()
        if not message:
            raise HTTPException(status_code=400, detail="message is required")
        result = runtime.agent.sessions.inject_message(
            session_id,
            message,
            from_agent=str(payload.get("from_agent") or "console"),
            from_session=payload.get("from_session"),
            persist=bool(payload.get("persist")),
        )
        if result.get("status") == "error":
            return JSONResponse(result, status_code=429)
        return result

    # -- jobs ----------------------------------------------------------------

    @app.get("/api/jobs")
    def jobs(status_filter: str | None = Query(None, alias="status")) -> dict[str, Any]:
        rows = runtime.agent.jobs.list(status=status_filter).get("jobs", [])
        return {"jobs": rows, "count": len(rows)}

    @app.get("/api/jobs/{job_id}")
    def job_status(job_id: str) -> dict[str, Any]:
        result = runtime.agent.jobs.status(job_id)
        if result.get("error"):
            raise HTTPException(status_code=404, detail=result["error"])
        return result

    @app.get("/api/jobs/{job_id}/log")
    def job_log(
        job_id: str, offset: int = 0, lines: int = Query(200, ge=1, le=5000)
    ) -> dict[str, Any]:
        return runtime.agent.jobs.log(job_id, offset=offset, lines=lines)

    @app.post("/api/jobs/{job_id}/kill")
    def job_kill(job_id: str) -> dict[str, Any]:
        return runtime.agent.jobs.kill(job_id)

    # -- memory --------------------------------------------------------------

    @app.get("/api/memory")
    def memory_search(
        q: str = Query(..., min_length=1),
        k: int = Query(10, ge=1, le=50),
        tag: list[str] | None = Query(None),
    ) -> dict[str, Any]:
        hits = agent.memory.search(q, k=k, tags=tag)
        return {"query": q, "hits": [h.to_dict() for h in hits], "count": len(hits)}

    @app.get("/api/memory/entries")
    def memory_entries(include_archived: bool = False) -> dict[str, Any]:
        entries = agent.memory.all_entries(include_archived=include_archived)
        rows = [
            {
                "id": e.id,
                "body": e.body,
                "tags": list(e.tags or []),
                "importance": e.importance,
                "created": e.created,
                "updated": e.updated,
                "source": e.source,
                "relations": dict(e.relations or {}),
                "archived": e.archived,
            }
            for e in entries
        ]
        rows.sort(key=lambda row: row.get("updated") or "", reverse=True)
        return {"entries": rows, "count": len(rows)}

    @app.post("/api/memory")
    def memory_save(payload: dict = Body(...)) -> dict[str, Any]:
        body = str(payload.get("body") or payload.get("text") or "").strip()
        if not body:
            raise HTTPException(status_code=400, detail="body is required")
        entry = agent.memory.save(
            body,
            tags=payload.get("tags") or [],
            entry_id=payload.get("entry_id"),
            source="console",
            importance=payload.get("importance"),
        )
        return {"ok": True, "entry_id": entry.id}

    @app.delete("/api/memory/{entry_id}")
    def memory_forget(entry_id: str) -> dict[str, Any]:
        ok = agent.memory.forget(entry_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"unknown memory entry {entry_id!r}")
        return {"ok": True, "entry_id": entry_id}

    # -- evals & releases ----------------------------------------------------

    @app.get("/api/evals/results")
    def evals_results(limit: int = Query(50, ge=1, le=1000)) -> dict[str, Any]:
        return {"results": runtime.evals_results(limit=limit)}

    @app.get("/api/evals/tasks")
    def evals_tasks() -> dict[str, Any]:
        return {"tasks": runtime.eval_tasks()}

    @app.post("/api/evals/run")
    async def evals_run(payload: dict = Body(default={})) -> dict[str, Any]:
        report = await asyncio.to_thread(
            runtime.evals.run,
            tag=payload.get("tag"),
            limit=payload.get("limit"),
            model_role=payload.get("model"),
        )
        runtime.evals.write_summary()
        return report

    @app.get("/api/releases")
    def releases() -> dict[str, Any]:
        if not runtime.health:
            return {"available": False, "reason": "embedded run without a CANARY_ROOT"}
        return {"available": True, "releases": runtime.health.list_releases()}

    @app.post("/api/releases/revert")
    def releases_revert(payload: dict = Body(default={})) -> dict[str, Any]:
        release_id = payload.get("release_id")
        result = agent.revert(release_id)
        if isinstance(result, str):
            return JSONResponse({"error": result}, status_code=400)
        return result

    # -- raw data ------------------------------------------------------------

    @app.get("/api/metrics")
    def metrics(limit: int = Query(200, ge=1, le=2000)) -> dict[str, Any]:
        return {"metrics": runtime.metrics(limit=limit)}

    @app.get("/api/deploys")
    def deploys(limit: int = Query(20, ge=1, le=200)) -> dict[str, Any]:
        return {"deploys": runtime.deploys(limit=limit)}

    @app.get("/api/tools")
    def tools() -> dict[str, Any]:
        return agent.tools.info()

    # -- full Canary admin API (mounted, loopback-local) ---------------------

    try:
        from canary.api.server import APIServer

        canary_app = APIServer(agent, allow_insecure_local=True).app
        app.mount("/canary", canary_app)
    except Exception:  # noqa: BLE001 - the console keeps working without it
        pass

    # -- SPA -----------------------------------------------------------------

    if runtime.web_dist.is_dir():
        app.mount("/", StaticFiles(directory=str(runtime.web_dist), html=True), name="web")
    else:

        @app.get("/")
        def root() -> dict[str, Any]:
            return {
                "name": "Aviary",
                "version": "0.1.0",
                "message": "The web UI is not built yet.",
                "hint": "cd web && npm install && npm run build (or use the Vite dev server)",
                "api": "/api/docs",
            }

    return app
