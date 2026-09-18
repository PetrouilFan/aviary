# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-18

### Added

- Embedded Canary runtime wrapper with status/snapshot aggregations.
- Console HTTP API: status, snapshot, SSE event stream, chat (sync + streaming),
  sessions (list/detail/events/cancel/inject), jobs (list/status/log/kill),
  memory (search/entries/save/forget), evals (results/tasks/run), releases
  (list/revert), metrics, deploys, tools.
- React + TypeScript single-page console with chat, agent/subagent tree,
  dashboard, jobs, memory and evals/releases views.
- `aviary serve`, `aviary init` and `aviary status` commands.
- Full Canary admin API mounted at `/canary`.
- Canary git submodule tracking `main`.

[0.1.0]: https://github.com/PetrouilFan/aviary/releases/tag/v0.1.0
