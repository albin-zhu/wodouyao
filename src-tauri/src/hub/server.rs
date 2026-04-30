use std::io::{self, Cursor};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server, StatusCode};
use uuid::Uuid;

use super::endpoint::{self, EndpointFile};
use super::identity::{Identity, IdentityRegistry};
use super::keys;
use super::team::{Role, TaskPatch, TeamRegistry};
use super::topology::{Wire, WireTopology};
use crate::file_nodes::FileNodeStore;
use crate::notes::{NoteCreate, NotePatch as NoteStorePatch, NoteStore};
use crate::pty::manager::PtyManager;
use crate::task_boards::TaskBoardStore;
use crate::tasks::{ClaimResult, TaskCreate, TaskPatch as TaskStorePatch, TaskStore};

pub type AppHandleSlot = Arc<OnceLock<AppHandle>>;

#[derive(Clone)]
pub struct HubHandle {
    pub url: String,
    pub token: String,
    pub endpoint_path: std::path::PathBuf,
}

#[allow(clippy::too_many_arguments)]
pub fn start(
    topology: WireTopology,
    identities: IdentityRegistry,
    team_registry: TeamRegistry,
    task_store: TaskStore,
    note_store: NoteStore,
    file_node_store: FileNodeStore,
    task_board_store: TaskBoardStore,
    pty_manager: Arc<Mutex<PtyManager>>,
    app_handle: AppHandleSlot,
) -> Result<HubHandle, String> {
    let server = Server::http("127.0.0.1:0")
        .map_err(|e| format!("hub bind failed: {}", e))?;
    let addr = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "hub server has no ip address".to_string())?;
    let url = format!("http://{}", addr);
    let token = Uuid::new_v4().to_string();

    let endpoint_path = endpoint::path();
    endpoint::write(
        &endpoint_path,
        &EndpointFile {
            url: url.clone(),
            token: token.clone(),
        },
    )?;

    let token_for_thread = token.clone();
    thread::spawn(move || {
        for request in server.incoming_requests() {
            handle(
                request,
                &topology,
                &identities,
                &team_registry,
                &task_store,
                &note_store,
                &file_node_store,
                &task_board_store,
                &pty_manager,
                &app_handle,
                &token_for_thread,
            );
        }
    });

    Ok(HubHandle {
        url,
        token,
        endpoint_path,
    })
}

#[allow(clippy::too_many_arguments)]
fn handle(
    request: tiny_http::Request,
    topology: &WireTopology,
    identities: &IdentityRegistry,
    team_registry: &TeamRegistry,
    task_store: &TaskStore,
    note_store: &NoteStore,
    file_node_store: &FileNodeStore,
    task_board_store: &TaskBoardStore,
    pty_manager: &Arc<Mutex<PtyManager>>,
    app_handle: &AppHandleSlot,
    token: &str,
) {
    if !is_authorised(&request, token) {
        let _ = request.respond(empty(401));
        return;
    }

    let url = request.url().to_string();
    let method = request.method().clone();
    let (path, query) = split_query(&url);

    match (&method, path) {
        (&Method::Get, "/v1/peers") => peers(
            request,
            topology,
            identities,
            pty_manager,
            note_store,
            file_node_store,
            task_board_store,
            &query,
        ),
        (&Method::Get, "/v1/whoami") => whoami(request, identities, &query),
        (&Method::Post, "/v1/self") => register_self(request, identities),
        (&Method::Post, "/v1/spawn") => spawn(request, topology, team_registry, app_handle),
        (&Method::Post, "/v1/fork") => fork(request, topology, identities, app_handle),
        (&Method::Post, "/v1/workflow/bootstrap") => {
            workflow_bootstrap(request, topology, app_handle)
        }
        (&Method::Post, "/v1/send") => send(request, topology, pty_manager, identities),
        (&Method::Get, "/v1/read") => read(
            request,
            topology,
            pty_manager,
            note_store,
            file_node_store,
            task_board_store,
            task_store,
            &query,
        ),
        (&Method::Get, "/v1/watch") => watch(request, topology, pty_manager, &query),
        (&Method::Post, "/v1/teams") => teams_create(request, team_registry, app_handle),
        (&Method::Get, "/v1/teams") => teams_list(request, team_registry),
        (&Method::Get, "/v1/tasks") => tasks_list_route(request, task_store),
        (&Method::Post, "/v1/tasks") => tasks_create_route(request, task_store, app_handle),
        (&Method::Get, "/v1/tasks/next") => {
            tasks_next_route(request, task_store, identities, &query)
        }
        (&Method::Get, "/v1/wires") => wires_list_route(request, topology),
        (&Method::Post, "/v1/wires") => wires_create_route(request, topology, app_handle),
        (&Method::Get, "/v1/terminals") => terminals_list_route(request, pty_manager, identities),
        (&Method::Get, "/v1/notes") => notes_list_route(request, note_store),
        (&Method::Post, "/v1/notes") => notes_create_route(request, note_store, app_handle),
        (&Method::Post, "/v1/background") => background_set(request, app_handle),
        (&Method::Get, "/v1/background") => background_get(request),
        (&Method::Get, "/v1/shaders") => shaders_list_route(request),
        _ => {
            if let Some(task_id) = path.strip_prefix("/v1/tasks/") {
                // /v1/tasks/{id}/claim — atomic owner assignment
                if let Some(id) = task_id.strip_suffix("/claim") {
                    if matches!(&method, &Method::Post) {
                        tasks_claim_route(request, task_store, identities, id, app_handle);
                    } else {
                        let _ = request.respond(empty(404));
                    }
                } else {
                    match &method {
                        &Method::Patch => tasks_patch_route(request, task_store, task_id, app_handle),
                        &Method::Delete => tasks_delete_route(request, task_store, task_id, app_handle),
                        _ => {
                            let _ = request.respond(empty(404));
                        }
                    }
                }
            } else if let Some(wire_id) = path.strip_prefix("/v1/wires/") {
                match &method {
                    &Method::Delete => wires_delete_route(request, topology, wire_id, app_handle),
                    _ => {
                        let _ = request.respond(empty(404));
                    }
                }
            } else if let Some(term_id) = path.strip_prefix("/v1/terminals/") {
                match &method {
                    &Method::Delete => terminals_close_route(
                        request, pty_manager, topology, identities, term_id, app_handle,
                    ),
                    _ => {
                        let _ = request.respond(empty(404));
                    }
                }
            } else if let Some(note_id) = path.strip_prefix("/v1/notes/") {
                match &method {
                    &Method::Patch => notes_patch_route(request, note_store, note_id, app_handle),
                    &Method::Delete => notes_delete_route(request, note_store, note_id, app_handle),
                    _ => {
                        let _ = request.respond(empty(404));
                    }
                }
            } else if let Some((team_id, sub)) = parse_team_path(path) {
                match (&method, sub) {
                    (&Method::Get, None) => team_get(request, team_registry, team_id),
                    (&Method::Post, Some("join")) => {
                        team_join(request, team_registry, topology, team_id, app_handle)
                    }
                    (&Method::Post, Some("leave")) => {
                        team_leave(request, team_registry, team_id, app_handle)
                    }
                    (&Method::Post, Some("dissolve")) => team_dissolve(
                        request,
                        team_registry,
                        topology,
                        identities,
                        pty_manager,
                        team_id,
                        app_handle,
                    ),
                    (&Method::Get, Some("tasks")) => {
                        team_tasks_list(request, team_registry, team_id)
                    }
                    (&Method::Post, Some("tasks")) => {
                        team_tasks_create(request, team_registry, team_id, app_handle)
                    }
                    (&Method::Post, Some("broadcast")) => team_broadcast(
                        request,
                        team_registry,
                        pty_manager,
                        identities,
                        team_id,
                        app_handle,
                    ),
                    (&Method::Post, Some("dm")) => team_dm(
                        request,
                        team_registry,
                        pty_manager,
                        identities,
                        team_id,
                        app_handle,
                    ),
                    (&Method::Patch, Some(sub)) => {
                        if let Some(task_id) = sub.strip_prefix("tasks/") {
                            team_tasks_patch(
                                request,
                                team_registry,
                                team_id,
                                task_id,
                                app_handle,
                            )
                        } else {
                            let _ = request.respond(empty(404));
                        }
                    }
                    _ => {
                        let _ = request.respond(empty(404));
                    }
                }
            } else {
                let _ = request.respond(empty(404));
            }
        }
    }
}

