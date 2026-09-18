"""Runtime wrapper: owns the embedded Canary agent and aggregates console data.

The console deliberately keeps no state of its own. Everything it shows is read
from the Canary copy it is attached to (an in-process ``Agent``), so the web UI
can never drift from what the harness actually knows.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

from canary import Agent, Config
from canary.core.evals import Evals
from canary.core.util import tail_lines

SNAPSHOT_INTERVAL_S = 2.0
MEMORY_COUNT_TTL_S = 5.0


def _json_rows(path: Path, limit: int) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in tail_lines(path, limit):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


class Runtime:
    """An embedded Canary copy plus read-only aggregations for the console."""

    def __init__(
        self,
        root: str | Path | None = None,
        *,
        state_path: str | Path | None = None,
        ephemeral: bool = False,
        workspace: str | Path | None = None,
    ) -> None:
        self.config = Config(
            root=Path(root) if root is not None else None,
            state_path=Path(state_path) if state_path is not None else None,
            ephemeral=ephemeral,
            workspace=Path(workspace) if workspace is not None else None,
        )
        self.agent = Agent(self.config)
        self.evals = Evals(self.config, self.agent.log, registry=self.agent.tools)
        self.web_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
        self._lock = threading.Lock()
        self._memory_count = 0
        self._memory_count_at = 0.0

    # -- lifecycle -----------------------------------------------------------

    def close(self) -> None:
        self.agent.close()

    @property
    def health(self):
        return self.agent.health

    # -- aggregations --------------------------------------------------------

    def memory_count(self) -> int:
        now = time.monotonic()
        with self._lock:
            if now - self._memory_count_at < MEMORY_COUNT_TTL_S:
                return self._memory_count
        try:
            count = len(self.agent.memory.all_entries())
        except Exception:  # noqa: BLE001 - the console must not fail on stats
            count = 0
        with self._lock:
            self._memory_count = count
            self._memory_count_at = now
        return count

    def sessions(self, include_archived: bool = False) -> list[dict[str, Any]]:
        try:
            return self.agent.sessions.list(include_archived=include_archived)
        except Exception:  # noqa: BLE001
            return []

    def jobs(self) -> list[dict[str, Any]]:
        try:
            return list(self.agent.jobs.list().get("jobs", []))
        except Exception:  # noqa: BLE001
            return []

    def metrics(self, limit: int = 120) -> list[dict[str, Any]]:
        return _json_rows(self.agent.log.data / "metrics.jsonl", limit)

    def deploys(self, limit: int = 10) -> list[dict[str, Any]]:
        return _json_rows(self.agent.log.data / "deploys.jsonl", limit)

    def evals_results(self, limit: int = 20) -> list[dict[str, Any]]:
        return self.evals.results(limit=limit)

    def eval_tasks(self) -> list[dict[str, Any]]:
        try:
            return [task.to_dict() for task in self.evals.load_tasks()]
        except Exception:  # noqa: BLE001
            return []

    def status(self) -> dict[str, Any]:
        info = self.agent.info()
        tokens = self.agent.log.tokens_today()
        health = self.agent.health
        jobs = self.jobs()
        sessions = self.sessions()
        workers = [s for s in sessions if s.get("worker")]
        return {
            "agent": info,
            "tokens_today": tokens,
            "memory_count": self.memory_count(),
            "sessions": {
                "total": len(sessions),
                "workers": len(workers),
                "running": sum(1 for s in sessions if s.get("status") == "running"),
            },
            "jobs": {
                "total": len(jobs),
                "running": sum(1 for j in jobs if j.get("status") in ("running", "pending")),
            },
            "tools": {
                "total": len(self.agent.tools.available()),
                "disabled": self.agent.tools.disabled(),
            },
            "health": health.status() if health else None,
            "releases": health.list_releases() if health else None,
            "last_deploy_flagged": self.agent.log.last_deploy_flagged(),
            "version": "0.1.0",
        }

    def snapshot(self) -> dict[str, Any]:
        return {
            "type": "snapshot",
            "ts": time.time(),
            "status": self.status(),
            "sessions": self.sessions(),
            "jobs": self.jobs(),
            "evals": self.evals_results(limit=8),
            "deploys": self.deploys(limit=8),
            "metrics": self.metrics(limit=60),
        }
