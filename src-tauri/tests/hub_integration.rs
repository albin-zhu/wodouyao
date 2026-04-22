use std::sync::{Arc, Mutex, OnceLock};

use wodouyao_lib::file_nodes::FileNodeStore;
use wodouyao_lib::hub::{
    self, AppHandleSlot, HubHandle, IdentityRegistry, Role, TeamRegistry, Wire, WireTopology,
};
use wodouyao_lib::notes::NoteStore;
use wodouyao_lib::pty::manager::PtyManager;
use wodouyao_lib::task_boards::TaskBoardStore;
use wodouyao_lib::tasks::TaskStore;
use wodouyao_lib::workspace::storage::{self as ws_storage, CanvasState, Workspace};

fn fresh_hub() -> (
    HubHandle,
    WireTopology,
    IdentityRegistry,
    TeamRegistry,
    Arc<Mutex<PtyManager>>,
) {
    let topology = WireTopology::new();
    let identities = IdentityRegistry::new();
    let team_registry = TeamRegistry::new();
    let task_store = TaskStore::new();
    let note_store = NoteStore::new();
    let file_node_store = FileNodeStore::new();
    let task_board_store = TaskBoardStore::new();
    let pty_manager = Arc::new(Mutex::new(PtyManager::new()));
    let app_handle_slot: AppHandleSlot = Arc::new(OnceLock::new());
    let handle = hub::server::start(
        topology.clone(),
        identities.clone(),
        team_registry.clone(),
        task_store,
        note_store,
        file_node_store,
        task_board_store,
        pty_manager.clone(),
        app_handle_slot,
    )
    .expect("hub should start on loopback");
    (handle, topology, identities, team_registry, pty_manager)
}

fn bearer(handle: &HubHandle) -> String {
    format!("Bearer {}", handle.token)
}

fn status_of(result: Result<ureq::Response, ureq::Error>) -> u16 {
    match result {
        Ok(resp) => resp.status(),
        Err(ureq::Error::Status(code, _)) => code,
        Err(e) => panic!("transport error: {}", e),
    }
}

#[test]
fn missing_auth_returns_401() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/peers?from=a", handle.url);
    let result = ureq::get(&url).call();
    assert_eq!(status_of(result), 401);
}

#[test]
fn wrong_token_returns_401() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/peers?from=a", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", "Bearer not-the-real-token")
        .call();
    assert_eq!(status_of(result), 401);
}

#[test]
fn peers_for_isolated_terminal_is_empty() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/peers?from=lonely", handle.url);
    let resp = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call()
        .expect("request should succeed");
    assert_eq!(resp.status(), 200);
    let body = resp.into_string().expect("body");
    assert_eq!(body, "[]");
}

#[test]
fn peers_missing_from_param_returns_400() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/peers", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 400);
}

#[test]
fn send_without_wire_returns_403() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/send", handle.url);
    let body = serde_json::json!({
        "from": "a",
        "to": "b",
        "text": "x",
        "mode": "raw",
    });
    let result = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body.to_string());
    assert_eq!(status_of(result), 403);
}

#[test]
fn unknown_path_returns_404() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/nope", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 404);
}

#[test]
fn whoami_for_unregistered_returns_stub() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/whoami?id=ghost", handle.url);
    let body: serde_json::Value = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call()
        .expect("request")
        .into_json()
        .expect("json");
    assert_eq!(body["id"], "ghost");
    assert!(body["name"].is_null());
    assert_eq!(body["capabilities"].as_array().unwrap().len(), 0);
}

#[test]
fn self_register_and_whoami_roundtrip() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let post_url = format!("{}/v1/self", handle.url);
    let payload = serde_json::json!({
        "id": "term-a",
        "name": "Claude",
        "agent_kind": "claude",
        "capabilities": ["ping", "delegate", "x.custom"],
    });
    let resp = ureq::post(&post_url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&payload.to_string())
        .expect("register");
    assert_eq!(resp.status(), 200);

    let who_url = format!("{}/v1/whoami?id=term-a", handle.url);
    let body: serde_json::Value = ureq::get(&who_url)
        .set("Authorization", &bearer(&handle))
        .call()
        .expect("whoami")
        .into_json()
        .expect("json");
    assert_eq!(body["id"], "term-a");
    assert_eq!(body["name"], "Claude");
    assert_eq!(body["agent_kind"], "claude");
    assert!(body["registered_at"].as_u64().unwrap() > 0);
}