fn parse_team_path(path: &str) -> Option<(&str, Option<&str>)> {
    path.strip_prefix("/v1/teams/").map(|rest| match rest.split_once('/') {
        Some((id, sub)) => (id, Some(sub)),
        None => (rest, None),
    })
}

fn is_authorised(request: &tiny_http::Request, token: &str) -> bool {
    let expected = format!("Bearer {}", token);
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("authorization"))
        .map(|h| h.value.as_str() == expected)
        .unwrap_or(false)
}

fn split_query(url: &str) -> (&str, Vec<(String, String)>) {
    match url.split_once('?') {
        Some((path, qs)) => (path, parse_query(qs)),
        None => (url, Vec::new()),
    }
}

fn parse_query(qs: &str) -> Vec<(String, String)> {
    qs.split('&')
        .filter(|s| !s.is_empty())
        .map(|pair| match pair.split_once('=') {
            Some((k, v)) => (decode(k), decode(v)),
            None => (decode(pair), String::new()),
        })
        .collect()
}

fn decode(s: &str) -> String {
    // Minimal percent-decoding; CLI only sends ids and small values.
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = hex(bytes[i + 1]);
                let lo = hex(bytes[i + 2]);
                match (hi, lo) {
                    (Some(h), Some(l)) => {
                        out.push((h << 4) | l);
                        i += 3;
                    }
                    _ => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).unwrap_or_default()
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[allow(clippy::too_many_arguments)]
fn peers(
    request: tiny_http::Request,
    topology: &WireTopology,
    identities: &IdentityRegistry,
    pty_manager: &Arc<Mutex<PtyManager>>,
    note_store: &NoteStore,
    file_node_store: &FileNodeStore,
    task_board_store: &TaskBoardStore,
    query: &[(String, String)],
) {
    let from = query
        .iter()
        .find(|(k, _)| k == "from")
        .map(|(_, v)| v.clone());
    let Some(from) = from else {
        let _ = request.respond(text(400, "missing 'from' query parameter"));
        return;
    };
    let peer_ids = topology.peers_for(&from);
    let live: Vec<String> = pty_manager
        .lock()
        .map(|m| m.live_ids())
        .unwrap_or_default();
    let mut peer_entries: Vec<Identity> = peer_ids
        .iter()
        .filter(|id| live.iter().any(|l| l == *id))
        .map(|id| identities.get(id))
        .collect();
    for id in &peer_ids {
        if let Some(note) = note_store.get(id) {
            let preview = note.text.chars().take(60).collect::<String>();
            peer_entries.push(Identity {
                id: note.id.clone(),
                name: Some(if preview.is_empty() { "(empty note)".into() } else { preview }),
                agent_kind: Some("note".into()),
                capabilities: vec!["read".into()],
                registered_at: 0,
            });
        } else if let Some(fnode) = file_node_store.get(id) {
            peer_entries.push(Identity {
                id: fnode.id.clone(),
                name: Some(fnode.name.clone()),
                agent_kind: Some(format!("file/{}", fnode.kind)),
                capabilities: vec!["read".into()],
                registered_at: 0,
            });
        } else if let Some(board) = task_board_store.get(id) {
            peer_entries.push(Identity {
                id: board.id.clone(),
                name: Some(board.label.clone()),
                agent_kind: Some("board".into()),
                capabilities: vec!["read".into()],
                registered_at: 0,
            });
        }
    }
    let body = serde_json::to_string(&peer_entries).unwrap_or_else(|_| "[]".into());
    let _ = request.respond(json(200, body));
}

fn whoami(
    request: tiny_http::Request,
    identities: &IdentityRegistry,
    query: &[(String, String)],
) {
    let id = query.iter().find(|(k, _)| k == "id").map(|(_, v)| v.clone());
    let Some(id) = id else {
        let _ = request.respond(text(400, "missing 'id' query parameter"));
        return;
    };
    let identity = identities.get(&id);
    let body = serde_json::to_string(&identity).unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

fn register_self(mut request: tiny_http::Request, identities: &IdentityRegistry) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: Identity = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    if parsed.id.is_empty() {
        let _ = request.respond(text(400, "identity 'id' required"));
        return;
    }
    let stored = identities.upsert(parsed);
    let body = serde_json::to_string(&stored).unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

#[derive(Deserialize)]
struct SpawnBody {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    command: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    auto_wire_from: Option<String>,
    #[serde(default)]
    team: Option<String>,
    #[serde(default)]
    team_role: Option<String>,
    /// Wodouyao terminal role (planner/generator/evaluator/researcher/shell
    /// or "pm"). Plumbed through to the frontend so the new node carries it.
    #[serde(default)]
    role: Option<String>,
    /// Extra system-prompt content appended to the agent's context. When set,
    /// the spawn machinery writes a temp .md and launches `claude @file.md`
    /// (or codex equivalent) so the agent picks it up before its first turn.
    /// Used by workflow bootstrap to inject role-specific instructions.
    #[serde(default)]
    append_system_prompt: Option<String>,
}

#[derive(Serialize, Clone)]
struct SpawnEventPayload {
    id: String,
    name: Option<String>,
    kind: Option<String>,
    command: Option<String>,
    cwd: Option<String>,
    auto_wire_from: Option<String>,
    team_id: Option<String>,
    team_role: Option<String>,
    role: Option<String>,
}

#[derive(Serialize)]
struct SpawnResponse {
    id: String,
}

fn spawn(
    mut request: tiny_http::Request,
    topology: &WireTopology,
    team_registry: &TeamRegistry,
    app_handle: &AppHandleSlot,
) {
    let Some(app) = app_handle.get() else {
        let _ = request.respond(text(503, "frontend not ready yet; spawn again in a moment"));
        return;
    };

    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: SpawnBody = if body.trim().is_empty() {
        SpawnBody {
            name: None,
            kind: None,
            command: None,
            cwd: None,
            auto_wire_from: None,
            team: None,
            team_role: None,
            role: None,
            append_system_prompt: None,
        }
    } else {
        match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                let _ = request.respond(text(400, &format!("invalid json: {}", e)));
                return;
            }
        }
    };

    let new_id = format!("t_{}", Uuid::new_v4().simple());

    let mut team_id: Option<String> = None;
    let mut team_role_out: Option<String> = None;
    if let Some(t) = parsed.team.as_ref().filter(|s| !s.is_empty()) {
        let resolved = team_registry
            .get(t)
            .or_else(|| team_registry.find_by_name(t));
        let Some(team) = resolved else {
            let _ = request.respond(text(404, &format!("team not found: {}", t)));
            return;
        };
        let role = parse_role(parsed.team_role.as_deref());
        let role_str = match role {
            Role::Lead => "lead",
            Role::Worker => "worker",
            Role::Observer => "observer",
        }
        .to_string();
        let existing_members = team.members.clone();
        let new_is_lead = matches!(role, Role::Lead);
        if let Err(e) = team_registry.join(&team.id, new_id.clone(), role) {
            let code = if e == "already_in_team" { 409 } else { 400 };
            let _ = request.respond(text(code, &e));
            return;
        }
        wire_new_member(topology, &existing_members, &new_id, new_is_lead);
        team_id = Some(team.id.clone());
        team_role_out = Some(role_str);
    }

    if team_id.is_some() {
        emit_teams_updated(app_handle);
    }

    let command = parsed.command.clone().or_else(|| {
        parsed.kind.as_deref().and_then(|k| match k {
            "claude" => {
                let agent_name = parsed.name.as_deref().unwrap_or("Agent");
                let prompt = build_spawn_prompt(
                    agent_name,
                    parsed.role.as_deref(),
                    parsed.append_system_prompt.as_deref(),
                );
                let dir = std::env::temp_dir().join("wodouyao");
                let _ = std::fs::create_dir_all(&dir);
                let file = dir.join(format!("prompt_{}.md", new_id));
                if std::fs::write(&file, &prompt).is_ok() {
                    let path_str = file.to_string_lossy().replace('\\', "/");
                    Some(format!("claude --dangerously-skip-permissions \"@{}\"", path_str))
                } else {
                    Some("claude --dangerously-skip-permissions".into())
                }
            }
            "codex" => Some("codex --dangerously-bypass-approvals-and-sandbox".into()),
            "opencode" => Some("opencode".into()),
            _ => None,
        })
    });

    // Even when the caller supplied their own `command`, make sure the
    // approval-skip flags are present for known agent CLIs. Users forget,
    // and nothing good comes from a hub-spawned agent sitting on a
    // permission prompt.
    let command = command.map(auto_patch_agent_flags);

    if let Some(c) = parsed.cwd.as_deref().filter(|s| !s.is_empty()) {
        write_project_claude_md(c);
    }

    let payload = SpawnEventPayload {
        id: new_id.clone(),
        name: parsed.name,
        kind: parsed.kind,
        command,
        cwd: parsed.cwd,
        auto_wire_from: parsed.auto_wire_from,
        team_id,
        team_role: team_role_out,
        role: parsed.role,
    };

    if let Err(e) = app.emit("hub-spawn-request", payload) {
        let _ = request.respond(text(500, &format!("emit failed: {}", e)));
        return;
    }

    let resp_body = serde_json::to_string(&SpawnResponse { id: new_id })
        .unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, resp_body));
}

