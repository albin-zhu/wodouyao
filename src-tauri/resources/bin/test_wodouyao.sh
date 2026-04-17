#!/bin/sh
# Smoke test for the wodouyao shell CLI. Starts a mock hub, drives all
# subcommands, verifies exit codes and output. Exits 0 on success.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
CLI="$HERE/wodouyao"
MOCK="$HERE/mock_hub.py"

[ -x "$CLI" ] || { echo "missing or non-executable: $CLI" >&2; exit 1; }
[ -r "$MOCK" ] || { echo "missing: $MOCK" >&2; exit 1; }

TMPDIR_SMOKE=$(mktemp -d)
ENDPOINT_FILE="$TMPDIR_SMOKE/endpoint.json"
MOCK_LOG="$TMPDIR_SMOKE/mock.log"
MOCK_PID=""

cleanup() {
    if [ -n "$MOCK_PID" ]; then
        kill "$MOCK_PID" 2>/dev/null || true
        wait "$MOCK_PID" 2>/dev/null || true
    fi
    rm -rf "$TMPDIR_SMOKE"
}
trap cleanup EXIT INT TERM

fail() { echo "FAIL: $1" >&2; exit 1; }

# --- start mock hub -----------------------------------------------------------
python3 "$MOCK" >"$TMPDIR_SMOKE/port" 2>"$MOCK_LOG" &
MOCK_PID=$!

# Wait briefly for the port line to appear.
PORT=""
i=0
while [ $i -lt 50 ]; do
    if [ -s "$TMPDIR_SMOKE/port" ]; then
        PORT=$(head -n1 "$TMPDIR_SMOKE/port")
        break
    fi
    sleep 0.1
    i=$((i + 1))
done
[ -n "$PORT" ] || fail "mock hub did not print a port"

# --- write endpoint file ------------------------------------------------------
printf '{"url":"http://127.0.0.1:%s","token":"test-token"}\n' "$PORT" >"$ENDPOINT_FILE"

export WODOUYAO_ENDPOINT="$ENDPOINT_FILE"
export WODOUYAO_ID="peer-a"

# --- 1. peers -----------------------------------------------------------------
PEERS_OUT=$("$CLI" peers) || fail "peers exited non-zero"
echo "$PEERS_OUT" | grep -q '^peer-b$' || fail "peers output missing peer-b: $PEERS_OUT"

# --- 2. send ------------------------------------------------------------------
"$CLI" send peer-b "hello" >/dev/null || fail "send exited non-zero"

# --- 3. read ------------------------------------------------------------------
READ_OUT=$("$CLI" read peer-b) || fail "read exited non-zero"
echo "$READ_OUT" | grep -q 'mock output' || fail "read output missing 'mock output': $READ_OUT"

# --- 3a. whoami ---------------------------------------------------------------
WHO_OUT=$("$CLI" whoami) || fail "whoami exited non-zero"
echo "$WHO_OUT" | grep -q '"id"' || fail "whoami output missing id field: $WHO_OUT"
echo "$WHO_OUT" | grep -q 'peer-a' || fail "whoami output missing peer-a: $WHO_OUT"

# --- 3b. hello ----------------------------------------------------------------
"$CLI" hello --name "Test Agent" --kind shell --caps ping,delegate >/dev/null \
    || fail "hello exited non-zero"
grep -q '"id": "peer-a"' "$MOCK_LOG" || fail "hello body missing id in mock log"
grep -q 'Test Agent' "$MOCK_LOG" || fail "hello body missing name in mock log"

# --- 3c. team list ------------------------------------------------------------
TEAMS_OUT=$("$CLI" team list) || fail "team list exited non-zero"
echo "$TEAMS_OUT" | grep -q 'alpha' || fail "team list missing alpha: $TEAMS_OUT"

# --- 3d. team create ----------------------------------------------------------
NEW_ID=$("$CLI" team create beta) || fail "team create exited non-zero"
case $NEW_ID in
    team_*) : ;;
    *) fail "team create did not return team_* id: $NEW_ID" ;;
