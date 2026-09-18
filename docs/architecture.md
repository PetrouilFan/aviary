# Architecture

Aviary is a thin console around an embedded [Canary](../canary) agent. Canary
owns the agent loop, memory, sessions, jobs, evals and the release pipeline;
Aviary renders them and forwards user actions.

```
browser (React SPA)
   |  /api/*            console API (FastAPI)
   |  /api/events       SSE snapshot stream (2s)
   v
Aviary process
   |- Runtime   -> canary.Config + canary.Agent  (in-process)
   |- EventHub  -> periodic snapshots to SSE subscribers
   |- /canary   -> full Canary admin API (mounted)
   v
CANARY_ROOT/           (optional; embedded state when absent)
```

## Embedding model

- One `Runtime` owns exactly one Canary `Agent`, created at startup.
- Chat, jobs, memory, evals and releases all call the same agent instance, so
  the console can never disagree with the harness.
- Without `--root`, Canary runs embedded with state in `./.canary/` and no
  release pipeline; with `--root`, the copy is a normal serve-mode Canary and
  health/releases become available.
- The full Canary admin API is mounted at `/canary` (loopback-local auth), so
  anything not exposed by the console API can still be reached.

## Request flow

1. The SPA calls `/api/chat/stream` (POST, SSE) or `/api/chat` (JSON).
2. The console resolves or creates a session (default name `console`).
3. `Agent.run` executes the turn; streaming events (`delta`, `tool`,
   `assistant`, ...) are forwarded verbatim as SSE frames.
4. A final `done` frame carries the response, session id and token usage.

## Live stats

- `EventHub` computes a full snapshot every 2 seconds and fans it out to
  subscribers over `/api/events` (`event: snapshot`).
- A snapshot contains status, sessions, jobs, recent evals, deploys and metric
  rows, so every view renders from one consistent payload.
- `/api/snapshot` returns the same payload on demand (initial render, refresh).

## Data sources

| View | Source |
| --- | --- |
| Dashboard | `status()`, `metrics.jsonl`, `deploys.jsonl`, evals |
| Chat | `Agent.run` events and session history |
| Agents | `SessionManager.list` + session detail |
| Jobs | `Jobs.list/status/log`, log files under `data/jobs/` |
| Memory | `Memory.search/all_entries/save/forget` |
| Evals & Releases | `Evals.results/run`, `Health.list_releases/revert` |

## Deliberate choices

- **No console database.** Every read goes to Canary's state store; the console
  keeps no duplicate state.
- **SSE, not WebSockets.** One-way live updates are enough and SSE survives
  proxies and reconnects (`EventSource` retry).
- **Vanilla SVG charts.** No chart dependency; the metrics are tiny and
  sparkline-shaped.
- **Fail soft.** A missing health/release component degrades to an explanatory
  message instead of a broken page.