/// Compose the .md file we hand to `claude @file` on spawn. Always includes
/// the wodouyao quick-reference. If `role` is given, mentions it. If
/// `append` is non-empty, appends it verbatim — that's where workflow
/// bootstrap injects role-specific system prompts.
fn build_spawn_prompt(name: &str, role: Option<&str>, append: Option<&str>) -> String {
    let role_section = role
        .filter(|r| !r.is_empty())
        .map(|r| {
            format!(
                "\n## Your Role\n\nYou are the **{role}** terminal on this canvas. \
                 When pulling tasks, prefer ones tagged for your role:\n\n\
                 ```sh\n\
                 wodouyao task next --role {role}\n\
                 ```\n",
                role = r,
            )
        })
        .unwrap_or_default();
    let append_section = append
        .filter(|s| !s.trim().is_empty())
        .map(|s| format!("\n---\n\n{}\n", s))
        .unwrap_or_default();

    format!(
        "# Role: {name}\n\n\
         You are running inside a Wodouyao canvas terminal as **{name}**.\n\
         {role_section}\n\
         ## Startup (run these NOW)\n\n\
         ```sh\n\
         wodouyao hello --name \"{name}\" --kind claude\n\
         wodouyao task list\n\
         ```\n\n\
         ## Key Commands\n\n\
         - `wodouyao peers` — list connected peers\n\
         - `wodouyao task list` — view tasks in this workspace\n\
         - `wodouyao task next [--role X]` — find next pickable task\n\
         - `wodouyao task claim <id>` — atomic ownership grab\n\
         - `wodouyao task done <id>` — mark complete\n\
         - `wodouyao send <peer> \"text\" Enter` — send to peer\n\
         - `wodouyao read <peer>` — read peer output\n\
         - `wodouyao note add \"text\"` — add a sticky note\n\n\
         ## Workflow\n\n\
         1. Register identity (hello)\n\
         2. `task next` to find work, then `task claim` to take it\n\
         3. Do the work\n\
         4. `task done`, then loop to step 2\n\
         {append_section}",
    )
}

/// Drop a `.wodouyao/CLAUDE.md` cheat-sheet inside `cwd` if one isn't there
/// already. Idempotent — never overwrites an existing file. Failures are
/// silent because spawning a terminal must not be blocked by a write error
/// (read-only volume, race against another spawn, etc.).
fn write_project_claude_md(cwd: &str) {
    let dir = std::path::Path::new(cwd).join(".wodouyao");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let target = dir.join("CLAUDE.md");
    if target.exists() {
        return;
    }
    let body = include_str!("../../resources/project_claude_md_template.md");
    let _ = std::fs::write(&target, body);
}

#[derive(Deserialize)]
struct WorkflowBootstrapBody {
    /// Each entry becomes one terminal. Order matters for default wiring:
    /// when `wire_mesh` is false, terminals are wired in a star with the
    /// FIRST entry as the hub.
    roles: Vec<BootstrapRole>,
    /// When true, every pair of terminals is wired (full mesh). When false
    /// (default), star topology around roles[0]. Mesh is right when every
    /// agent legitimately needs to message every other (small teams).
    #[serde(default)]
    wire_mesh: bool,
    /// Working directory all spawned terminals share. Defaults to the
    /// frontend's current workspace cwd at spawn time.
    #[serde(default)]
    cwd: Option<String>,
}

#[derive(Deserialize, Clone)]
struct BootstrapRole {
    /// Free-form role string (e.g. "pm", "backend", "qa"). Plumbed through
    /// to the terminal node and used by `task next --role X` matching.
    role: String,
    /// Display name on the title bar. Defaults to the role label cap'd.
    #[serde(default)]
    name: Option<String>,
    /// Agent kind for the spawn ("claude" / "codex" / "shell"). Default "claude".
    #[serde(default)]
    kind: Option<String>,
    /// Extra system-prompt content appended to the agent's startup .md file.
    /// Per-role customization (e.g. PM gets the orchestration prompt).
    #[serde(default)]
    append_system_prompt: Option<String>,
}

#[derive(Serialize)]
struct WorkflowBootstrapResponse {
    /// Spawned terminal ids in the same order as the request `roles`.
    terminal_ids: Vec<String>,
}