esac

# --- 3e. team info (by name, resolved via list) -------------------------------
INFO_OUT=$("$CLI" team info alpha) || fail "team info exited non-zero"
echo "$INFO_OUT" | grep -q '"name"' || fail "team info missing name field: $INFO_OUT"

# --- 3f. team join/leave/dissolve round-trip ----------------------------------
"$CLI" team join alpha --role worker >/dev/null \
    || fail "team join exited non-zero"
grep -q '"term_id": "peer-a"' "$MOCK_LOG" \
    || fail "team join body missing term_id in mock log"
grep -q '"role": "worker"' "$MOCK_LOG" \
    || fail "team join body missing role in mock log"
"$CLI" team leave alpha >/dev/null || fail "team leave exited non-zero"
"$CLI" team dissolve alpha >/dev/null || fail "team dissolve exited non-zero"

# --- 3g. team task add/list/take/done ----------------------------------------
TASK_ID=$("$CLI" team task add alpha "fix it") || fail "team task add exited non-zero"
case $TASK_ID in
    task_*) : ;;
    *) fail "team task add did not return task_* id: $TASK_ID" ;;
esac
"$CLI" team task list alpha >/dev/null || fail "team task list exited non-zero"
"$CLI" team task take alpha task_new >/dev/null || fail "team task take exited non-zero"
grep -q 'in_progress' "$MOCK_LOG" || fail "team task take missing in_progress in mock log"
"$CLI" team task done alpha task_new >/dev/null || fail "team task done exited non-zero"

# --- 3h. team bcast -----------------------------------------------------------
"$CLI" team bcast alpha "hello" >/dev/null || fail "team bcast exited non-zero"
grep -q '"from": "peer-a"' "$MOCK_LOG" || fail "team bcast body missing from in mock log"

# --- 3i. team dm --------------------------------------------------------------
"$CLI" team dm alpha lead "hey" >/dev/null || fail "team dm exited non-zero"
grep -q '"to_role": "lead"' "$MOCK_LOG" || fail "team dm body missing to_role in mock log"

# --- 3j. watch (real streaming, time-bounded) --------------------------------
if command -v timeout >/dev/null 2>&1; then
    WATCH_OUT=$(timeout 2 "$CLI" watch peer-b 2>&1 || true)
elif command -v gtimeout >/dev/null 2>&1; then
    WATCH_OUT=$(gtimeout 2 "$CLI" watch peer-b 2>&1 || true)
else
    WATCH_FILE="$TMPDIR_SMOKE/watch.out"
    ("$CLI" watch peer-b >"$WATCH_FILE" 2>&1) &
    WATCH_PID=$!
    (sleep 2; kill "$WATCH_PID" 2>/dev/null || true) &
    KILLER_PID=$!
    wait "$WATCH_PID" 2>/dev/null || true
    kill "$KILLER_PID" 2>/dev/null || true
    wait "$KILLER_PID" 2>/dev/null || true
    WATCH_OUT=$(cat "$WATCH_FILE")
fi
echo "$WATCH_OUT" | grep -q 'mock stream bytes' \
    || fail "watch did not stream mock bytes: $WATCH_OUT"

# --- 4. no env: must fail with exit 2 and "not running" -----------------------
unset WODOUYAO_ENDPOINT
unset WODOUYAO_ID
NO_ENV_OUT=$("$CLI" peers 2>&1 || echo "__exit=$?")
echo "$NO_ENV_OUT" | grep -q 'not running' || fail "expected 'not running' in stderr: $NO_ENV_OUT"

# Re-check exit code explicitly (can't rely on '&&' inside $(...) above alone).
set +e
"$CLI" peers >/dev/null 2>&1
RC=$?
set -e
[ "$RC" -eq 2 ] || fail "expected exit 2 when env missing, got $RC"

echo "OK: all smoke checks passed"