#[test]
fn peers_returns_identity_metadata() {
    let (handle, topology, identities, _teams, pty) = fresh_hub();
    topology.insert(Wire {
        id: "w1".into(),
        source_id: "term-a".into(),
        target_id: "term-b".into(),
        forward_output: true,
        kind: None,
        workspace_id: None,
    });
    identities.upsert(wodouyao_lib::hub::Identity {
        id: "term-b".into(),
        name: Some("Peer B".into()),
        agent_kind: Some("shell".into()),
        capabilities: vec!["ping".into()],
        registered_at: 0,
    });
    // Mark term-b as live so the hub's lazy liveness filter doesn't drop it.
    pty.lock().unwrap().mark_live_for_test("term-b".into());
    let url = format!("{}/v1/peers?from=term-a", handle.url);
    let body: serde_json::Value = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call()
        .expect("peers")
        .into_json()
        .expect("json");
    let arr = body.as_array().expect("array");
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], "term-b");
    assert_eq!(arr[0]["name"], "Peer B");
    assert_eq!(arr[0]["agent_kind"], "shell");
    assert_eq!(arr[0]["capabilities"][0], "ping");
}

#[test]
fn self_register_rejects_missing_id() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/self", handle.url);
    let payload = serde_json::json!({"name": "no id here"});
    let result = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&payload.to_string());
    assert_eq!(status_of(result), 400);
}

#[test]
fn peers_drops_dead_terminals() {
    // A wire can survive a terminal destroy briefly; the hub's lazy filter
    // should hide dead peers so the caller never sees zombie entries.
    let (handle, topology, _ids, _teams, _pty) = fresh_hub();
    topology.insert(Wire {
        id: "w1".into(),
        source_id: "term-a".into(),
        target_id: "term-dead".into(),
        forward_output: true,
        kind: None,
        workspace_id: None,
    });
    // Deliberately do NOT mark term-dead as live.
    let url = format!("{}/v1/peers?from=term-a", handle.url);
    let body = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call()
        .expect("peers")
        .into_string()
        .expect("body");
    assert_eq!(body, "[]");
}

#[test]
fn create_team_returns_id_and_palette() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/teams", handle.url);
    let body = serde_json::json!({"name": "alpha", "palette": "blue"}).to_string();
    let resp: serde_json::Value = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("create")
        .into_json()
        .expect("json");
    assert!(resp["id"].as_str().unwrap().starts_with("team_"));
    assert_eq!(resp["name"], "alpha");
    assert_eq!(resp["palette"]["base"], "#7aa2f7");
}

#[test]
fn create_with_lead_joins_caller() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/teams", handle.url);
    let body = serde_json::json!({"name": "alpha", "lead": "term-1"}).to_string();
    let resp: serde_json::Value = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("create")
        .into_json()
        .expect("json");
    let members = resp["members"].as_array().unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["term_id"], "term-1");
    assert_eq!(members[0]["role"], "lead");
}

#[test]
fn create_duplicate_name_rejected() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/teams", handle.url);
    let body = serde_json::json!({"name": "alpha"}).to_string();
    ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("first create");
    let result = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body);
    assert_eq!(status_of(result), 400);
}

#[test]
fn list_teams_returns_seeded_teams() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    teams.create("alpha", "blue").expect("alpha");
    teams.create("beta", "sunset").expect("beta");
    let url = format!("{}/v1/teams", handle.url);
    let body: serde_json::Value = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call()
        .expect("list")
        .into_json()
        .expect("json");
    assert_eq!(body.as_array().unwrap().len(), 2);
}