/// POST /v1/workflow/bootstrap
/// One-shot creator for a multi-agent workflow: spawns N terminals, wires
/// them per the requested topology, and injects per-role system prompts.
/// Equivalent to clicking "✨ Bootstrap workflow" in the toolbar — the UI
/// and the CLI both go through this same path so behavior stays consistent.
fn workflow_bootstrap(
    mut request: tiny_http::Request,
    topology: &WireTopology,
    app_handle: &AppHandleSlot,
) {
    let Some(app) = app_handle.get() else {
        let _ = request.respond(text(503, "frontend not ready yet; try again in a moment"));
        return;
    };

    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: WorkflowBootstrapBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    if parsed.roles.is_empty() {
        let _ = request.respond(text(400, "roles[] cannot be empty"));
        return;
    }

    if let Some(c) = parsed.cwd.as_deref().filter(|s| !s.is_empty()) {
        write_project_claude_md(c);
    }

    // Pre-allocate ids so we can wire them up before each spawn fires (the
    // frontend handler creates terminals async; wires created against
    // not-yet-existing ids are fine — wireStore tolerates dangling refs
    // until the spawn lands).
    let ids: Vec<String> = (0..parsed.roles.len())
        .map(|_| format!("t_{}", Uuid::new_v4().simple()))
        .collect();

    for (i, br) in parsed.roles.iter().enumerate() {
        let new_id = &ids[i];
        let agent_name = br
            .name
            .clone()
            .unwrap_or_else(|| capitalize_role(&br.role));
        let kind = br.kind.clone().unwrap_or_else(|| "claude".into());

        // Build the prompt + command using the same machinery as /v1/spawn.
        let command = match kind.as_str() {
            "claude" => {
                let prompt = build_spawn_prompt(
                    &agent_name,
                    Some(&br.role),
                    br.append_system_prompt.as_deref(),
                );
                let dir = std::env::temp_dir().join("wodouyao");
                let _ = std::fs::create_dir_all(&dir);
                let file = dir.join(format!("prompt_{}.md", new_id));
                if std::fs::write(&file, &prompt).is_ok() {
                    let path_str = file.to_string_lossy().replace('\\', "/");
                    Some(format!("claude --dangerously-skip-permissions \"@{}\"", path_str))
                } else {
                    Some("claude --dangerously-skip-permissions".into())
                }
            }
            "codex" => Some("codex --dangerously-bypass-approvals-and-sandbox".into()),
            "opencode" => Some("opencode".into()),
            "shell" | _ => None,
        };
        let command = command.map(auto_patch_agent_flags);

        // Wire topology — handled separately so the frontend doesn't have to
        // figure out N-way connections from individual auto_wire_from hints.
        let auto_wire_from = if i == 0 { None } else { Some(ids[0].clone()) };

        let payload = SpawnEventPayload {
            id: new_id.clone(),
            name: Some(agent_name),
            kind: Some(kind),
            command,
            cwd: parsed.cwd.clone(),
            auto_wire_from,
            team_id: None,
            team_role: None,
            role: Some(br.role.clone()),
        };

        if let Err(e) = app.emit("hub-spawn-request", payload) {
            let _ = request.respond(text(500, &format!("emit failed at index {}: {}", i, e)));
            return;
        }
    }

    // Mesh wiring beyond the star already established by auto_wire_from.
    // Each pair (i,j) where i<j and i!=0 (since 0 is the hub of the star)
    // gets a wire so non-hub roles can talk directly.
    if parsed.wire_mesh && ids.len() > 2 {
        for i in 1..ids.len() {
            for j in (i + 1)..ids.len() {
                let wire = Wire {
                    id: format!("w_{}", Uuid::new_v4().simple()),
                    source_id: ids[i].clone(),
                    target_id: ids[j].clone(),
                    forward_output: true,
                    kind: Some("io".into()),
                    workspace_id: None,
                };
                topology.insert(wire);
            }
        }
        emit_wires_updated(app_handle);
    }

    let body = serde_json::to_string(&WorkflowBootstrapResponse {
        terminal_ids: ids,
    })
    .unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

fn capitalize_role(role: &str) -> String {
    if role.is_empty() {
        return String::from("Agent");
    }
    let mut chars = role.chars();
    let first = chars.next().unwrap().to_uppercase().collect::<String>();
    format!("{}{}", first, chars.as_str())
}

#[derive(Deserialize)]
struct ForkBody {
    /// Source terminal whose agent session is being forked. Defaults to
    /// the implicit caller (the hub doesn't know who that is — clients
    /// should always pass it explicitly via `from`).
    from: String,
    /// Optional human label for the new fork (becomes the new node's name).
    #[serde(default)]
    name: Option<String>,
    /// Agent CLI to use. "claude" or "codex" today. Required because the
    /// hub doesn't track which CLI the source terminal is currently
    /// running — only the caller knows.
    kind: String,
    /// Working directory for the new fork. Strongly recommended to pass
    /// the caller's $(pwd) so the resumed session lands in the same repo.
    #[serde(default)]
    cwd: Option<String>,
}

fn fork(
    mut request: tiny_http::Request,
    topology: &WireTopology,
    identities: &IdentityRegistry,
    app_handle: &AppHandleSlot,
) {
    let Some(app) = app_handle.get() else {
        let _ = request.respond(text(503, "frontend not ready yet; fork again in a moment"));
        return;
    };

    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: ForkBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };

    if parsed.from.is_empty() {
        let _ = request.respond(text(400, "missing 'from' (source terminal id)"));
        return;
    }

    // Build the resume command for the requested agent. The fork happens
    // inside the agent's TUI via /fork, so we just need to drop the user
    // back into a continued session at the same cwd. The agent's slash
    // command (driven by the caller via `wodouyao send`) takes it from
    // there.
    let agent_kind = parsed.kind.to_ascii_lowercase();
    let resume_command = match agent_kind.as_str() {
        "claude" => "claude --dangerously-skip-permissions -c".to_string(),
        "codex" => "codex --dangerously-bypass-approvals-and-sandbox --resume".to_string(),
        other => {
            let _ = request.respond(text(
                400,
                &format!("fork: unsupported kind '{}' (claude|codex)", other),
            ));
            return;
        }
    };

    // Source identity gives us a name hint if the caller didn't supply one.
    let source = identities.get(&parsed.from);
    let new_id = format!("t_{}", Uuid::new_v4().simple());
    let display_name = parsed
        .name
        .clone()
        .or_else(|| source.name.as_ref().map(|n| format!("{} (fork)", n)))
        .unwrap_or_else(|| format!("{} (fork)", agent_kind));

    // Auto-wire the new fork back to its source terminal so the caller
    // can immediately drive `/fork "<name>"` via `wodouyao send`.
    let wire = super::topology::Wire {
        id: format!("w_{}", Uuid::new_v4().simple()),
        source_id: parsed.from.clone(),
        target_id: new_id.clone(),
        forward_output: true,
        kind: Some("io".to_string()),
        workspace_id: None,
    };
    topology.insert(wire);
    let _ = app.emit("wires-updated", ());

    let payload = SpawnEventPayload {
        id: new_id.clone(),
        name: Some(display_name),
        kind: Some(agent_kind),
        command: Some(resume_command),
        cwd: parsed.cwd,
        auto_wire_from: None, // we already inserted the wire above
        team_id: None,
        team_role: None,
        role: None,
    };

    if let Err(e) = app.emit("hub-spawn-request", payload) {
        let _ = request.respond(text(500, &format!("emit failed: {}", e)));
        return;
    }

    let resp_body = serde_json::to_string(&SpawnResponse { id: new_id })
        .unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, resp_body));
}

#[derive(Deserialize)]
struct SendBody {
    from: String,
    to: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    mode: Option<String>,
}

fn send(
    mut request: tiny_http::Request,
    topology: &WireTopology,
    pty_manager: &Arc<Mutex<PtyManager>>,
    identities: &IdentityRegistry,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: SendBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };

    if !topology.peers_for(&parsed.from).iter().any(|p| p == &parsed.to) {
        let _ = request.respond(text(403, "no wire between 'from' and 'to'"));
        return;
    }

    let mode = parsed.mode.as_deref().unwrap_or("keys");
    let bytes = match mode {
        "raw" => parsed.text.into_bytes(),
        "keys" => keys::parse_keys(&parsed.text),
        other => {
            let _ = request.respond(text(400, &format!("unknown mode: {}", other)));
            return;
        }
    };

    let _ = identities; // identity lookup retained for future use; see note below.

    // Body + trailing CR go as separate writes via write_peer_send so Ink-based
    // TUIs (Claude Code, codex) don't merge them into a paste event.
    let result = write_peer_send(pty_manager, &parsed.to, &bytes);

    match result {
        Ok(()) => {
            let _ = request.respond(empty(204));
        }
        Err(e) => {
            let _ = request.respond(text(500, &e));
        }
    }
}

/// Produce a `from <display>` label for a peer. Currently unused at the
/// hub layer — the previous in-band `# wodouyao: from ...\n` header broke
/// agent TUIs (Claude/Codex) that interpret the embedded `\n` as "submit".
/// Kept around because the from signal is still useful; it just needs an
/// out-of-band channel (e.g. a sidebar or hover tooltip in the FE) instead.
#[allow(dead_code)]
fn sender_header_bytes(identities: &IdentityRegistry, from_id: &str) -> Vec<u8> {
    let identity = identities.get(from_id);
    let display = identity
        .name
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| from_id.to_string());
    format!("from {}", display).into_bytes()
}

/// Ensure hub-spawned agent CLIs always run with their approval-skip flag.
/// Callers (frontend quick-commands, `wodouyao spawn --command ...`, etc.)
/// frequently forget, and the whole point of an auto-spawned canvas peer is
/// that it's ready to act without sitting on a permission prompt.
fn auto_patch_agent_flags(cmd: String) -> String {
    let trimmed = cmd.trim_start();
    // Only patch if the command *starts* with the bare agent CLI name. We
    // don't want to mangle `bash -c 'claude ...'` or piped/chained forms.
    let first = trimmed.split_whitespace().next().unwrap_or("");
    match first {
        "claude" => {
            if trimmed.contains("--dangerously-skip-permissions") {
                cmd
            } else {
                // Insert after `claude` so any `@file` / args the caller
                // supplied still line up in position.
                let (head, rest) = trimmed.split_at("claude".len());
                format!("{} --dangerously-skip-permissions{}", head, rest)
            }
        }
        "codex" => {
            if trimmed.contains("--dangerously-bypass-approvals-and-sandbox") {
                cmd
            } else {
                let (head, rest) = trimmed.split_at("codex".len());
                format!(
                    "{} --dangerously-bypass-approvals-and-sandbox{}",
                    head, rest
                )
            }
        }
        _ => cmd,
    }
}

