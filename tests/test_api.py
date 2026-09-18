import asyncio
from pathlib import Path

import httpx
import pytest

from aviary.app import create_app
from aviary.runtime import Runtime

CLEAR_ENV = (
    "HARNESS_MODEL_NAME",
    "HARNESS_MODEL_BASE_URL",
    "HARNESS_MODEL_CONTEXT_LENGTH",
    "HARNESS_MODEL_API_KEY",
    "HARNESS_API_KEY",
    "HARNESS_SELF_MODIFY",
    "HARNESS_MEMORY_GIT",
    "HARNESS_EMBEDDING_BACKEND",
    "HARNESS_EMBEDDING_DOWNLOAD",
    "HARNESS_RELEASE_ID",
    "HARNESS_COMMIT_SHA",
    "CANARY_ROOT",
    "HARNESS_STATE_PATH",
)


@pytest.fixture()
def runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    for key in CLEAR_ENV:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HARNESS_EMBEDDING_BACKEND", "hash")
    monkeypatch.setenv("NO_PROXY", "*")
    rt = Runtime(state_path=tmp_path / "state", ephemeral=False)
    yield rt
    rt.close()


def asgi(runtime: Runtime):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app(runtime)),
        base_url="http://aviary.test",
    )


def test_status_and_snapshot(runtime: Runtime) -> None:
    async def run() -> None:
        async with asgi(runtime) as client:
            status = (await client.get("/api/status")).json()
            assert status["agent"]["agent_id"]
            assert status["tools"]["total"] > 0
            assert status["sessions"] == {"total": 0, "workers": 0, "running": 0}
            snapshot = (await client.get("/api/snapshot")).json()
            assert snapshot["type"] == "snapshot"
            assert {"status", "sessions", "jobs", "evals", "deploys", "metrics"} <= set(snapshot)

    asyncio.run(run())


def test_chat_persists_console_session(runtime: Runtime) -> None:
    async def run() -> None:
        async with asgi(runtime) as client:
            first = (await client.post("/api/chat", json={"message": "hello"})).json()
            assert first["response"] == "ok"
            session_id = first["session_id"]
            sessions = (await client.get("/api/sessions")).json()["sessions"]
            assert [s["id"] for s in sessions] == [session_id]
            assert sessions[0]["name"] == "console"

            second = (
                await client.post("/api/chat", json={"message": "again", "session_id": session_id})
            ).json()
            assert second["session_id"] == session_id

            detail = (await client.get(f"/api/sessions/{session_id}")).json()
            roles = [message["role"] for message in detail["messages"]]
            assert roles.count("user") == 2

    asyncio.run(run())


def test_chat_stream_events(runtime: Runtime) -> None:
    async def run() -> None:
        async with asgi(runtime) as client:
            async with client.stream(
                "POST", "/api/chat/stream", json={"message": "stream please"}
            ) as response:
                body = "".join([chunk async for chunk in response.aiter_text()])
            assert response.status_code == 200
            assert "event: delta" in body
            assert "event: done" in body
            assert '"response": "ok"' in body

    asyncio.run(run())


def test_memory_round_trip(runtime: Runtime) -> None:
    async def run() -> None:
        async with asgi(runtime) as client:
            saved = (
                await client.post(
                    "/api/memory", json={"body": "Aviary runs on port 8091", "tags": ["aviary"]}
                )
            ).json()
            assert saved["ok"]
            entry_id = saved["entry_id"]

            hits = (await client.get("/api/memory", params={"q": "which port"})).json()["hits"]
            assert any(hit["id"] == entry_id for hit in hits)

            entries = (await client.get("/api/memory/entries")).json()["entries"]
            assert any(entry["id"] == entry_id for entry in entries)

            forgotten = (await client.delete(f"/api/memory/{entry_id}")).json()
            assert forgotten["ok"]
            again = await client.delete(f"/api/memory/{entry_id}")
            assert again.status_code == 200  # forget is idempotent
            assert (await client.delete("/api/memory/does-not-exist")).status_code == 404

    asyncio.run(run())


def test_tools_and_jobs(runtime: Runtime) -> None:
    async def run() -> None:
        async with asgi(runtime) as client:
            tools = (await client.get("/api/tools")).json()
            assert "read" in tools["tools"]
            assert (await client.get("/api/jobs")).json()["count"] == 0
            tasks = (await client.get("/api/evals/tasks")).json()["tasks"]
            assert isinstance(tasks, list)
            releases = (await client.get("/api/releases")).json()
            assert releases["available"] is False

    asyncio.run(run())
