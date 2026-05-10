#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

if [ ! -f .wodouyao-runtime/server.pid ]; then
  echo "no pid file at .wodouyao-runtime/server.pid"
  exit 0
fi

PID="$(cat .wodouyao-runtime/server.pid)"

if ! kill -0 "$PID" 2>/dev/null; then
  echo "✗ pid $PID not running (stale pid file, removing)"
  rm -f .wodouyao-runtime/server.pid
  exit 0
fi

kill "$PID"
# Wait briefly for graceful shutdown.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done
if kill -0 "$PID" 2>/dev/null; then
  echo "  (didn't exit on SIGTERM, sending SIGKILL)"
  kill -9 "$PID" 2>/dev/null || true
fi

rm -f .wodouyao-runtime/server.pid
echo "✓ server stopped"