#[allow(clippy::too_many_arguments)]
fn read(
    request: tiny_http::Request,
    topology: &WireTopology,
    pty_manager: &Arc<Mutex<PtyManager>>,
    note_store: &NoteStore,
    file_node_store: &FileNodeStore,
    task_board_store: &TaskBoardStore,
    task_store: &TaskStore,
    query: &[(String, String)],
) {
    let from = query.iter().find(|(k, _)| k == "from").map(|(_, v)| v.clone());
    let to = query.iter().find(|(k, _)| k == "to").map(|(_, v)| v.clone());
    let Some(from) = from else {
        let _ = request.respond(text(400, "missing 'from' query parameter"));
        return;
    };
    let Some(to) = to else {
        let _ = request.respond(text(400, "missing 'to' query parameter"));
        return;
    };

    // Accept `bytes` (preferred) or `lines` (legacy, translated as lines*256).
    const DEFAULT_BYTES: usize = 64 * 1024;
    const MAX_BYTES: usize = 64 * 1024;
    let mut max_bytes = DEFAULT_BYTES;
    if let Some((_, v)) = query.iter().find(|(k, _)| k == "bytes") {
        if let Ok(n) = v.parse::<usize>() {
            max_bytes = n;
        }
    } else if let Some((_, v)) = query.iter().find(|(k, _)| k == "lines") {
        if let Ok(n) = v.parse::<usize>() {
            max_bytes = n.saturating_mul(256);
        }
    }
    if max_bytes > MAX_BYTES {
        max_bytes = MAX_BYTES;
    }

    if !topology.peers_for(&from).iter().any(|p| p == &to) {
        let _ = request.respond(text(403, "no wire between 'from' and 'to'"));
        return;
    }

    if let Some(note) = note_store.get(&to) {
        let _ = request.respond(plain_bytes(200, note.text.into_bytes()));
        return;
    }

    if let Some(fnode) = file_node_store.get(&to) {
        let is_text = matches!(fnode.kind.as_str(), "text" | "directory");
        if is_text && fnode.kind == "text" {
            match std::fs::read(&fnode.path) {
                Ok(bytes) => {
                    let capped = if bytes.len() > max_bytes {
                        bytes[..max_bytes].to_vec()
                    } else {
                        bytes
                    };
                    let _ = request.respond(plain_bytes(200, capped));
                }
                Err(e) => {
                    let _ = request.respond(text(500, &format!("read file: {}", e)));
                }
            }
            return;
        }
        if fnode.kind == "directory" {
            let mut listing = String::new();
            if let Ok(entries) = std::fs::read_dir(&fnode.path) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let is_dir = entry
                        .file_type()
                        .map(|t| t.is_dir())
                        .unwrap_or(false);
                    listing.push_str(&format!("{}{}\n", name, if is_dir { "/" } else { "" }));
                }
            }
            let _ = request.respond(plain_bytes(200, listing.into_bytes()));
            return;
        }
        // image / video / other — return JSON metadata so the agent can
        // decide what to do with it (Claude Code can use its own Read tool
        // on the path; a shell script might pipe it through file(1)).
        let meta = serde_json::json!({
            "kind": "file",
            "file_kind": fnode.kind,
            "name": fnode.name,
            "path": fnode.path,
        });
        let _ = request.respond(json(200, meta.to_string()));
        return;
    }

    if task_board_store.get(&to).is_some() {
        let tasks = task_store.list();
        let body = serde_json::to_string(&tasks).unwrap_or_else(|_| "[]".into());
        let _ = request.respond(json(200, body));
        return;
    }

    let result = {
        let mgr = match pty_manager.lock() {
            Ok(g) => g,
            Err(e) => {
                let _ = request.respond(text(500, &format!("pty lock: {}", e)));
                return;
            }
        };
        mgr.read_recent(&to, max_bytes)
    };

    match result {
        Ok(bytes) => {
            let _ = request.respond(plain_bytes(200, bytes));
        }
        Err(e) => {
            let _ = request.respond(text(404, &e));
        }
    }
}

/// Blocking `Read` impl backed by an mpsc channel. Each `recv()` returns one
/// chunk of PTY output; when the channel closes (session gone or dropped), the
/// read returns 0 and tiny_http closes the connection with a final zero-length
/// chunk. Passing `data_length: None` to `Response::new` makes tiny_http use
/// HTTP/1.1 `Transfer-Encoding: chunked`, which is exactly what we want.
struct ChannelReader {
    rx: mpsc::Receiver<Vec<u8>>,
    pending: Vec<u8>,
    pos: usize,
}

impl ChannelReader {
    fn new(rx: mpsc::Receiver<Vec<u8>>) -> Self {
        ChannelReader {
            rx,
            pending: Vec::new(),
            pos: 0,
        }
    }
}

