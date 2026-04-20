use tauri::State;

use crate::state::AppState;
use crate::web_nodes::{WebNode, WebNodeCreate, WebNodePatch};

#[tauri::command]
pub fn web_nodes_list(state: State<'_, AppState>) -> Vec<WebNode> {
    state.web_nodes.list()
}

#[tauri::command]
pub fn web_nodes_create(state: State<'_, AppState>, input: WebNodeCreate) -> WebNode {
    state.web_nodes.create(input)
}

#[tauri::command]
pub fn web_nodes_update(
    state: State<'_, AppState>,
    id: String,
    patch: WebNodePatch,
) -> Option<WebNode> {
    state.web_nodes.update(&id, patch)
}

#[tauri::command]
pub fn web_nodes_remove(state: State<'_, AppState>, id: String) -> bool {
    state.web_nodes.remove(&id)
}

#[tauri::command]
pub fn web_nodes_replace_all(state: State<'_, AppState>, nodes: Vec<WebNode>) {
    state.web_nodes.replace_all(nodes);
}

/// Fetch and return basic metadata (title + first paragraph + content-type).
/// Used by the WebNode create dialog to populate title on paste.
#[tauri::command]
pub fn web_nodes_fetch_meta(url: String) -> Result<WebFetchedMeta, String> {
    let (body, content_type) = crate::web_nodes::fetch_text(&url, 256 * 1024)?;
    let title = extract_title(&body).unwrap_or_default();
    let description = extract_description(&body).unwrap_or_default();
    Ok(WebFetchedMeta {
        title,
        description,
        content_type,
    })
}

#[derive(serde::Serialize)]
pub struct WebFetchedMeta {
    pub title: String,
    pub description: String,
    pub content_type: String,
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let tag_end = lower[start..].find('>')? + start + 1;
    let end = lower[tag_end..].find("</title>")? + tag_end;
    Some(html[tag_end..end].trim().to_string())
}

fn extract_description(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let idx = lower.find("name=\"description\"").or_else(|| lower.find("property=\"og:description\""))?;
    let tail = &lower[idx..];
    let content_idx = tail.find("content=\"")? + idx + "content=\"".len();
    let rest = &html[content_idx..];
    let end = rest.find('"')?;
    Some(rest[..end].trim().to_string())
}
