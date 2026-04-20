---
name: wodouyao
description: "Collaborate with peer terminals inside a Wodouyao canvas via the `wodouyao` CLI. Use when running inside a Wodouyao terminal (env var WODOUYAO_ID is set) and the user wants to discover connected peers, spawn a new terminal on the canvas (e.g. 'open a new codex'), send commands or keystrokes to a peer terminal, read a peer's recent output, register this agent's identity so other peers can see its name and capabilities, or check who this agent is on the canvas. Trigger on phrases such as: connected peers, the other terminal, send to X, tell terminal Y to run, read what X is doing, register identity, delegate to a terminal, who am I on this canvas, open a new terminal, spawn a codex, create a worker terminal, 开一个新的, 建一个新的."
---

# Wodouyao peer communication

Agents running inside a Wodouyao terminal talk to other wired terminals through the `wodouyao` CLI, which wraps a local HTTP hub. Wires are the ACL — only wired peers are addressable.

## Preflight

Confirm the environment before suggesting any CLI call. If these checks fail, say so and stop — do not improvise.

```sh
test -n "$WODOUYAO_ID" && test -n "$WODOUYAO_ENDPOINT" && command -v wodouyao
```

`$WODOUYAO_ID` is the caller's terminal id. Surface it if the user asks "who am I".

## Core workflow

1. **Register on first use** — run `wodouyao hello` once per session so peers see a human-readable identity. See the "hello" section below for flags.
2. **Discover peers** — `wodouyao peers` prints one peer id per line.
3. **Spawn a new peer** — `wodouyao spawn` conjures a fresh terminal on the canvas (auto-wired from caller), prints the new id. Useful when the user says "开一个新的 codex" / "create a worker terminal".
4. **Act on a peer** — `wodouyao send` to drive input, `wodouyao read` to observe output.

Call sites chain naturally: `spawn` (or `peers` for existing) → pick id → `send` → wait briefly → `read` → report back.

## Subcommands

### `wodouyao hello [--name N] [--kind K] [--caps a,b,c]`

Register this terminal's identity in the hub's in-memory registry (cleared on app restart — re-run at session start).

- `--name` — human-readable label shown to peers (e.g. `"Claude on wodouyao repo"`)
- `--kind` — agent family: `claude` | `codex` | `opencode` | `shell` | custom string
- `--caps` — comma-separated capability verbs. Built-ins: `ping`, `whoami`, `delegate`, `read-scrollback`, `shell-exec`. Custom verbs MUST be prefixed `x.` (e.g. `x.claude.edit-file`).

Idempotent — re-running overwrites.

### `wodouyao whoami`

Print the caller's current identity as JSON. Use to confirm registration stuck, or to surface `$WODOUYAO_ID` reliably without shelling through env.

### `wodouyao peers`

List wired peer ids, one per line. Empty output = no wires. Order reflects topology insertion, not alphabetical.

### `wodouyao spawn [--name N] [--kind K] [--command C] [--cwd P] [--no-wire]`

Create a new terminal on the canvas and print its id to stdout. Default behaviour auto-creates a wire from the caller to the new terminal so the caller can immediately `send`/`read` it.

- `--name` — label shown on the new terminal's title bar
- `--kind` — agent family; purely metadata, does not affect the shell
- `--command` — initial command to run in the new terminal (e.g. `codex`, `claude`, `npm test`)
- `--cwd` — working directory; falls back to the current workspace default
- `--no-wire` — skip the auto-wire (terminal appears isolated; caller has to wire manually via UI)

Common pattern for "open a new codex":

```sh
new_id=$(wodouyao spawn --name "Codex" --kind codex --command codex)
# new_id is now wired to the caller; ready for send/read
```

Failure: exit 1 with "frontend not ready yet" if the app just booted and the renderer hasn't attached — retry after a moment.

### `wodouyao fork --kind claude|codex [--name N] [--peer <id>]`