impl io::Read for ChannelReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.pos >= self.pending.len() {
            match self.rx.recv() {
                Ok(bytes) => {
                    self.pending = bytes;
                    self.pos = 0;
                }
                Err(_) => return Ok(0),
            }
        }
        let available = self.pending.len() - self.pos;
        let n = available.min(buf.len());
        buf[..n].copy_from_slice(&self.pending[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

fn watch(
    request: tiny_http::Request,
    topology: &WireTopology,
    pty_manager: &Arc<Mutex<PtyManager>>,
    query: &[(String, String)],
) {
    let from = query.iter().find(|(k, _)| k == "from").map(|(_, v)| v.clone());
    let to = query.iter().find(|(k, _)| k == "to").map(|(_, v)| v.clone());
    let Some(from) = from else {
        let _ = request.respond(text(400, "missing 'from' query parameter"));
        return;
    };
    let Some(to) = to else {
        let _ = request.respond(text(400, "missing 'to' query parameter"));
        return;
    };

    if !topology.peers_for(&from).iter().any(|p| p == &to) {
        let _ = request.respond(text(403, "no wire between 'from' and 'to'"));
        return;
    }

    let rx = {
        let mgr = match pty_manager.lock() {
            Ok(g) => g,
            Err(e) => {
                let _ = request.respond(text(500, &format!("pty lock: {}", e)));
                return;
            }
        };
        match mgr.subscribe(&to) {
            Ok(rx) => rx,
            Err(e) => {
                let _ = request.respond(text(404, &e));
                return;
            }
        }
    };

    let ct = Header::from_bytes(&b"Content-Type"[..], &b"application/octet-stream"[..]).unwrap();
    let cache = Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap();
    let response = Response::new(
        StatusCode(200),
        vec![ct, cache],
        ChannelReader::new(rx),
        None,
        None,
    );
    let _ = request.respond(response);
}

#[derive(Deserialize)]
struct CreateTeamBody {
    name: String,
    #[serde(default)]
    palette: Option<String>,
    #[serde(default)]
    lead: Option<String>,
}

fn emit_teams_updated(app_handle: &AppHandleSlot) {
    if let Some(app) = app_handle.get() {
        let _ = app.emit("teams-updated", ());
    }
}

fn teams_create(
    mut request: tiny_http::Request,
    team_registry: &TeamRegistry,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: CreateTeamBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    let palette_key = parsed.palette.as_deref().unwrap_or("blue");
    let mut team = match team_registry.create(&parsed.name, palette_key) {
        Ok(t) => t,
        Err(e) => {
            let _ = request.respond(text(400, &e));
            return;
        }
    };
    if let Some(lead) = parsed.lead.filter(|s| !s.is_empty()) {
        match team_registry.join(&team.id, lead, Role::Lead) {
            Ok(t) => team = t,
            Err(e) => {
                let _ = request.respond(text(400, &e));
                return;
            }
        }
    }
    let body = serde_json::to_string(&team).unwrap_or_else(|_| "{}".into());
    emit_teams_updated(app_handle);
    let _ = request.respond(json(200, body));
}

fn teams_list(request: tiny_http::Request, team_registry: &TeamRegistry) {
    let body = serde_json::to_string(&team_registry.list()).unwrap_or_else(|_| "[]".into());
    let _ = request.respond(json(200, body));
}

fn team_get(request: tiny_http::Request, team_registry: &TeamRegistry, id: &str) {
    match team_registry.get(id) {
        Some(t) => {
            let body = serde_json::to_string(&t).unwrap_or_else(|_| "{}".into());
            let _ = request.respond(json(200, body));
        }
        None => {
            let _ = request.respond(text(404, "team not found"));
        }
    }
}

#[derive(Deserialize)]
struct JoinBody {
    term_id: String,
    #[serde(default)]
    role: Option<String>,
}

fn parse_role(s: Option<&str>) -> Role {
    match s.map(|v| v.to_ascii_lowercase()).as_deref() {
        Some("lead") => Role::Lead,
        Some("observer") => Role::Observer,
        _ => Role::Worker,
    }
}

fn team_join(
    mut request: tiny_http::Request,
    team_registry: &TeamRegistry,
    topology: &WireTopology,
    id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: JoinBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    let Some(existing) = team_registry.get(id) else {
        let _ = request.respond(text(404, "team not found"));
        return;
    };
    let role = parse_role(parsed.role.as_deref());
    let is_lead = matches!(role, Role::Lead);
    let term_id = parsed.term_id.clone();
    match team_registry.join(id, parsed.term_id, role) {
        Ok(t) => {
            wire_new_member(topology, &existing.members, &term_id, is_lead);
            let body = serde_json::to_string(&t).unwrap_or_else(|_| "{}".into());
            emit_teams_updated(app_handle);
            let _ = request.respond(json(200, body));
        }
        Err(e) if e == "already_in_team" => {
            let _ = request.respond(text(409, &e));
        }
        Err(e) if e == "not_found" => {
            let _ = request.respond(text(404, &e));
        }
        Err(e) => {
            let _ = request.respond(text(400, &e));
        }
    }
}

/// Insert star-topology wires when a new member joins a team.
/// Convention: **lead is always the wire's source**, member is the target.
/// - lead joining: wire from new lead → every pre-existing member
/// - worker/observer joining: wire from current lead → new member (if lead exists)
fn wire_new_member(
    topology: &WireTopology,
    existing_members: &[super::team::TeamMember],
    new_id: &str,
    new_is_lead: bool,
) {
    let pairs: Vec<(String, String)> = if new_is_lead {
        // new member IS the lead: lead (new) → each existing member
        existing_members
            .iter()
            .map(|m| (new_id.to_string(), m.term_id.clone()))
            .collect()
    } else {
        // worker/observer joining: existing lead → new member
        existing_members
            .iter()
            .find(|m| matches!(m.role, Role::Lead))
            .map(|m| vec![(m.term_id.clone(), new_id.to_string())])
            .unwrap_or_default()
    };
    for (source_id, target_id) in pairs {
        topology.insert(super::topology::Wire {
            id: format!("w_{}", Uuid::new_v4().simple()),
            source_id,
            target_id,
            forward_output: true,
            kind: Some("team".to_string()),
            workspace_id: None,
        });
    }
}

#[derive(Deserialize)]
struct LeaveBody {
    term_id: String,
}

fn team_leave(
    mut request: tiny_http::Request,
    team_registry: &TeamRegistry,
    id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: LeaveBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    match team_registry.leave(id, &parsed.term_id) {
        Ok(t) => {
            let body = serde_json::to_string(&t).unwrap_or_else(|_| "{}".into());
            emit_teams_updated(app_handle);
            let _ = request.respond(json(200, body));
        }
        Err(_) => {
            let _ = request.respond(text(404, "team not found"));
        }
    }
}

fn team_dissolve(
    request: tiny_http::Request,
    team_registry: &TeamRegistry,
    topology: &WireTopology,
    identities: &IdentityRegistry,
    pty_manager: &Arc<Mutex<PtyManager>>,
    id: &str,
    app_handle: &AppHandleSlot,
) {
    let evicted = match team_registry.dissolve(id) {
        Ok(v) => v,
        Err(_) => {
            let _ = request.respond(text(404, "team not found"));
            return;
        }
    };
    for term_id in &evicted {
        if let Ok(mut mgr) = pty_manager.lock() {
            let _ = mgr.destroy_session(term_id);
        }
        topology.remove_for_terminal(term_id);
        identities.remove(term_id);
    }
    let body = serde_json::json!({ "evicted": evicted }).to_string();
    emit_teams_updated(app_handle);
    let _ = request.respond(json(200, body));
}

#[derive(Deserialize)]
struct TaskCreateBody {
    subject: String,
    #[serde(default)]
    description: Option<String>,
    created_by: String,
    #[serde(default)]
    blocked_by: Option<Vec<String>>,
}

fn team_tasks_list(request: tiny_http::Request, team_registry: &TeamRegistry, id: &str) {
    match team_registry.task_list(id) {
        Ok(tasks) => {
            let body = serde_json::to_string(&tasks).unwrap_or_else(|_| "[]".into());
            let _ = request.respond(json(200, body));
        }
        Err(_) => {
            let _ = request.respond(text(404, "team not found"));
        }
    }
}

fn team_tasks_create(
    mut request: tiny_http::Request,
    team_registry: &TeamRegistry,
    id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: TaskCreateBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    if team_registry.get(id).is_none() {
        let _ = request.respond(text(404, "team not found"));
        return;
    }
    match team_registry.task_add(
        id,
        parsed.created_by,
        parsed.subject,
        parsed.description.unwrap_or_default(),
        parsed.blocked_by.unwrap_or_default(),
    ) {
        Ok(task) => {
            let body = serde_json::to_string(&task).unwrap_or_else(|_| "{}".into());
            emit_teams_updated(app_handle);
            let _ = request.respond(json(200, body));
        }
        Err(e) if e == "empty_subject" => {
            let _ = request.respond(text(400, &e));
        }
        Err(e) if e == "not_found" => {
            let _ = request.respond(text(404, &e));
        }
        Err(e) => {
            let _ = request.respond(text(400, &e));
        }
    }
}

fn team_tasks_patch(
    mut request: tiny_http::Request,
    team_registry: &TeamRegistry,
    id: &str,
    task_id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let patch: TaskPatch = if body.trim().is_empty() {
        TaskPatch::default()
    } else {
        match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                let _ = request.respond(text(400, &format!("invalid json: {}", e)));
                return;
            }
        }
    };
    match team_registry.task_update(id, task_id, patch) {
        Ok(task) => {
            let body = serde_json::to_string(&task).unwrap_or_else(|_| "{}".into());
            emit_teams_updated(app_handle);
            let _ = request.respond(json(200, body));
        }
        Err(e) if e == "not_found" => {
            let _ = request.respond(text(404, &e));
        }
        Err(e) => {
            let _ = request.respond(text(400, &e));
        }
    }
}

#[derive(Deserialize)]
struct BroadcastBody {
    from: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    mode: Option<String>,
}

#[derive(Deserialize)]
struct DmBody {
    from: String,
    to_role: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    mode: Option<String>,
}

fn encode_payload(text: &str, mode: Option<&str>) -> Result<Vec<u8>, String> {
    match mode.unwrap_or("keys") {
        "raw" => Ok(text.as_bytes().to_vec()),
        "keys" => Ok(keys::parse_keys(text)),
        other => Err(format!("unknown mode: {}", other)),
    }
}

/// Write a peer-send payload to the target session, but split the trailing
/// Enter (CR) into its own write with a brief delay. Without the delay, Claude
/// Code's Ink-based input handler (and similar TUIs) can see `"text\r"` arrive
/// as a single chunk and treat it as a paste — the trailing `\r` becomes a
/// literal newline in the input box instead of firing the Enter/submit event.
/// Delivering CR in a separate chunk, after the body is already buffered,
/// makes every modern agent TUI reliably submit.
///
/// Always normalizes the terminator to `\r` (CR), never `\n`: most agent TUIs
/// run in raw mode and only treat CR as Enter.
fn write_peer_send(
    pty_manager: &Arc<Mutex<PtyManager>>,
    target: &str,
    bytes: &[u8],
) -> Result<(), String> {
    // Strip any trailing \r / \n run so we can re-emit a single, canonical CR.
    let mut end = bytes.len();
    while end > 0 {
        let b = bytes[end - 1];
        if b == b'\r' || b == b'\n' {
            end -= 1;
        } else {
            break;
        }
    }
    let body = &bytes[..end];

    {
        let mut mgr = pty_manager.lock().map_err(|e| format!("pty lock: {}", e))?;
        if !body.is_empty() {
            mgr.write_to_session(target, body)?;
        }
    }
    // Drop the lock before sleeping so other hub requests aren't blocked.
    std::thread::sleep(std::time::Duration::from_millis(30));
    {
        let mut mgr = pty_manager.lock().map_err(|e| format!("pty lock: {}", e))?;
        mgr.write_to_session(target, b"\r")?;
    }
    Ok(())
}

