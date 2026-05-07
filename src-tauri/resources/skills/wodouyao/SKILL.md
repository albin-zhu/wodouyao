---
name: wodouyao
description: "Collaborate with peer terminals inside a Wodouyao canvas via the `wodouyao` CLI. Use when the user wants to discover connected peers, spawn a new terminal on the canvas (e.g. 'open a new codex'), send commands to a peer, read a peer's output, register identity, fork the current agent session, change the canvas background, work with the shared task board (list/claim/complete tasks, find next task to do, work the backlog), or bootstrap a multi-agent workflow (PM + backend + frontend in one shot). Trigger phrases: connected peers, the other terminal, send to X, tell terminal Y to run, read what X is doing, delegate to a terminal, who am I on this canvas, open a new terminal, spawn a codex, create a worker terminal, fork this session, change background, task list, next task, claim task, mark task done, what should I work on, set up the workflow, bootstrap workflow, open a team, spin up a team, 开一个新的, 建一个新的, 换背景, 任务列表, 下一个任务, 认领任务, 完成任务, 我该干什么, 建一个团队, 起一套工作流, 一键搭团队."
---

# Wodouyao peer communication

`wodouyao` is the CLI for collaborating with other terminals on a Wodouyao canvas. It's pre-injected into every canvas terminal — just run it. Wires on the canvas act as the ACL: only wired peers are addressable.

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

Print the caller's current identity as JSON. Use to confirm registration stuck, or to get the caller's own terminal id.

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
- `--peer` — fork from a specific peer's terminal instead of the caller's. Must be wired.

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

## Canvas background

Agents can change the canvas background at runtime — useful for signalling session state ("thinking", "error"), matching a project's vibe, or letting the model flex with a custom GLSL shader.

### `wodouyao bg get`

Print the current background JSON.

### `wodouyao bg set <kind> [--source S] [--shader N] [--opacity F]`

Set the canvas background. Allowed `<kind>` values:

- `none` — blank canvas
- `image` — static image; `--source <path-or-url>`
- `video` — looping video; `--source <path-or-url>`
- `url` — iframe; `--source <https-url>` (useful for embedding an arbitrary animation)
- `shader` — WebGL2 fragment shader; `--shader <name>` where `<name>` is a file under `~/.wodouyao/shaders/<name>.frag`

`--opacity` takes a float 0–1 (applied as a dimming overlay on top of the background).

### `wodouyao bg shaders`

List shader names available under `~/.wodouyao/shaders/`, one per line.

### Writing your own shader

Drop a GLSL ES 3.00 fragment shader at `~/.wodouyao/shaders/<name>.frag`, then `wodouyao bg set shader --shader <name>`. Contract:

```glsl
#version 300 es
precision highp float;

uniform float u_time;        // seconds since load
uniform vec2  u_resolution;  // canvas size in pixels
uniform vec2  u_mouse;       // mouse position in pixels (origin bottom-left)

out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    // ... your art here ...
    outColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
}
```

Seeded examples: `matrix`, `starfield`, `wave`, `dust`, `plasma`, `aurora`. Tip: keep colors muted — the background sits behind terminals, and loud colors hurt readability. Multiply final RGB by ~0.3–0.5.

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
- `wodouyao team task take <team> <task-id>` — claim an unowned task (sets owner to the caller, status to `in_progress`).
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

## Tasks (workspace-shared task board)

Wodouyao keeps a task board scoped to the current workspace. Every terminal on the canvas shares the same backlog — agents pull work, claim it, report progress, and humans see status flip live in the TasksDrawer UI. **Use this instead of inventing your own ad-hoc todo lists.**

Lifecycle: `pending` (no owner) → `in_progress` (claimed) → `completed`.

### `wodouyao task list [--full|-l]`

Print every task in the current workspace. Columns: `id  status  subject  [owner=<term-id>]`. Cheap to run repeatedly. Pass `--full` (or `-l`) to also print each task's full `description` indented under its line — the output stays line-oriented so `grep` still works.

### `wodouyao task show <task-id>`

Print one task as JSON (same shape as `task next` / `task claim`). Use this whenever you need to re-read a task you already own — claim only prints the JSON once, and `task list` (without `--full`) shows just the subject. After `wodouyao task claim <id>`, the canonical recipe is "now `wodouyao task show <id>` and read the description before starting work".

```sh
wodouyao task show t_abc123 | python3 -c 'import json,sys; t=json.load(sys.stdin); print(t["description"])'
```