Fork the current (or a named peer's) agent session into a fresh canvas terminal at the same cwd. The new terminal resumes the session then has the agent's `/fork` (or `/branch`) slash command sent to it automatically.

- `--kind` **(required)** — `claude` or `codex`. Determines the resume command and slash command used.
- `--name` — label for the new terminal and the argument passed to the agent's fork command. Defaults to empty (agent picks its own name).
- `--peer` — fork from a specific peer instead of `$WODOUYAO_ID`. Must be wired.

What happens under the hood:
1. Hub spawns a new terminal running `claude --dangerously-skip-permissions -c` (claude) or `codex --dangerously-bypass-approvals-and-sandbox --resume` (codex).
2. A wire is inserted from the source terminal to the new one so you can send/read immediately.
3. The CLI waits ~1.5 s for the agent TUI to start up.
4. Sends `/fork "name"` (claude) or `/fork "name"` (codex) to the new terminal — Enter is appended automatically.
5. Prints the new terminal id.

```sh
# Fork this claude session into a branch called "refactor"
new_id=$(wodouyao fork --kind claude --name "refactor")

# Fork a peer's codex session
new_id=$(wodouyao fork --kind codex --peer "$other_id" --name "experiment")
```

Exit codes: `0` success, `1` unknown kind or hub error, `2` env unset, `4` no wire to peer.

## Team mode

Terminals can be grouped into named teams. The hub tracks members and an accent palette; the canvas renders the team outline and colorizes wires between members. Team commands all live under `wodouyao team <sub>`.

- `wodouyao team create <name> [--palette blue|sunset|forest] [--as-lead]` — create a team; prints the new id (e.g. `team_abc123...`). `--as-lead` registers the caller as lead at creation time.
- `wodouyao team list` — one line per team: `<id>  <name>  <n> members  palette=<key>`.
- `wodouyao team info <name-or-id>` — pretty-printed team JSON (id, name, palette, members, created_at).
- `wodouyao team join <name-or-id> [--role worker|lead|observer]` — caller joins the team. Silent on success.
- `wodouyao team leave <name-or-id>` — caller leaves. Silent on success.
- `wodouyao team dissolve <name-or-id>` — destroy the team; evicted members fall back to solo. Silent on success.

Any `<name-or-id>` argument accepts either the raw id (matches `^team_[a-f0-9]+$`) or a human name; the CLI resolves names via `GET /v1/teams` before calling the action endpoint. Unknown names exit 4 with `team not found: <name>`.

`spawn` accepts `--team <name-or-id>` and `--team-role <role>` to create a pre-joined terminal in one call — useful when fan-out spawning workers:

```sh
lead=$(wodouyao team create reviewers --as-lead)
for i in 1 2 3; do
    wodouyao spawn --name "worker-$i" --command claude \
        --team "$lead" --team-role worker >/dev/null
done
```

Exit codes follow the rest of the CLI: `0` success, `2` env unset, `3` malformed endpoint, `4` not found / 409 conflict, `1` other.

## Team collaboration

Once a team exists, members can share tasks and talk to each other without needing direct wires. All traffic fans out through the hub using each peer's registered role.

- `wodouyao team task add <team> "<subject>" [--desc "..."] [--blocked-by id,id]` — create a work item. Prints the new `task_<id>` on stdout.
- `wodouyao team task list <team>` — one line per task: `<id>  <status>  <subject>  [owner=<term>]`. Empty output means no tasks yet.
- `wodouyao team task take <team> <task-id>` — claim an unowned task (sets `owner=$WODOUYAO_ID`, `status=in_progress`).
- `wodouyao team task done <team> <task-id>` — mark completed.
- `wodouyao team task assign <team> <task-id> <peer-id>` — assign to a specific member; used by leads to delegate.
- `wodouyao team bcast <team> "<msg>"` — send `<msg>` to every team member's PTY (keys mode, like `wodouyao send`). Partial failures go to stderr.
- `wodouyao team dm <team> <role> "<msg>"` — send only to members whose role matches `<role>` (e.g. `worker`, `lead`).

```
# lead delegates work
lead$ wodouyao team task add alpha "implement login"
task_xyz123
lead$ wodouyao team dm alpha worker "see new task"
# worker picks it up
worker$ wodouyao team task take alpha task_xyz123
```

### `wodouyao send <peer> [--raw|--keys] <text...>`

Write to a peer's PTY stdin.

- Default mode `--keys`: tmux `send-keys` style. Supports key literals like `Enter`, `C-c`, `M-x`, arrows, `PageUp`, etc. See [send-keys reference](references/send-keys.md) for the full table — load only when sending non-text keystrokes.
- `--raw`: bytes are written verbatim. Use when forwarding pre-formatted data (JSON, escape sequences).
- **Enter is always appended** in `--keys` mode. Every modern agent CLI (claude, codex, opencode) queues messages internally, so a trailing Enter is safe even if the peer is still mid-task. If you need to send a control key alone or hold input without submitting, use `--raw` and emit the raw bytes yourself.

```sh
# Run a command — Enter is implicit.
wodouyao send bob "pwd"

# Raw control byte (no Enter).
printf '\003' | wodouyao send bob --raw "$(cat)"
```

Exit codes: `0` success, `2` env unset, `3` malformed endpoint file, `4` no wire to peer (HTTP 403), `1` other.

### `wodouyao read <peer> [--bytes N]`

Fetch the tail of the peer's output ring buffer. Default `N=16384`, server-side cap 65536. Output is raw bytes (may include ANSI escapes and partial lines).

Typical pattern after `send`:

```sh
wodouyao send bob "pwd"
sleep 0.3                 # let the peer execute
wodouyao read bob --bytes 4096
```

Do not poll in a tight loop — the buffer updates as the peer produces output, not on any event.

### `wodouyao watch <peer>`

Stream a peer's output in real time until you Ctrl+C. Useful when you want
to follow a long-running command's output without polling `read`. Wire ACL
applies — must have a wire to the peer.

Exits 0 on clean server close (peer terminal destroyed), non-zero on
connection errors.

## Delegation pattern

When the user says "ask the other terminal to do X":

1. `wodouyao peers` → confirm target exists
2. `wodouyao send <peer> "<command>"` (Enter is auto-appended)
3. Pause (start with `sleep 0.5`, extend if the command is slow)
4. `wodouyao read <peer>`
5. Decide: done, need more time, or error

Capture both the command echo and its output in `read` — do not assume the peer's prompt layout. If the read tail is just the prompt returning, the command finished silently.

## Failure modes to recognize

| Symptom | Cause | Resolution |
|---|---|---|
| `wodouyao: not running inside a wodouyao terminal` (exit 2) | Env vars unset | Not in a wodouyao-spawned shell. Stop and tell user. |
| `wodouyao: no wire to <peer>` (exit 4) | ACL reject | User must draw a wire between the two terminals in the canvas UI. |
| `peers` prints nothing | Terminal is isolated | Same — needs a wire. |
| `whoami` returns id but no name/kind | Never called `hello` | Run `hello` to register. |

## Hard rules

- Never fabricate peer ids. Always list via `peers` first.
- Never paste raw `$WODOUYAO_ENDPOINT` file contents to the user — it holds the hub bearer token.
- Do not pipe `send` arguments through `eval` or unsanitized shell expansion — the user's text may contain backticks or `$(...)`.
- When the user asks for a capability the peer has not advertised (check its `capabilities` array), warn before calling — the peer may ignore it.