fn fanout_send(
    pty_manager: &Arc<Mutex<PtyManager>>,
    targets: &[String],
    bytes: &[u8],
) -> (usize, Vec<serde_json::Value>) {
    let mut sent = 0usize;
    let mut failed: Vec<serde_json::Value> = Vec::new();
    for id in targets {
        match write_peer_send(pty_manager, id, bytes) {
            Ok(()) => sent += 1,
            Err(e) => failed.push(serde_json::json!({ "id": id, "err": e })),
        }
    }
    (sent, failed)
}

fn team_broadcast(
    mut request: tiny_http::Request,
    team_registry: &TeamRegistry,
    pty_manager: &Arc<Mutex<PtyManager>>,
    identities: &IdentityRegistry,
    id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: BroadcastBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    let Some(team) = team_registry.get(id) else {
        let _ = request.respond(text(404, "team not found"));
        return;
    };
    if !team.members.iter().any(|m| m.term_id == parsed.from) {
        let _ = request.respond(text(403, "sender not in team"));
        return;
    }
    let mode = parsed.mode.as_deref();
    let bytes = match encode_payload(&parsed.text, mode) {
        Ok(b) => b,
        Err(e) => {
            let _ = request.respond(text(400, &e));
            return;
        }
    };
    let _ = identities;
    let targets: Vec<String> = team
        .members
        .iter()
        .filter(|m| m.term_id != parsed.from)
        .map(|m| m.term_id.clone())
        .collect();
    let (sent, failed) = fanout_send(pty_manager, &targets, &bytes);
    let body = serde_json::json!({ "sent": sent, "failed": failed }).to_string();
    emit_teams_updated(app_handle);
    let _ = request.respond(json(200, body));
}

fn team_dm(
    mut request: tiny_http::Request,
    team_registry: &TeamRegistry,
    pty_manager: &Arc<Mutex<PtyManager>>,
    identities: &IdentityRegistry,
    id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: DmBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    let role_target = match parsed.to_role.to_ascii_lowercase().as_str() {
        "lead" => Role::Lead,
        "worker" => Role::Worker,
        "observer" => Role::Observer,
        _ => {
            let _ = request.respond(text(400, "unknown role"));
            return;
        }
    };
    let Some(team) = team_registry.get(id) else {
        let _ = request.respond(text(404, "team not found"));
        return;
    };
    if !team.members.iter().any(|m| m.term_id == parsed.from) {
        let _ = request.respond(text(403, "sender not in team"));
        return;
    }
    let mode = parsed.mode.as_deref();
    let bytes = match encode_payload(&parsed.text, mode) {
        Ok(b) => b,
        Err(e) => {
            let _ = request.respond(text(400, &e));
            return;
        }
    };
    let _ = identities;
    let targets: Vec<String> = team
        .members
        .iter()
        .filter(|m| m.term_id != parsed.from && role_matches(&m.role, &role_target))
        .map(|m| m.term_id.clone())
        .collect();
    let (sent, failed) = fanout_send(pty_manager, &targets, &bytes);
    let body = serde_json::json!({ "sent": sent, "failed": failed }).to_string();
    emit_teams_updated(app_handle);
    let _ = request.respond(json(200, body));
}

fn role_matches(a: &Role, b: &Role) -> bool {
    matches!(
        (a, b),
        (Role::Lead, Role::Lead)
            | (Role::Worker, Role::Worker)
            | (Role::Observer, Role::Observer)
    )
}

fn empty(code: u16) -> Response<Cursor<Vec<u8>>> {
    Response::new(
        StatusCode(code),
        Vec::new(),
        Cursor::new(Vec::new()),
        Some(0),
        None,
    )
}

fn text(code: u16, body: &str) -> Response<Cursor<Vec<u8>>> {
    let bytes = body.as_bytes().to_vec();
    let len = bytes.len();
    let header = Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap();
    Response::new(
        StatusCode(code),
        vec![header],
        Cursor::new(bytes),
        Some(len),
        None,
    )
}

fn plain_bytes(code: u16, bytes: Vec<u8>) -> Response<Cursor<Vec<u8>>> {
    let len = bytes.len();
    let header = Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap();
    Response::new(
        StatusCode(code),
        vec![header],
        Cursor::new(bytes),
        Some(len),
        None,
    )
}

fn json(code: u16, body: String) -> Response<Cursor<Vec<u8>>> {
    let bytes = body.into_bytes();
    let len = bytes.len();
    let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    Response::new(
        StatusCode(code),
        vec![header],
        Cursor::new(bytes),
        Some(len),
        None,
    )
}

fn emit_tasks_updated(app_handle: &AppHandleSlot) {
    if let Some(app) = app_handle.get() {
        let _ = app.emit("tasks-updated", ());
    }
}

fn tasks_list_route(request: tiny_http::Request, task_store: &TaskStore) {
    let body = serde_json::to_string(&task_store.list()).unwrap_or_else(|_| "[]".into());
    let _ = request.respond(json(200, body));
}

fn tasks_create_route(
    mut request: tiny_http::Request,
    task_store: &TaskStore,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: TaskCreate = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    if parsed.subject.trim().is_empty() {
        let _ = request.respond(text(400, "subject is required"));
        return;
    }
    let task = task_store.create(parsed);
    emit_tasks_updated(app_handle);
    let body = serde_json::to_string(&task).unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

fn tasks_patch_route(
    mut request: tiny_http::Request,
    task_store: &TaskStore,
    task_id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let patch: TaskStorePatch = if body.trim().is_empty() {
        TaskStorePatch::default()
    } else {
        match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                let _ = request.respond(text(400, &format!("invalid json: {}", e)));
                return;
            }
        }
    };
    match task_store.update(task_id, patch) {
        Some(task) => {
            emit_tasks_updated(app_handle);
            let body = serde_json::to_string(&task).unwrap_or_else(|_| "{}".into());
            let _ = request.respond(json(200, body));
        }
        None => {
            let _ = request.respond(text(404, "task not found"));
        }
    }
}

fn tasks_delete_route(
    request: tiny_http::Request,
    task_store: &TaskStore,
    task_id: &str,
    app_handle: &AppHandleSlot,
) {
    let removed = task_store.remove(task_id);
    if removed {
        emit_tasks_updated(app_handle);
        let _ = request.respond(empty(204));
    } else {
        let _ = request.respond(text(404, "task not found"));
    }
}

/// GET /v1/tasks/next?role=X&from=<term_id>&workspace=<ws>
/// Returns the oldest pending unowned task whose deps are satisfied and
/// whose role_hint matches `role` (or is None). 204 if nothing matches.
/// Does NOT claim — caller must POST /v1/tasks/{id}/claim separately.
fn tasks_next_route(
    request: tiny_http::Request,
    task_store: &TaskStore,
    _identities: &IdentityRegistry,
    query: &[(String, String)],
) {
    let role = query.iter().find(|(k, _)| k == "role").map(|(_, v)| v.as_str());
    let ws = query.iter().find(|(k, _)| k == "workspace").map(|(_, v)| v.as_str());
    match task_store.next_for(role, ws) {
        Some(t) => {
            let body = serde_json::to_string(&t).unwrap_or_else(|_| "{}".into());
            let _ = request.respond(json(200, body));
        }
        None => {
            let _ = request.respond(empty(204));
        }
    }
}

