"""Aviary command line: serve the console, bootstrap a Canary root, check status."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

DEFAULT_PORT = 8091


def _print_json(obj: object) -> None:
    print(json.dumps(obj, indent=2, default=str))


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    from .app import create_app
    from .runtime import Runtime

    root = Path(args.root) if args.root else None
    state = Path(args.state_dir) if args.state_dir else None
    runtime = Runtime(root, state_path=state, ephemeral=args.ephemeral)
    errors = runtime.config.errors
    if errors:
        print("configuration warnings:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
    app = create_app(runtime)
    print(f"Aviary {args.host}:{args.port}")
    print(f"  root:  {runtime.config.root or '(embedded)'}")
    print(f"  state: {runtime.config.state_path}")
    print(f"  agent: {runtime.agent.agent_id} release={runtime.config.release_id}")
    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level)
    finally:
        runtime.close()
    return 0


def cmd_init(args: argparse.Namespace) -> int:
    from canary.cli import main as canary_main

    argv = ["init", "--root", str(Path(args.root).resolve())]
    if args.no_embedding:
        argv.append("--no-embedding")
    if args.force:
        argv.append("--force")
    print(f"aviary: delegating to `canary {' '.join(argv)}`")
    return canary_main(argv)


def cmd_status(args: argparse.Namespace) -> int:
    import httpx

    url = f"http://{args.host}:{args.port}/api/status"
    try:
        response = httpx.get(url, timeout=1.5)
        if response.status_code == 200:
            payload = response.json()
            if args.json:
                _print_json(payload)
            else:
                agent = payload.get("agent", {})
                tokens = payload.get("tokens_today", {})
                print(f"server:   {url} (running)")
                print(f"agent:    {agent.get('agent_id')} release={agent.get('release_id')}")
                print(f"tokens:   in={tokens.get('tokens_in')} out={tokens.get('tokens_out')}")
                print(f"sessions: {payload.get('sessions')}")
                print(f"jobs:     {payload.get('jobs')}")
            return 0
    except httpx.HTTPError:
        pass

    from .runtime import Runtime

    root = Path(args.root) if args.root else None
    runtime = Runtime(root, state_path=Path(args.state_dir) if args.state_dir else None)
    try:
        payload = runtime.status()
    finally:
        runtime.close()
    if args.json:
        _print_json(payload)
        return 0
    agent = payload["agent"]
    print(f"server:   not running on {url}")
    print(f"agent:    {agent.get('agent_id')} release={agent.get('release_id')}")
    print(f"root:     {agent.get('root') or '(embedded)'}")
    print(f"sessions: {payload['sessions']}")
    print(f"jobs:     {payload['jobs']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="aviary", description="Web console for Canary agents")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="run the console and its embedded Canary agent")
    serve.add_argument("--root", help="CANARY_ROOT of the copy to manage")
    serve.add_argument("--state-dir", help="state store (defaults to ROOT/shared or ./.canary)")
    serve.add_argument("--ephemeral", action="store_true", help="throwaway state in a temp dir")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    serve.add_argument("--log-level", default="info")
    serve.set_defaults(func=cmd_serve)

    init = sub.add_parser("init", help="bootstrap a new Canary root (delegates to canary init)")
    init.add_argument("--root", required=True)
    init.add_argument("--no-embedding", action="store_true")
    init.add_argument("--force", action="store_true")
    init.set_defaults(func=cmd_init)

    status = sub.add_parser(
        "status", help="console/agent status (server if running, local otherwise)"
    )
    status.add_argument("--root")
    status.add_argument("--state-dir")
    status.add_argument("--host", default="127.0.0.1")
    status.add_argument("--port", type=int, default=DEFAULT_PORT)
    status.add_argument("--json", action="store_true")
    status.set_defaults(func=cmd_status)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    os.environ.setdefault("AVIARY_CONSOLE", "1")
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
