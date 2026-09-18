#!/usr/bin/env bash
# Start Aviary: prepare the environment, build the web UI if needed, serve.
#
# Usage:
#   ./start.sh                     # foreground on http://127.0.0.1:8091
#   ./start.sh --daemon            # background, pid in .run/aviary.pid
#   ./start.sh stop                # stop a background instance
#   ./start.sh --root my-root --port 9000
#
# Environment defaults: AVIARY_ROOT (aviary-root), AVIARY_HOST (127.0.0.1),
# AVIARY_PORT (8091).
set -euo pipefail

cd "$(dirname "$0")"

ROOT="${AVIARY_ROOT:-aviary-root}"
HOST="${AVIARY_HOST:-127.0.0.1}"
PORT="${AVIARY_PORT:-8091}"
DAEMON=0
PIDFILE=".run/aviary.pid"
LOGFILE=".run/aviary.log"

if [ "${1:-}" = "stop" ]; then
  if [ ! -f "$PIDFILE" ]; then
    echo "aviary: not running (no $PIDFILE)"
    exit 0
  fi
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill -TERM "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
    echo "aviary: stopped pid $PID"
  else
    echo "aviary: pid $PID is not running"
  fi
  rm -f "$PIDFILE"
  exit 0
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --daemon) DAEMON=1; shift ;;
    --root) ROOT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "aviary: unknown option $1" >&2
      exit 2
      ;;
  esac
done

if ! command -v uv >/dev/null 2>&1; then
  echo "aviary: uv is required (https://github.com/astral-sh/uv)" >&2
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "aviary: creating Python environment"
  uv sync --extra dev
fi

if [ ! -f "web/dist/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "aviary: building web UI"
    (cd web && npm install --no-audit --no-fund && npm run build)
  else
    echo "aviary: web/dist missing and npm not found; serving API only" >&2
  fi
fi

if [ ! -f "$ROOT/shared/harness.yaml" ]; then
  echo "aviary: initializing Canary root at $ROOT"
  .venv/bin/python -m aviary init --root "$ROOT" --no-embedding
fi

if [ "$DAEMON" = "1" ]; then
  mkdir -p .run
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "aviary: already running (pid $(cat "$PIDFILE")) at http://$HOST:$PORT"
    exit 0
  fi
  nohup setsid .venv/bin/python -m aviary serve --root "$ROOT" --host "$HOST" --port "$PORT" \
    >>"$LOGFILE" 2>&1 &
  echo $! >"$PIDFILE"
  echo "aviary: running at http://$HOST:$PORT (pid $(cat "$PIDFILE"), log $LOGFILE)"
  echo "aviary: stop with ./start.sh stop"
  exit 0
fi

echo "aviary: serving on http://$HOST:$PORT (Ctrl+C to stop)"
exec .venv/bin/python -m aviary serve --root "$ROOT" --host "$HOST" --port "$PORT"