#[test]
fn join_team_by_id() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    let url = format!("{}/v1/teams/{}/join", handle.url, team.id);
    let body = serde_json::json!({"term_id": "t1"}).to_string();
    let resp: serde_json::Value = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("join")
        .into_json()
        .expect("json");
    let members = resp["members"].as_array().unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["term_id"], "t1");
    assert_eq!(members[0]["role"], "worker");
}

#[test]
fn join_when_already_in_team_is_409() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let a = teams.create("alpha", "blue").expect("seed a");
    let b = teams.create("beta", "sunset").expect("seed b");
    teams
        .join(&a.id, "t1".into(), Role::Worker)
        .expect("preload t1 into a");
    let url = format!("{}/v1/teams/{}/join", handle.url, b.id);
    let body = serde_json::json!({"term_id": "t1"}).to_string();
    let result = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body);
    assert_eq!(status_of(result), 409);
}

#[test]
fn get_nonexistent_team_is_404() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/teams/team_does_not_exist", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 404);
}

#[test]
fn leave_removes_from_members() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    teams
        .join(&team.id, "t1".into(), Role::Worker)
        .expect("join");
    let url = format!("{}/v1/teams/{}/leave", handle.url, team.id);
    let body = serde_json::json!({"term_id": "t1"}).to_string();
    let resp: serde_json::Value = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("leave")
        .into_json()
        .expect("json");
    assert_eq!(resp["members"].as_array().unwrap().len(), 0);
}

#[test]
fn dissolve_team_evicts_members() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    teams.join(&team.id, "m1".into(), Role::Lead).expect("m1");
    teams.join(&team.id, "m2".into(), Role::Worker).expect("m2");
    let dissolve_url = format!("{}/v1/teams/{}/dissolve", handle.url, team.id);
    let body: serde_json::Value = ureq::post(&dissolve_url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string("")
        .expect("dissolve")
        .into_json()
        .expect("json");
    assert_eq!(body["evicted"].as_array().unwrap().len(), 2);
    let get_url = format!("{}/v1/teams/{}", handle.url, team.id);
    let result = ureq::get(&get_url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 404);
}

#[test]
fn spawn_with_team_fans_out_wires() {
    // The HTTP /v1/spawn path requires a live Tauri AppHandle which tests
    // can't provide (the handler returns 503 before touching the team).
    // Mirror spawn's fan-out here: join the team, insert a wire to each
    // prior member, then assert peers_for sees both.
    let (_handle, topology, _ids, teams, pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    teams.join(&team.id, "m1".into(), Role::Worker).expect("m1");
    teams.join(&team.id, "m2".into(), Role::Worker).expect("m2");
    pty.lock().unwrap().mark_live_for_test("m1".into());
    pty.lock().unwrap().mark_live_for_test("m2".into());
    let new_id = "t_new".to_string();
    let prior: Vec<String> = teams
        .get(&team.id)
        .unwrap()
        .members
        .iter()
        .map(|m| m.term_id.clone())
        .collect();
    teams
        .join(&team.id, new_id.clone(), Role::Worker)
        .expect("join new");
    for pid in &prior {
        topology.insert(Wire {
            id: format!("w-{}-{}", new_id, pid),
            source_id: new_id.clone(),
            target_id: pid.clone(),
            forward_output: true,
            kind: None,
            workspace_id: None,
        });
    }
    let peers = topology.peers_for(&new_id);
    assert!(peers.iter().any(|p| p == "m1"));
    assert!(peers.iter().any(|p| p == "m2"));
}

#[test]
fn task_add_returns_id_and_fields() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    let url = format!("{}/v1/teams/{}/tasks", handle.url, team.id);
    let body =
        serde_json::json!({"subject": "ship it", "description": "desc", "created_by": "t1"})
            .to_string();
    let resp: serde_json::Value = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("create")
        .into_json()
        .expect("json");
    assert!(resp["id"].as_str().unwrap().starts_with("task_"));
    assert_eq!(resp["subject"], "ship it");
    assert_eq!(resp["status"], "pending");
    assert_eq!(resp["created_by"], "t1");
}

