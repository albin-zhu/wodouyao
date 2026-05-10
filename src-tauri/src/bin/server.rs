//! Headless wodouyao server — the C/S counterpart to the Tauri desktop
//! shell. Reuses the same Rust core (PTY manager, hub stores, settings)
//! and exposes commands over HTTP + a WebSocket event stream that a
//! browser-side SPA consumes via `src/services/transport.ts`.
//!
//! `POST /v1/cmd/{name}` is the universal IPC endpoint — body is a JSON
//! object whose keys mirror the camelCase parameter names that the
//! existing Tauri frontend already sends to `invoke()`. A future commit
//! adds the `GET /v1/events` WebSocket multiplexer.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::Value;
use uuid::Uuid;

use wodouyao_lib::commands;
use wodouyao_lib::file_nodes::FileNodeStore;
use wodouyao_lib::hub::{server as hub_server, IdentityRegistry, TeamRegistry, WireTopology};
use wodouyao_lib::notes::NoteStore;
use wodouyao_lib::pty::manager::PtyManager;
use wodouyao_lib::runtime::web_impl::{WebEmitter, WebEvent, WebPathResolver};
use wodouyao_lib::runtime::{EventEmitter, PathResolver};
use wodouyao_lib::state::AppState;
use wodouyao_lib::task_boards::TaskBoardStore;
use wodouyao_lib::tasks::TaskStore;

#[derive(Clone)]
struct ServerState {
    inner: Arc<AppState>,
    emitter: Arc<WebEmitter>,
    bearer_token: String,
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    wodouyao_lib::hydrate_login_shell_env();

    let topology = WireTopology::new();
    let identities = IdentityRegistry::new();
    let team_registry = TeamRegistry::new();
    let task_store = TaskStore::new();
    let note_store = NoteStore::new();
    let file_node_store = FileNodeStore::new();
    let task_board_store = TaskBoardStore::new();

    let web_emitter = Arc::new(WebEmitter::new(1024));
    let emitter: Arc<dyn EventEmitter> = web_emitter.clone();
    let path_resolver: Arc<dyn PathResolver> = Arc::new(WebPathResolver::new());

    let pty_manager = Arc::new(Mutex::new(PtyManager::new(emitter.clone())));
    let hub_handle = hub_server::start(
        topology.clone(),
        identities.clone(),
        team_registry.clone(),
        task_store.clone(),
        note_store.clone(),
        file_node_store.clone(),
        task_board_store.clone(),
        pty_manager.clone(),
        emitter.clone(),
    )
    .expect("failed to start hub server");
    log::info!("hub listening at {}", hub_handle.url);

    let app_state = Arc::new(AppState::new(
        hub_handle,
        pty_manager,
        topology,
        identities,
        team_registry,
        task_store,
        note_store,
        file_node_store,
        task_board_store,
        emitter.clone(),
        path_resolver,
    ));

    let bearer_token = Uuid::new_v4().to_string();
    let server_state = ServerState {
        inner: app_state,
        emitter: web_emitter,
        bearer_token: bearer_token.clone(),
    };

    // /v1/events sits outside the Bearer-header middleware because browsers
    // can't attach Authorization headers to WebSocket upgrades — the
    // handler validates a `?token=…` query param itself.
    let private = Router::new()
        .route("/v1/ping", get(ping))
        .route("/v1/cmd/:name", post(cmd_dispatch))
        .layer(middleware::from_fn_with_state(
            server_state.clone(),
            bearer_auth,
        ));
    let public = Router::new().route("/v1/events", get(ws_events));
    let app = public.merge(private).with_state(server_state);

    let addr: SocketAddr = "127.0.0.1:0".parse().expect("hardcoded addr");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind failed");
    let local_addr = listener.local_addr().expect("local_addr failed");
    println!("wodouyao-server listening at:");
    println!("  http://{}/#token={}", local_addr, bearer_token);
    println!("(open the URL above in a browser; SSH-tunnel the port if remote)");
    log::info!("wodouyao-server bound to {}", local_addr);

    axum::serve(listener, app).await.expect("axum serve failed");
}

async fn ping() -> Json<Value> {
    Json(serde_json::json!({ "ok": true, "service": "wodouyao-server" }))
}

