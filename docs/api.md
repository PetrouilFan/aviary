# Console HTTP API

All endpoints are JSON unless noted. Errors use `{"detail": "..."}` from
FastAPI, or `{"error": "..."}` where the console handles the failure itself.

## Status and live events

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/status` | Agent identity, tokens today, session/job/tool/memory counts, health, releases |
| GET | `/api/snapshot` | Full snapshot: status + sessions + jobs + evals + deploys + metrics |
| GET | `/api/events` | SSE stream of snapshots every 2s (named event `snapshot`) |
| GET | `/api/metrics?limit=` | Raw `metrics.jsonl` tail |
| GET | `/api/deploys?limit=` | Raw `deploys.jsonl` tail |
| GET | `/api/tools` | Tool registry info (built-ins, extensions, disabled, profiles) |

## Chat

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/chat` | One turn: `{message, session_id?, model?}` -> `{response, session_id, usage}` |
| POST | `/api/chat/stream` | Same, streamed as SSE: `turn_start`, `delta`, `tool`, `assistant`, then `done` or `error` |

Without `session_id` the console creates a session named `console`, so chats
are visible in the Agents view and can be continued later.

## Sessions

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/sessions?include_archived=` | List sessions (agents and subagents) |
| GET | `/api/sessions/{id}?lines=` | Info, messages, transcript, recent events, pending inbox |
| GET | `/api/sessions/{id}/events` | SSE of session events; supports `Last-Event-ID` |
| POST | `/api/sessions/{id}/cancel` | Request cancellation (idempotent) |
| POST | `/api/sessions/{id}/inject` | Queue a `[system]` message into a session; 429 on rate limit |

## Jobs

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/jobs?status=` | List jobs |
| GET | `/api/jobs/{id}` | Status plus last log lines |
| GET | `/api/jobs/{id}/log?offset=&lines=` | Paginated log lines |
| POST | `/api/jobs/{id}/kill` | Terminate the job process group |

## Memory

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/memory?q=&k=&tag=` | Hybrid search (embedding + tags + recency) |
| GET | `/api/memory/entries?include_archived=` | All entries, newest first |
| POST | `/api/memory` | Save `{body, tags?, entry_id?, importance?}` |
| DELETE | `/api/memory/{id}` | Archive an entry (idempotent) |

## Evals and releases

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/evals/results?limit=` | Recent eval results from `evals.jsonl` |
| GET | `/api/evals/tasks` | Held-out task definitions from `shared/evals/` |
| POST | `/api/evals/run` | Run the held-out set and write a summary |
| GET | `/api/releases` | Release dirs, current symlink target, green tags |
| POST | `/api/releases/revert` | Revert to a previous green release |

## Full Canary API

`/canary/*` mounts Canary's own admin API (`/canary/health`, `/canary/ready`,
`/canary/agent/status`, sessions, evals, propose/revert, ...). It is reachable
from loopback clients without a token; non-loopback access requires
`HARNESS_API_KEY`.
