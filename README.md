# Aviary

A web console for [Canary](https://github.com/PetrouilFan/canary) agent harnesses.
Chat with the agent, watch it work, and inspect everything it knows: live turns and
tool calls, the agent/subagent tree, token and session statistics, jobs, memory,
evals and releases.

Aviary embeds a Canary copy in its own process (Canary stays the agent runtime;
Aviary is the window into it) and also mounts Canary's full admin API under
`/canary` for advanced use.

## Status

Early development (`0.1.0`). Canary is included as a git submodule so a checkout of
Aviary always tracks a working Canary revision.

## Requirements

- Python >= 3.12 and [`uv`](https://github.com/astral-sh/uv)
- Node.js >= 20 (only to build the web UI)
- A POSIX filesystem for Canary's locking/release guarantees

## Quick start

```bash
git clone --recurse-submodules https://github.com/PetrouilFan/aviary.git
cd aviary
uv sync --extra dev

# Bootstrap a Canary root (or reuse an existing one with --root)
uv run aviary init --root ./aviary-root

# Build the web UI (first time only; or use the Vite dev server)
cd web && npm install && npm run build && cd ..

# Serve the console + embedded agent
uv run aviary serve --root ./aviary-root --port 8091
```

Open <http://127.0.0.1:8091>.

To update the embedded Canary:

```bash
git submodule update --remote --merge canary
```

## Development

- Backend: `uv run pytest` (API tests use Canary's mock model; no network).
- Frontend: `cd web && npm run dev` (proxies `/api` and `/canary` to
  `127.0.0.1:8091`).
- Lint: `uv run ruff check src tests`, `cd web && npm run lint`.

## Documentation

- [docs/architecture.md](docs/architecture.md) - how the console embeds Canary
- [docs/api.md](docs/api.md) - console HTTP API used by the web UI

## License

MIT. See [LICENSE](LICENSE).