/// POST /v1/tasks/{id}/claim?from=<term_id>
/// Atomic claim. 200 + task on success, 409 + current task on conflict,
/// 404 if not found, 400 if `from` missing.
fn tasks_claim_route(
    request: tiny_http::Request,
    task_store: &TaskStore,
    _identities: &IdentityRegistry,
    task_id: &str,
    app_handle: &AppHandleSlot,
) {
    let url = request.url().to_string();
    let (_, query) = split_query(&url);
    let Some(from) = query
        .iter()
        .find(|(k, _)| k == "from")
        .map(|(_, v)| v.clone())
    else {
        let _ = request.respond(text(400, "claim requires ?from=<terminal-id>"));
        return;
    };
    match task_store.try_claim(task_id, &from) {
        ClaimResult::Ok(t) => {
            emit_tasks_updated(app_handle);
            let body = serde_json::to_string(&t).unwrap_or_else(|_| "{}".into());
            let _ = request.respond(json(200, body));
        }
        ClaimResult::AlreadyClaimed(t) => {
            let body = serde_json::to_string(&t).unwrap_or_else(|_| "{}".into());
            let _ = request.respond(json(409, body));
        }
        ClaimResult::NotFound => {
            let _ = request.respond(text(404, "task not found"));
        }
    }
}

// ── Wire endpoints ──────────────────────────────────────────────────

fn emit_wires_updated(app_handle: &AppHandleSlot) {
    if let Some(app) = app_handle.get() {
        let _ = app.emit("wires-updated", ());
    }
}

fn wires_list_route(request: tiny_http::Request, topology: &WireTopology) {
    let body = serde_json::to_string(&topology.list()).unwrap_or_else(|_| "[]".into());
    let _ = request.respond(json(200, body));
}

#[derive(Deserialize)]
struct WireCreateBody {
    source_id: String,
    target_id: String,
    #[serde(default)]
    kind: Option<String>,
}

fn wires_create_route(
    mut request: tiny_http::Request,
    topology: &WireTopology,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: WireCreateBody = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    let wire = super::topology::Wire {
        id: format!("w_{}", Uuid::new_v4().simple()),
        source_id: parsed.source_id,
        target_id: parsed.target_id,
        forward_output: true,
        kind: parsed.kind,
        workspace_id: None,
    };
    let created = topology.insert(wire);
    emit_wires_updated(app_handle);
    let body = serde_json::to_string(&created).unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

fn wires_delete_route(
    request: tiny_http::Request,
    topology: &WireTopology,
    wire_id: &str,
    app_handle: &AppHandleSlot,
) {
    if topology.remove(wire_id) {
        emit_wires_updated(app_handle);
        let _ = request.respond(empty(204));
    } else {
        let _ = request.respond(text(404, "wire not found"));
    }
}

// ── Terminal endpoints ──────────────────────────────────────────────

#[derive(Serialize)]
struct TerminalInfo {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent_kind: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    capabilities: Vec<String>,
}

fn terminals_list_route(
    request: tiny_http::Request,
    pty_manager: &Arc<Mutex<PtyManager>>,
    identities: &IdentityRegistry,
) {
    let ids = pty_manager
        .lock()
        .map(|m| m.live_ids())
        .unwrap_or_default();
    let infos: Vec<TerminalInfo> = ids
        .into_iter()
        .map(|id| {
            let ident = identities.get(&id);
            TerminalInfo {
                id,
                name: ident.name,
                agent_kind: ident.agent_kind,
                capabilities: ident.capabilities,
            }
        })
        .collect();
    let body = serde_json::to_string(&infos).unwrap_or_else(|_| "[]".into());
    let _ = request.respond(json(200, body));
}

fn terminals_close_route(
    request: tiny_http::Request,
    pty_manager: &Arc<Mutex<PtyManager>>,
    topology: &WireTopology,
    identities: &IdentityRegistry,
    term_id: &str,
    app_handle: &AppHandleSlot,
) {
    let destroyed = pty_manager
        .lock()
        .map(|mut m| m.destroy_session(term_id).is_ok())
        .unwrap_or(false);
    if destroyed {
        topology.remove_for_terminal(term_id);
        identities.remove(term_id);
        if let Some(app) = app_handle.get() {
            let _ = app.emit(&format!("terminal-exit-{}", term_id), 0i32);
        }
        let _ = request.respond(empty(204));
    } else {
        let _ = request.respond(text(404, "terminal not found"));
    }
}

// ── Note endpoints ──────────────────────────────────────────────────

fn emit_notes_updated(app_handle: &AppHandleSlot) {
    if let Some(app) = app_handle.get() {
        let _ = app.emit("notes-updated", ());
    }
}

fn notes_list_route(request: tiny_http::Request, note_store: &NoteStore) {
    let body = serde_json::to_string(&note_store.list()).unwrap_or_else(|_| "[]".into());
    let _ = request.respond(json(200, body));
}

fn notes_create_route(
    mut request: tiny_http::Request,
    note_store: &NoteStore,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let parsed: NoteCreate = if body.trim().is_empty() {
        NoteCreate::default()
    } else {
        match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                let _ = request.respond(text(400, &format!("invalid json: {}", e)));
                return;
            }
        }
    };
    let note = note_store.create(parsed);
    emit_notes_updated(app_handle);
    let body = serde_json::to_string(&note).unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

fn notes_patch_route(
    mut request: tiny_http::Request,
    note_store: &NoteStore,
    note_id: &str,
    app_handle: &AppHandleSlot,
) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let patch: NoteStorePatch = if body.trim().is_empty() {
        NoteStorePatch::default()
    } else {
        match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                let _ = request.respond(text(400, &format!("invalid json: {}", e)));
                return;
            }
        }
    };
    match note_store.update(note_id, patch) {
        Some(note) => {
            emit_notes_updated(app_handle);
            let body = serde_json::to_string(&note).unwrap_or_else(|_| "{}".into());
            let _ = request.respond(json(200, body));
        }
        None => {
            let _ = request.respond(text(404, "note not found"));
        }
    }
}

fn notes_delete_route(
    request: tiny_http::Request,
    note_store: &NoteStore,
    note_id: &str,
    app_handle: &AppHandleSlot,
) {
    if note_store.remove(note_id) {
        emit_notes_updated(app_handle);
        let _ = request.respond(empty(204));
    } else {
        let _ = request.respond(text(404, "note not found"));
    }
}

#[derive(Deserialize)]
struct BackgroundPatch {
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    source: Option<Option<String>>,
    #[serde(default)]
    particle: Option<Option<String>>,
    #[serde(default)]
    shader: Option<Option<String>>,
    #[serde(default)]
    opacity: Option<f64>,
}

fn background_set(mut request: tiny_http::Request, app_handle: &AppHandleSlot) {
    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(text(400, "unable to read body"));
        return;
    }
    let patch: BackgroundPatch = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            let _ = request.respond(text(400, &format!("invalid json: {}", e)));
            return;
        }
    };
    let mut settings = match crate::settings::storage::load() {
        Ok(s) => s,
        Err(e) => {
            let _ = request.respond(text(500, &format!("load settings: {}", e)));
            return;
        }
    };
    if let Some(k) = patch.kind {
        if !matches!(
            k.as_str(),
            "none" | "image" | "video" | "url" | "shader"
        ) {
            let _ = request.respond(text(400, "invalid kind"));
            return;
        }
        settings.background.kind = k;
    }
    if let Some(v) = patch.source {
        settings.background.source = v;
    }
    if let Some(v) = patch.particle {
        settings.background.particle = v;
    }
    if let Some(v) = patch.shader {
        settings.background.shader = v;
    }
    if let Some(v) = patch.opacity {
        settings.background.opacity = v.clamp(0.0, 1.0);
    }
    if let Err(e) = crate::settings::storage::save(&settings) {
        let _ = request.respond(text(500, &format!("save: {}", e)));
        return;
    }
    if let Some(handle) = app_handle.get() {
        let _ = handle.emit("settings-changed", ());
    }
    let body = serde_json::to_string(&settings.background).unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

fn background_get(request: tiny_http::Request) {
    let settings = match crate::settings::storage::load() {
        Ok(s) => s,
        Err(e) => {
            let _ = request.respond(text(500, &format!("load: {}", e)));
            return;
        }
    };
    let body = serde_json::to_string(&settings.background).unwrap_or_else(|_| "{}".into());
    let _ = request.respond(json(200, body));
}

fn shaders_list_route(request: tiny_http::Request) {
    match crate::commands::shaders::shaders_list() {
        Ok(list) => {
            let body = serde_json::to_string(&list).unwrap_or_else(|_| "[]".into());
            let _ = request.respond(json(200, body));
        }
        Err(e) => {
            let _ = request.respond(text(500, &e));
        }
    }
}
