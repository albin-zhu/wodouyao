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
use super::topology::WireTopology;
use crate::notes::{NoteCreate, NotePatch as NoteStorePatch, NoteStore};
use crate::pty::manager::PtyManager;
use crate::tasks::{TaskCreate, TaskPatch as TaskStorePatch, TaskStore};

pub type AppHandleSlot = Arc<OnceLock<AppHandle>>;

#[derive(Clone)]
pub struct HubHandle {
    pub url: String,
    pub token: String,
    pub endpoint_path: std::path::PathBuf,
}

pub fn start(
    topology: WireTopology,
    identities: IdentityRegistry,
    team_registry: TeamRegistry,
    task_store: TaskStore,
    note_store: NoteStore,
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

fn handle(
    request: tiny_http::Request,
    topology: &WireTopology,
    identities: &IdentityRegistry,
    team_registry: &TeamRegistry,
    task_store: &TaskStore,
    note_store: &NoteStore,
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
        (&Method::Get, "/v1/peers") => peers(request, topology, identities, pty_manager, &query),
        (&Method::Get, "/v1/whoami") => whoami(request, identities, &query),
        (&Method::Post, "/v1/self") => register_self(request, identities),
        (&Method::Post, "/v1/spawn") => spawn(request, topology, team_registry, app_handle),
        (&Method::Post, "/v1/send") => send(request, topology, pty_manager),
        (&Method::Get, "/v1/read") => read(request, topology, pty_manager, &query),
        (&Method::Get, "/v1/watch") => watch(request, topology, pty_manager, &query),
        (&Method::Post, "/v1/teams") => teams_create(request, team_registry, app_handle),
        (&Method::Get, "/v1/teams") => teams_list(request, team_registry),
        (&Method::Get, "/v1/tasks") => tasks_list_route(request, task_store),
        (&Method::Post, "/v1/tasks") => tasks_create_route(request, task_store, app_handle),
        (&Method::Get, "/v1/wires") => wires_list_route(request, topology),
        (&Method::Post, "/v1/wires") => wires_create_route(request, topology, app_handle),
        (&Method::Get, "/v1/terminals") => terminals_list_route(request, pty_manager, identities),
        (&Method::Get, "/v1/notes") => notes_list_route(request, note_store),
        (&Method::Post, "/v1/notes") => notes_create_route(request, note_store, app_handle),
        _ => {
            if let Some(task_id) = path.strip_prefix("/v1/tasks/") {
                match &method {
                    &Method::Patch => tasks_patch_route(request, task_store, task_id, app_handle),
                    &Method::Delete => tasks_delete_route(request, task_store, task_id, app_handle),
                    _ => {
                        let _ = request.respond(empty(404));
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
                        team_id,
                        app_handle,
                    ),
                    (&Method::Post, Some("dm")) => team_dm(
                        request,
                        team_registry,
                        pty_manager,
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

fn peers(
    request: tiny_http::Request,
    topology: &WireTopology,
    identities: &IdentityRegistry,
    pty_manager: &Arc<Mutex<PtyManager>>,
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
    // Lazy liveness filter: drop any peer whose PTY is gone so stale wires
    // don't surface on the frontend.
    let peer_entries: Vec<Identity> = {
        let live = pty_manager
            .lock()
            .map(|m| m.live_ids())
            .unwrap_or_default();
        peer_ids
            .into_iter()
            .filter(|id| live.iter().any(|l| l == id))
            .map(|id| identities.get(&id))
            .collect()
    };
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
                let prompt = format!(
                    "# Role: {name}\n\n\
                     You are running inside a Wodouyao canvas terminal as **{name}**.\n\n\
                     ## Startup (run these NOW)\n\n\
                     ```sh\n\
                     wodouyao hello --name \"{name}\" --kind claude\n\
                     wodouyao task list\n\
                     ```\n\n\
                     ## Key Commands\n\n\
                     - `wodouyao peers` — list connected peers\n\
                     - `wodouyao task list` — view tasks\n\
                     - `wodouyao task take <id>` — claim a task\n\
                     - `wodouyao task done <id>` — mark complete\n\
                     - `wodouyao send <peer> \"text\" Enter` — send to peer\n\
                     - `wodouyao read <peer>` — read peer output\n\
                     - `wodouyao note add \"text\"` — add a sticky note\n\n\
                     ## Workflow\n\n\
                     1. Register identity (hello)\n\
                     2. Check task list\n\
                     3. Claim an unclaimed task (take)\n\
                     4. Complete the work\n\
                     5. Mark done, then check for more tasks\n",
                    name = agent_name,
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
            "codex" => Some("codex".into()),
            "opencode" => Some("opencode".into()),
            _ => None,
        })
    });

    let payload = SpawnEventPayload {
        id: new_id.clone(),
        name: parsed.name,
        kind: parsed.kind,
        command,
        cwd: parsed.cwd,
        auto_wire_from: parsed.auto_wire_from,
        team_id,
        team_role: team_role_out,
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

    let bytes = match parsed.mode.as_deref().unwrap_or("keys") {
        "raw" => parsed.text.into_bytes(),
        "keys" => keys::parse_keys(&parsed.text),
        other => {
            let _ = request.respond(text(400, &format!("unknown mode: {}", other)));
            return;
        }
    };

    let result = {
        let mut mgr = match pty_manager.lock() {
            Ok(g) => g,
            Err(e) => {
                let _ = request.respond(text(500, &format!("pty lock: {}", e)));
                return;
            }
        };
        mgr.write_to_session(&parsed.to, &bytes)
    };

    match result {
        Ok(()) => {
            let _ = request.respond(empty(204));
        }
        Err(e) => {
            let _ = request.respond(text(500, &e));
        }
    }
}

fn read(
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

fn fanout_send(
    pty_manager: &Arc<Mutex<PtyManager>>,
    targets: &[String],
    bytes: &[u8],
) -> (usize, Vec<serde_json::Value>) {
    let mut sent = 0usize;
    let mut failed: Vec<serde_json::Value> = Vec::new();
    let mut mgr = match pty_manager.lock() {
        Ok(g) => g,
        Err(e) => {
            for id in targets {
                failed.push(serde_json::json!({ "id": id, "err": format!("pty lock: {}", e) }));
            }
            return (sent, failed);
        }
    };
    for id in targets {
        match mgr.write_to_session(id, bytes) {
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
    let bytes = match encode_payload(&parsed.text, parsed.mode.as_deref()) {
        Ok(b) => b,
        Err(e) => {
            let _ = request.respond(text(400, &e));
            return;
        }
    };
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
    let bytes = match encode_payload(&parsed.text, parsed.mode.as_deref()) {
        Ok(b) => b,
        Err(e) => {
            let _ = request.respond(text(400, &e));
            return;
        }
    };
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
