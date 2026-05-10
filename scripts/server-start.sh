#!/usr/bin/env bash
# Daemonize wodouyao-server so it survives the launching shell.
# Writes:
#   .wodouyao-runtime/server.pid   — pid of the detached process
#   .wodouyao-runtime/server.log   — combined stdout + stderr
# Stop with `bun run server:stop`.
set -e

cd "$(dirname "$0")/.."
mkdir -p .wodouyao-runtime

if [ -f .wodouyao-runtime/server.pid ] && kill -0 "$(cat .wodouyao-runtime/server.pid)" 2>/dev/null; then
  echo "✗ already running (pid: $(cat .wodouyao-runtime/server.pid))"
  echo "  use 'bun run server:stop' first, or 'bun run server:status' to inspect"
  exit 1
fi

echo "→ vite build"
bunx vite build >/dev/null

echo "→ cargo build --release wodouyao-server"
cargo build --release \
  --manifest-path src-tauri/Cargo.toml \
  --no-default-features \
  --features web-runtime \
  --bin wodouyao-server \
  2>&1 | grep -vE '^\s+(Compiling|Finished|Checking)' || true

export WODOUYAO_DIST_DIR="$PWD/dist"
export WODOUYAO_RESOURCE_DIR="$PWD/src-tauri"

echo "→ starting daemon"
nohup ./src-tauri/target/release/wodouyao-server \
  > .wodouyao-runtime/server.log 2>&1 &
PID=$!
echo "$PID" > .wodouyao-runtime/server.pid

# Wait briefly for the server to bind so we can echo its URL line.
for _ in 1 2 3 4 5 6 7 8; do
  if grep -q "listening at:" .wodouyao-runtime/server.log 2>/dev/null; then
    break
  fi
  sleep 0.25
done

echo
if ! kill -0 "$PID" 2>/dev/null; then
  echo "✗ daemon died during startup; tail of log:"
  echo
  tail -20 .wodouyao-runtime/server.log 2>/dev/null
  rm -f .wodouyao-runtime/server.pid
  exit 1
fi
echo "✓ wodouyao-server detached (pid: $PID)"
echo
grep -A 1 "listening at:" .wodouyao-runtime/server.log 2>/dev/null || true
echo
echo "  log:    bun run server:logs"
echo "  stop:   bun run server:stop"
echo "  status: bun run server:status"