Exit codes: `0` — printed; non-zero with `task not found` — id is wrong or the task was deleted.

### `wodouyao task add <subject> [--desc D] [--blocked-by id1,id2]`

Create a pending task. Subject is the imperative one-liner ("Add login validation"). `--blocked-by` lists ids of tasks that must be `completed` before this one becomes pickable by `task next`.

### `wodouyao task next [--role X]`

Pick the **oldest pending unowned task** whose deps are satisfied (and whose `role_hint` matches `X` if given). Prints the task JSON to stdout. **Does NOT claim** — read it first, decide, then `claim`.

Exit codes:
- `0` — task printed
- `3` — nothing to do (no eligible task right now)

```sh
# Pull a backend-tagged task
task=$(wodouyao task next --role backend) || { echo "nothing to do"; exit 0; }
tid=$(echo "$task" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
wodouyao task claim "$tid"  # atomically take ownership
```

### `wodouyao task claim <task-id>`

Atomic ownership grab. Sets `owner_term_id` to the caller and flips status to `in_progress`. Requires `WODOUYAO_ID` (always set in canvas terminals).

**The full task JSON is printed to stdout on success — capture it and read the `description` and `acceptance` fields carefully before starting work.** `task list` only shows the subject (one-line title); the actual instructions live in `description`. If you didn't capture the claim output, run `wodouyao task show <task-id>` to re-fetch the JSON at any time.

```sh
task_json=$(wodouyao task claim "$tid") || { echo "lost it"; exit 1; }
echo "$task_json" | python3 -c 'import json,sys; t=json.load(sys.stdin); print(t["subject"]); print("---"); print(t["description"])'
# now do the actual work, guided by description + acceptance
```

Exit codes:
- `0` — claim succeeded, task JSON printed
- `5` — already claimed by someone else (the current task is printed to stderr)
- `404` — id not found

If `claim` returns 5, the task is gone — call `task next` again for the next candidate.

### `wodouyao task take <task-id>`

Legacy alias for "set owner regardless of current state". Prefer `claim` — it's atomic and won't steal a task that another agent is mid-execution on. Use `take` only when you deliberately want to reassign.

### `wodouyao task done <task-id>`

Mark `completed`. Unblocks any task that lists this one in `blocked_by`.

### `wodouyao task update <task-id> [--subject S] [--desc D] [--add-acceptance A]`

Edit fields on an existing task. Most useful for appending acceptance criteria as you discover them, or refining the subject after expansion.

### `wodouyao task remove <task-id>`

Delete the task entirely. Avoid unless the task was a duplicate or mistake — prefer `done` to leave the audit trail.

### Task documents — `wodouyao task doc <sub>`

Each task can carry any number of markdown docs (design notes, spec excerpts, PRD fragments, test plans). They live on disk at `$cwd/.wodouyao/tasks/<task-id>/docs/<name>.md` so agents can `cat`, `grep`, or open them in an editor without a special tool.

- `wodouyao task doc list <task-id>` — print one filename per line
- `wodouyao task doc add <task-id> <name> [--file PATH | --content TEXT]` — create/overwrite. `--file` reads from a path; `--content` takes inline text. Name auto-gets `.md` suffix if missing
- `wodouyao task doc cat <task-id> <name>` — print the doc content to stdout (use this or just `cat` the file — both work)
- `wodouyao task doc rm <task-id> <name>` — delete

```sh
# Attach your design notes to a task
wodouyao task doc add t_abc123 design --file design.md

# Later: skim everything attached
for d in $(wodouyao task doc list t_abc123); do
  echo "=== $d ==="
  wodouyao task doc cat t_abc123 "$d"
done
```

## Session recovery (advanced)

When you open a saved workspace, wodouyao rewrites each claude/codex terminal's launch command to a resume form (`claude -c` or `-r <id>`; `codex --resume`). To resume a *specific* session instead of "continue most recent", the terminal needs a `session_id` recorded.

### `wodouyao terminal set-session <session-id> | -`

Records a session id against the calling terminal (reads `WODOUYAO_ID`). Pass `-` to read JSON from stdin and extract `session_id` — this is the form Claude Code's SessionStart hook uses, since the hook payload arrives on stdin as `{"session_id":"...","transcript_path":"...",...}` (there is no `$CLAUDE_SESSION_ID` env var).

```json
// .claude/settings.local.json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "wodouyao terminal set-session -" }
        ]
      }
    ]
  }
}
```