async fn bearer_auth(
    State(state): State<ServerState>,
    req: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth = req.headers().get("authorization");
    let ok = match auth.and_then(|v| v.to_str().ok()) {
        Some(v) if v.starts_with("Bearer ") => &v[7..] == state.bearer_token,
        _ => false,
    };
    if ok {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

#[derive(Deserialize)]
struct EventsQuery {
    token: String,
}

async fn ws_events(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
    Query(q): Query<EventsQuery>,
) -> Response {
    if q.token != state.bearer_token {
        return (StatusCode::UNAUTHORIZED, "bad token").into_response();
    }
    ws.on_upgrade(move |socket| handle_ws(socket, state.emitter.clone()))
}

/// Drain the broadcast channel onto a single WS connection. Text frames
/// carry a JSON envelope `{event, payload}`; binary frames carry
/// terminal output framed as `[id_len:u8][id_utf8][data]`. Lagged
/// receivers (slow clients) skip dropped events and keep going — fine
/// for status pings, lossy for terminal output, but acceptable for
/// self-use over a LAN tunnel.
async fn handle_ws(mut socket: WebSocket, emitter: Arc<WebEmitter>) {
    let mut rx = emitter.subscribe();
    loop {
        match rx.recv().await {
            Ok(event) => {
                let msg = match event {
                    WebEvent::Json { event, payload } => {
                        let envelope =
                            serde_json::json!({ "event": event, "payload": payload });
                        Message::Text(envelope.to_string())
                    }
                    WebEvent::TerminalOutput { id, data } => {
                        let id_bytes = id.as_bytes();
                        let id_len = id_bytes.len().min(255) as u8;
                        let mut frame = Vec::with_capacity(1 + id_bytes.len() + data.len());
                        frame.push(id_len);
                        frame.extend_from_slice(&id_bytes[..id_len as usize]);
                        frame.extend_from_slice(&data);
                        Message::Binary(frame)
                    }
                    WebEvent::TerminalExit { id, exit_code } => {
                        let envelope = serde_json::json!({
                            "event": format!("terminal-exit-{}", id),
                            "payload": { "id": id, "exit_code": exit_code }
                        });
                        Message::Text(envelope.to_string())
                    }
                };
                if socket.send(msg).await.is_err() {
                    break;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                log::warn!("ws client lagged by {} events; continuing", n);
                continue;
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
}

#[derive(Debug)]
enum AppError {
    BadRequest(String),
    Internal(String),
    NotFound(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (code, msg) = match self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            AppError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m),
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, m),
        };
        (code, msg).into_response()
    }
}

fn extract<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, AppError> {
    let v = args.get(key).cloned().unwrap_or(Value::Null);
    serde_json::from_value(v).map_err(|e| AppError::BadRequest(format!("{}: {}", key, e)))
}

fn ok<T: serde::Serialize>(value: T) -> Result<Json<Value>, AppError> {
    serde_json::to_value(value)
        .map(Json)
        .map_err(|e| AppError::Internal(format!("response serialize: {}", e)))
}

fn err_to_app(s: String) -> AppError {
    AppError::Internal(s)
}

/// Universal command endpoint. Body is the same shape Tauri's
/// `invoke()` second-arg sends (camelCase keys mapping to the Rust
/// command function's parameters). Each match arm extracts what it
/// needs and forwards to the corresponding `*_impl` in
/// `wodouyao_lib::commands`.
async fn cmd_dispatch(
    Path(name): Path<String>,
    State(state): State<ServerState>,
    Json(args): Json<Value>,
) -> Result<Json<Value>, AppError> {
    let s = &*state.inner;

    match name.as_str() {
        // ── hub ────────────────────────────────────────────────────────
        "get_hub_endpoint" => ok(commands::hub::get_hub_endpoint_impl(s)),
        "bootstrap_workflow" => {
            let roles = extract(&args, "roles")?;
            let wire_mesh = extract::<Option<bool>>(&args, "wireMesh").unwrap_or(None);
            let cwd = extract::<Option<String>>(&args, "cwd").unwrap_or(None);
            commands::hub::bootstrap_workflow_impl(s, roles, wire_mesh, cwd)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── terminal ───────────────────────────────────────────────────
        "create_terminal" => {
            let request = extract(&args, "request")?;
            commands::terminal::create_terminal_impl(s, request)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "destroy_terminal" => {
            let id: String = extract(&args, "id")?;
            commands::terminal::destroy_terminal_impl(s, &id)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "write_terminal" => {
            let id: String = extract(&args, "id")?;
            let data: Vec<u8> = extract(&args, "data")?;
            commands::terminal::write_terminal_impl(s, &id, &data)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "resize_terminal" => {
            let id: String = extract(&args, "id")?;
            let cols: u16 = extract(&args, "cols")?;
            let rows: u16 = extract(&args, "rows")?;
            commands::terminal::resize_terminal_impl(s, &id, cols, rows)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "get_default_shell" => ok(commands::terminal::get_default_shell_impl()),
        "list_available_shells" => ok(commands::terminal::list_available_shells_impl()),
        "save_clipboard_image" => {
            let data: Vec<u8> = extract(&args, "data")?;
            let ext: String = extract(&args, "ext")?;
            commands::terminal::save_clipboard_image_impl(&data, &ext)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── workspace ──────────────────────────────────────────────────
        "save_workspace" => {
            let workspace = extract(&args, "workspace")?;
            commands::workspace::save_workspace_impl(s, workspace)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "load_workspace" => {
            let id: String = extract(&args, "id")?;
            commands::workspace::load_workspace_impl(s, &id)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "list_workspaces" => commands::workspace::list_workspaces_impl()
            .map_err(err_to_app)
            .and_then(ok),
        "delete_workspace" => {
            let id: String = extract(&args, "id")?;
            commands::workspace::delete_workspace_impl(&id)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "save_workspace_terminals" => {
            let id: String = extract(&args, "id")?;
            let terminals = extract(&args, "terminals")?;
            commands::workspace::save_workspace_terminals_impl(&id, terminals)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── settings ───────────────────────────────────────────────────
        "get_settings" => commands::settings::get_settings_impl()
            .map_err(err_to_app)
            .and_then(ok),
        "update_settings" => {
            let settings = extract(&args, "settings")?;
            commands::settings::update_settings_impl(&settings)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── agents ─────────────────────────────────────────────────────
        "detect_cli_agents" => ok(commands::agents::detect_cli_agents_impl()),

        // ── wire ───────────────────────────────────────────────────────
        "wire_list" => ok(commands::wire::wire_list_impl(s)),
        "wire_create" => {
            let source_id: String = extract(&args, "sourceId")?;
            let target_id: String = extract(&args, "targetId")?;
            let kind: Option<String> = extract(&args, "kind").unwrap_or(None);
            let workspace_id: Option<String> =
                extract(&args, "workspaceId").unwrap_or(None);
            ok(commands::wire::wire_create_impl(
                s,
                source_id,
                target_id,
                kind,
                workspace_id,
            ))
        }
        "wire_remove" => {
            let id: String = extract(&args, "id")?;
            ok(commands::wire::wire_remove_impl(s, &id))
        }
        "wire_replace_all" => {
            let wires = extract(&args, "wires")?;
            commands::wire::wire_replace_all_impl(s, wires);
            ok(())
        }
        "wire_peers_for" => {
            let terminal_id: String = extract(&args, "terminalId")?;
            ok(commands::wire::wire_peers_for_impl(s, &terminal_id))
        }

        // ── integrations ───────────────────────────────────────────────
        "integrations_status" => ok(commands::integrations::integrations_status_impl()),
        "integrations_install" => {
            let agent: String = extract(&args, "agent")?;
            commands::integrations::integrations_install_impl(s, &agent)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "integrations_uninstall" => {
            let agent: String = extract(&args, "agent")?;
            commands::integrations::integrations_uninstall_impl(&agent)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── teams ──────────────────────────────────────────────────────
        "teams_list" => ok(commands::team::teams_list_impl(s)),
        "teams_team_for_terminal" => {
            let term_id: String = extract(&args, "termId")?;
            ok(commands::team::teams_team_for_terminal_impl(s, &term_id))
        }
        "teams_dissolve" => {
            let team_id: String = extract(&args, "teamId")?;
            commands::team::teams_dissolve_impl(s, &team_id)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "teams_create" => {
            let name: String = extract(&args, "name")?;
            let palette: Option<String> = extract(&args, "palette").unwrap_or(None);
            let as_lead: Option<bool> = extract(&args, "asLead").unwrap_or(None);
            let caller_term_id: Option<String> =
                extract(&args, "callerTermId").unwrap_or(None);
            commands::team::teams_create_impl(s, &name, palette.as_deref(), as_lead, caller_term_id)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "teams_join" => {
            let team_id: String = extract(&args, "teamId")?;
            let term_id: String = extract(&args, "termId")?;
            let role: Option<String> = extract(&args, "role").unwrap_or(None);
            commands::team::teams_join_impl(s, &team_id, term_id, role.as_deref())
                .map_err(err_to_app)
                .and_then(ok)
        }
        "teams_leave" => {
            let team_id: String = extract(&args, "teamId")?;
            let term_id: String = extract(&args, "termId")?;
            commands::team::teams_leave_impl(s, &team_id, &term_id)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── file preview ───────────────────────────────────────────────
        "file_preview_text" => {
            let path: String = extract(&args, "path")?;
            let max_bytes: Option<usize> = extract(&args, "maxBytes").unwrap_or(None);
            commands::file_preview::file_preview_text_impl(&path, max_bytes)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "file_preview_dir" => {
            let path: String = extract(&args, "path")?;
            commands::file_preview::file_preview_dir_impl(&path)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "file_inspect" => {
            let path: String = extract(&args, "path")?;
            commands::file_preview::file_inspect_impl(&path)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── tasks ──────────────────────────────────────────────────────
        "tasks_list" => ok(commands::tasks::tasks_list_impl(s)),
        "tasks_create" => {
            let input = extract(&args, "input")?;
            commands::tasks::tasks_create_impl(s, input)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "tasks_update" => {
            let id: String = extract(&args, "id")?;
            let patch = extract(&args, "patch")?;
            commands::tasks::tasks_update_impl(s, &id, patch)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "tasks_remove" => {
            let id: String = extract(&args, "id")?;
            commands::tasks::tasks_remove_impl(s, &id)
                .map_err(err_to_app)
                .and_then(ok)
        }

        // ── notes ──────────────────────────────────────────────────────
        "notes_list" => ok(commands::notes::notes_list_impl(s)),
        "notes_create" => {
            let input = extract(&args, "input")?;
            ok(commands::notes::notes_create_impl(s, input))
        }
        "notes_update" => {
            let id: String = extract(&args, "id")?;
            let patch = extract(&args, "patch")?;
            ok(commands::notes::notes_update_impl(s, &id, patch))
        }
        "notes_remove" => {
            let id: String = extract(&args, "id")?;
            ok(commands::notes::notes_remove_impl(s, &id))
        }
        "notes_replace_all" => {
            let notes = extract(&args, "notes")?;
            commands::notes::notes_replace_all_impl(s, notes);
            ok(())
        }

        // ── file nodes ─────────────────────────────────────────────────
        "file_nodes_list" => ok(commands::file_nodes::file_nodes_list_impl(s)),
        "file_nodes_create" => {
            let input = extract(&args, "input")?;
            ok(commands::file_nodes::file_nodes_create_impl(s, input))
        }
        "file_nodes_update" => {
            let id: String = extract(&args, "id")?;
            let patch = extract(&args, "patch")?;
            ok(commands::file_nodes::file_nodes_update_impl(s, &id, patch))
        }
        "file_nodes_remove" => {
            let id: String = extract(&args, "id")?;
            ok(commands::file_nodes::file_nodes_remove_impl(s, &id))
        }
        "file_nodes_replace_all" => {
            let nodes = extract(&args, "nodes")?;
            commands::file_nodes::file_nodes_replace_all_impl(s, nodes);
            ok(())
        }

        // ── task boards ────────────────────────────────────────────────
        "task_boards_list" => ok(commands::task_boards::task_boards_list_impl(s)),
        "task_boards_create" => {
            let input = extract(&args, "input")?;
            ok(commands::task_boards::task_boards_create_impl(s, input))
        }
        "task_boards_update" => {
            let id: String = extract(&args, "id")?;
            let patch = extract(&args, "patch")?;
            ok(commands::task_boards::task_boards_update_impl(s, &id, patch))
        }
        "task_boards_remove" => {
            let id: String = extract(&args, "id")?;
            ok(commands::task_boards::task_boards_remove_impl(s, &id))
        }
        "task_boards_replace_all" => {
            let boards = extract(&args, "boards")?;
            commands::task_boards::task_boards_replace_all_impl(s, boards);
            ok(())
        }

        // ── shaders ────────────────────────────────────────────────────
        "shaders_list" => commands::shaders::shaders_list_impl()
            .map_err(err_to_app)
            .and_then(ok),
        "shaders_get" => {
            let name: String = extract(&args, "name")?;
            commands::shaders::shaders_get_impl(&name)
                .map_err(err_to_app)
                .and_then(ok)
        }
        "shaders_dir_path" => commands::shaders::shaders_dir_path_impl()
            .map_err(err_to_app)
            .and_then(ok),

        // ── misc ───────────────────────────────────────────────────────
        "open_url" => {
            // Web mode: the frontend handles `window.open(url)` itself; the
            // server just no-ops to avoid breaking the IPC contract.
            ok(())
        }

        other => Err(AppError::NotFound(format!("unknown command: {}", other))),
    }
}