#[test]
fn task_list_filters_deleted() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    let keep = teams
        .task_add(&team.id, "t1".into(), "keep".into(), String::new(), vec![])
        .expect("keep");
    let drop = teams
        .task_add(&team.id, "t1".into(), "drop".into(), String::new(), vec![])
        .expect("drop");
    let mut patch = wodouyao_lib::hub::TaskPatch::default();
    patch.status = Some(wodouyao_lib::hub::TaskStatus::Deleted);
    teams.task_update(&team.id, &drop.id, patch).expect("delete");
    let url = format!("{}/v1/teams/{}/tasks", handle.url, team.id);
    let body: serde_json::Value = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call()
        .expect("list")
        .into_json()
        .expect("json");
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], keep.id);
}

#[test]
fn task_update_owner_and_status() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    let task = teams
        .task_add(&team.id, "t1".into(), "s".into(), String::new(), vec![])
        .expect("add");
    let url = format!("{}/v1/teams/{}/tasks/{}", handle.url, team.id, task.id);
    let body = serde_json::json!({"owner": "t2", "status": "in_progress"}).to_string();
    let resp: serde_json::Value = ureq::request("PATCH", &url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("patch")
        .into_json()
        .expect("json");
    assert_eq!(resp["owner"], "t2");
    assert_eq!(resp["status"], "in_progress");
}

#[test]
fn task_add_empty_subject_returns_400() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    let url = format!("{}/v1/teams/{}/tasks", handle.url, team.id);
    let body = serde_json::json!({"subject": "", "created_by": "t1"}).to_string();
    let result = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body);
    assert_eq!(status_of(result), 400);
}

#[test]
fn task_patch_nonexistent_returns_404() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    let url = format!("{}/v1/teams/{}/tasks/task_ghost", handle.url, team.id);
    let body = serde_json::json!({"status": "completed"}).to_string();
    let result = ureq::request("PATCH", &url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body);
    assert_eq!(status_of(result), 404);
}

#[test]
fn broadcast_fans_out_to_members() {
    let (handle, _topology, _ids, teams, pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    for id in ["m1", "m2", "m3"] {
        teams.join(&team.id, id.into(), Role::Worker).expect("join");
        pty.lock().unwrap().mark_live_for_test(id.into());
    }
    let url = format!("{}/v1/teams/{}/broadcast", handle.url, team.id);
    let body = serde_json::json!({"from": "m1", "text": "hi", "mode": "raw"}).to_string();
    let resp: serde_json::Value = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("bcast")
        .into_json()
        .expect("json");
    let sent = resp["sent"].as_u64().unwrap();
    let failed = resp["failed"].as_array().unwrap().len() as u64;
    assert_eq!(sent + failed, 2);
}

#[test]
fn broadcast_from_non_member_returns_403() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    teams.join(&team.id, "m1".into(), Role::Worker).expect("join");
    let url = format!("{}/v1/teams/{}/broadcast", handle.url, team.id);
    let body = serde_json::json!({"from": "m2", "text": "x", "mode": "raw"}).to_string();
    let result = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body);
    assert_eq!(status_of(result), 403);
}

