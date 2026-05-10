//! Headless wodouyao server — the C/S counterpart to the Tauri desktop
//! shell. Reuses the same Rust core (PTY manager, hub stores, settings)
//! and exposes commands over HTTP + a WebSocket event stream that a
//! browser-side SPA consumes via `src/services/transport.ts`.
//!
//! Phase 2a scaffolding: starts the existing tiny_http hub on its usual
//! port, builds a minimal axum app with Bearer auth and a /v1/ping
//! endpoint, and binds 127.0.0.1:0. Command routing and WS streaming
//! land in subsequent commits.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::{
    extract::State,
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use wodouyao_lib::file_nodes::FileNodeStore;
use wodouyao_lib::hub::{server as hub_server, IdentityRegistry, TeamRegistry, WireTopology};
use wodouyao_lib::notes::NoteStore;
use wodouyao_lib::pty::manager::PtyManager;
use wodouyao_lib::runtime::web_impl::{WebEmitter, WebPathResolver};
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

    // Same set of stores the Tauri build constructs.
    let topology = WireTopology::new();
    let identities = IdentityRegistry::new();
    let team_registry = TeamRegistry::new();
    let task_store = TaskStore::new();
    let note_store = NoteStore::new();
    let file_node_store = FileNodeStore::new();
    let task_board_store = TaskBoardStore::new();

    // Web event bus — broadcast channel fans out to all connected WS
    // clients. Capacity 1024 buffers a generous amount of terminal
    // output between client polls.
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

    let app = Router::new()
        .route("/v1/ping", get(ping))
        .layer(middleware::from_fn_with_state(
            server_state.clone(),
            bearer_auth,
        ))
        .with_state(server_state);

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

async fn ping() -> Json<serde_json::Value> {
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