Wodouyao's workflow bootstrap writes this hook into `.claude/settings.local.json` automatically (merging into any existing config, never overwriting). Once recorded, the next workspace save stamps `session_id` into the terminal layout, and reopen replays with `claude -r <id>`.

## Working a task (recommended pattern)

There are two entry points depending on how work reaches you. Both end at the same place: **you must read the `description` field of the task JSON before starting** — `task list` and the `subject` line are not enough.

### Path A — pulling from the backlog

```sh
# 1. Find work that fits this terminal's role
task_json=$(wodouyao task next --role "$MY_ROLE") || exit 0  # exit 3 = nothing to do
tid=$(echo "$task_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')

# 2. Claim atomically — bail if someone beat you to it
wodouyao task claim "$tid" >/dev/null || { echo "lost the race; trying again"; continue; }

# 3. Read what the task actually wants — DON'T skim, this is the brief.
#    `task show` is re-runnable, so this step works even if the claim output
#    scrolled past or you're resuming on a task you claimed earlier.
wodouyao task show "$tid" | python3 -c 'import json,sys; t=json.load(sys.stdin); print("SUBJECT:", t["subject"]); print(); print("DESCRIPTION:"); print(t["description"]); print(); print("ACCEPTANCE:", t.get("acceptance",[]))'

# 4. Do the work
# ... (edit files, run tests, whatever the description says)

# 5. Mark done
wodouyao task done "$tid"
```

**Always claim before doing the work** — `next` only queries; multiple agents calling `next` simultaneously will all see the same task.

### Path B — assigned by PM via `wodouyao send`

When a PM tells you "claim t_abc123 and work on it", you skip the `next` step and go straight to `claim`, then `task show` to read the brief:

```sh
wodouyao task claim "t_abc123" >/dev/null || { echo "claim failed"; exit 1; }
wodouyao task show "t_abc123" | python3 -c 'import json,sys; t=json.load(sys.stdin); print(t["description"])'
# ... do the work, then `task done t_abc123`
```

`task show` is idempotent and re-runnable, so re-reading the description any time during the work is fine — it stays the source of truth even after the original `claim` output has scrolled past. If you're a PM creating tasks for others, **put complete instructions and acceptance criteria in `--desc` at create time**; workers will read them via `task show` after claiming, so anything missing from the description has to be re-sent by hand over `wodouyao send`.

## Workflow bootstrap (multi-agent setup)

When the user says "set up the workflow", "open a team", "建一个团队", "起一套工作流", or similar — they want a multi-agent canvas spun up in one shot. Use:

### `wodouyao workflow init [--with role1,role2,...] [--mesh] [--cwd PATH]`

Spawns one Claude terminal per role, wires them in a star (or full mesh with `--mesh`), and injects per-role system prompts. Default role set when `--with` is omitted: `pm,backend,frontend`.

- `--with` — comma-separated roles. Built-ins: `pm`, `architect`, `backend`, `frontend`, `qa`, `devops`, `designer`, `planner`, `generator`, `evaluator`, `researcher`, `shell`. Users may have defined custom roles in settings — those work too.
- `--mesh` — wire every pair (full mesh). Default is a star around the first listed role (typically `pm`).
- `--cwd` — working directory for all spawned terminals; defaults to the current workspace cwd.

The PM role gets the orchestration prompt (parses PRDs, watches stuck tasks, summarizes board state). Other roles get a generic role-aware prompt that nudges them to use `wodouyao task next --role <theirs>`.

```sh
# Standard "PM + backend + frontend" team
wodouyao workflow init

# Add QA + devops
wodouyao workflow init --with pm,backend,frontend,qa,devops

# Mesh-wired research squad
wodouyao workflow init --with researcher,evaluator,planner --mesh
```

Prints the new terminal ids, one per line, in the order they were created. Exit 0 on success.

The UI Toolbar's **✨ Workflow** button does the exact same thing — both go through `POST /v1/workflow/bootstrap`.

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
| `wodouyao: no wire to <peer>` (exit 4) | ACL reject | User must draw a wire between the two terminals in the canvas UI. |
| `peers` prints nothing | Terminal is isolated | Same — needs a wire. |
| `whoami` returns id but no name/kind | Never called `hello` | Run `hello` to register. |

## Hard rules

- Never fabricate peer ids. Always list via `peers` first.
- Do not pipe `send` arguments through `eval` or unsanitized shell expansion — the user's text may contain backticks or `$(...)`.
- When the user asks for a capability the peer has not advertised (check its `capabilities` array), warn before calling — the peer may ignore it.