#[test]
fn dm_targets_role() {
    let (handle, _topology, _ids, teams, pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    teams.join(&team.id, "lead-1".into(), Role::Lead).expect("lead");
    teams.join(&team.id, "w1".into(), Role::Worker).expect("w1");
    teams.join(&team.id, "w2".into(), Role::Worker).expect("w2");
    for id in ["lead-1", "w1", "w2"] {
        pty.lock().unwrap().mark_live_for_test(id.into());
    }
    let url = format!("{}/v1/teams/{}/dm", handle.url, team.id);
    let body =
        serde_json::json!({"from": "lead-1", "to_role": "worker", "text": "x", "mode": "raw"})
            .to_string();
    let resp: serde_json::Value = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .expect("dm")
        .into_json()
        .expect("json");
    let sent = resp["sent"].as_u64().unwrap();
    let failed = resp["failed"].as_array().unwrap().len() as u64;
    assert_eq!(sent + failed, 2);
}

#[test]
fn dm_unknown_role_returns_400() {
    let (handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    teams.join(&team.id, "m1".into(), Role::Lead).expect("m1");
    let url = format!("{}/v1/teams/{}/dm", handle.url, team.id);
    let body =
        serde_json::json!({"from": "m1", "to_role": "boss", "text": "x", "mode": "raw"})
            .to_string();
    let result = ureq::post(&url)
        .set("Authorization", &bearer(&handle))
        .set("Content-Type", "application/json")
        .send_string(&body);
    assert_eq!(status_of(result), 400);
}

#[test]
fn workspace_teams_roundtrip() {
    let (_handle, _topology, _ids, teams, _pty) = fresh_hub();
    let team = teams.create("alpha", "blue").expect("seed");
    teams.join(&team.id, "m1".into(), Role::Lead).expect("m1");
    teams.join(&team.id, "m2".into(), Role::Worker).expect("m2");
    let snapshot = teams.list();
    let ws_id = format!("ws_test_{}", team.id);
    let ws = Workspace {
        id: ws_id.clone(),
        name: "persist-test".into(),
        cwd: None,
        canvas: CanvasState {
            pan_x: 0.0,
            pan_y: 0.0,
            zoom: 1.0,
            grid_visible: true,
            grid_size: 40.0,
        },
        terminals: vec![],
        wires: vec![],
        teams: snapshot,
        tasks: vec![],
        notes: vec![],
        file_nodes: vec![],
        task_boards: vec![],
        created_at: 0,
        updated_at: 0,
    };
    ws_storage::save(&ws).expect("save");
    let loaded = ws_storage::load(&ws_id).expect("load");
    let _ = ws_storage::delete(&ws_id);
    assert_eq!(loaded.teams.len(), 1);
    assert_eq!(loaded.teams[0].id, team.id);
    assert_eq!(loaded.teams[0].members.len(), 2);
}

#[test]
fn watch_missing_from_returns_400() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/watch?to=term-b", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 400);
}

#[test]
fn watch_missing_to_returns_400() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/watch?from=term-a", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 400);
}

#[test]
fn watch_without_wire_returns_403() {
    let (handle, _topology, _ids, _teams, _pty) = fresh_hub();
    let url = format!("{}/v1/watch?from=term-a&to=term-b", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 403);
}

#[test]
fn watch_target_without_session_returns_404() {
    // Wire passes the ACL check, but `mark_live_for_test` only populates the
    // liveness filter — it doesn't spawn a real PtySession, so subscribe()
    // on `to` returns Err, which the hub maps to 404.
    //
    // Real end-to-end streaming (a live PTY fanning bytes into the response
    // body) isn't exercised here; it's validated by the CLI smoke test.
    let (handle, topology, _ids, _teams, _pty) = fresh_hub();
    topology.insert(Wire {
        id: "w1".into(),
        source_id: "term-a".into(),
        target_id: "term-b".into(),
        forward_output: true,
        kind: None,
        workspace_id: None,
    });
    let url = format!("{}/v1/watch?from=term-a&to=term-b", handle.url);
    let result = ureq::get(&url)
        .set("Authorization", &bearer(&handle))
        .call();
    assert_eq!(status_of(result), 404);
}

#[test]
fn team_registry_replace_all_round_trip() {
    let (_handle, _topology, _ids, teams, _pty) = fresh_hub();
    let a = teams.create("alpha", "blue").expect("a");
    let b = teams.create("beta", "sunset").expect("b");
    let snapshot = teams.list();
    let fresh = TeamRegistry::new();
    fresh.replace_all(snapshot);
    let restored = fresh.list();
    assert_eq!(restored.len(), 2);
    let ids: Vec<String> = restored.iter().map(|t| t.id.clone()).collect();
    assert!(ids.contains(&a.id));
    assert!(ids.contains(&b.id));
}
