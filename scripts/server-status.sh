#!/usr/bin/env bash
cd "$(dirname "$0")/.."
if [ -f .wodouyao-runtime/server.pid ] && kill -0 "$(cat .wodouyao-runtime/server.pid)" 2>/dev/null; then
  PID="$(cat .wodouyao-runtime/server.pid)"
  echo "✓ running (pid: $PID)"
  echo
  grep -A 1 "listening at:" .wodouyao-runtime/server.log 2>/dev/null || true
  exit 0
fi
echo "✗ not running"
[ -f .wodouyao-runtime/server.pid ] && echo "  (stale pid file present — run 'bun run server:stop' to clean up)"
exit 1
