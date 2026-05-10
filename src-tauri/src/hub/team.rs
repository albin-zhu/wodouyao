use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub palette: TeamPalette,
    pub members: Vec<TeamMember>,
    pub created_at: u64,
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Task {
    pub id: String,
    pub subject: String,
    #[serde(default)]
    pub description: String,
    pub status: TaskStatus,
    #[serde(default)]
    pub owner: Option<String>,
    pub created_by: String,
    pub created_at: u64,
    #[serde(default)]
    pub blocked_by: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Deleted,
}

#[derive(Deserialize, Default, Debug)]
pub struct TaskPatch {
    #[serde(default)]
    pub status: Option<TaskStatus>,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub add_blocked_by: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TeamMember {
    pub term_id: String,
    pub role: Role,
    pub joined_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Lead,
    Worker,
    Observer,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TeamPalette {
    pub key: String,
    pub base: String,
    pub members: Vec<String>,
}

pub fn palette_for(key: &str) -> TeamPalette {
    match key {
        "sunset" => TeamPalette {
            key: "sunset".to_string(),
            base: "#ff9e64".to_string(),
            members: vec![
                "#ff9e64".to_string(),
                "#f7768e".to_string(),
                "#e0af68".to_string(),
                "#d7827e".to_string(),
            ],
        },
        "forest" => TeamPalette {
            key: "forest".to_string(),
            base: "#9ece6a".to_string(),
            members: vec![
                "#9ece6a".to_string(),
                "#73daca".to_string(),
                "#449dab".to_string(),
                "#41a6b5".to_string(),
            ],
        },
        _ => TeamPalette {
            key: "blue".to_string(),
            base: "#7aa2f7".to_string(),
            members: vec![
                "#7aa2f7".to_string(),
                "#2ac3de".to_string(),
                "#89ddff".to_string(),
                "#b4f9f8".to_string(),
            ],
        },
    }
}

#[derive(Clone, Default)]
pub struct TeamRegistry {
    inner: Arc<Mutex<HashMap<String, Team>>>,
}

impl TeamRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create(&self, name: &str, palette_key: &str, workspace_id: Option<String>) -> Result<Team, String> {
        let mut map = self.inner.lock().unwrap();
        if map.values().any(|t| t.name == name) {
            return Err("duplicate_name".to_string());
        }
        let team = Team {
            id: format!("team_{}", Uuid::new_v4().simple()),
            name: name.to_string(),
            palette: palette_for(palette_key),
            members: Vec::new(),
            created_at: now_ms(),
            tasks: Vec::new(),
            workspace_id,
        };
        map.insert(team.id.clone(), team.clone());
        Ok(team)
    }

    pub fn list(&self) -> Vec<Team> {
        self.inner.lock().unwrap().values().cloned().collect()
    }

    pub fn get(&self, id: &str) -> Option<Team> {
        self.inner.lock().unwrap().get(id).cloned()
    }

    pub fn find_by_name(&self, name: &str) -> Option<Team> {
        self.inner
            .lock()
            .unwrap()
            .values()
            .find(|t| t.name == name)
            .cloned()
    }

    /// Returns the term_id of the team's lead, if one is present.
    pub fn find_lead(&self, team_id: &str) -> Option<String> {
        self.inner.lock().unwrap().get(team_id).and_then(|t| {
            t.members
                .iter()
                .find(|m| matches!(m.role, Role::Lead))
                .map(|m| m.term_id.clone())
        })
    }

    pub fn join(&self, team_id: &str, term_id: String, role: Role) -> Result<Team, String> {
        let mut map = self.inner.lock().unwrap();
        for t in map.values() {
            if t.members.iter().any(|m| m.term_id == term_id) {
                return Err("already_in_team".to_string());
            }
        }
        let team = map.get_mut(team_id).ok_or_else(|| "not_found".to_string())?;
        team.members.push(TeamMember {
            term_id,
            role,
            joined_at: now_ms(),
        });
        Ok(team.clone())
    }

    pub fn leave(&self, team_id: &str, term_id: &str) -> Result<Team, String> {
        let mut map = self.inner.lock().unwrap();
        let team = map.get_mut(team_id).ok_or_else(|| "not_found".to_string())?;
        team.members.retain(|m| m.term_id != term_id);
        Ok(team.clone())
    }

    pub fn dissolve(&self, team_id: &str) -> Result<Vec<String>, String> {
        let mut map = self.inner.lock().unwrap();
        let team = map.remove(team_id).ok_or_else(|| "not_found".to_string())?;
        Ok(team.members.into_iter().map(|m| m.term_id).collect())
    }

    pub fn team_for_terminal(&self, term_id: &str) -> Option<Team> {
        self.inner
            .lock()
            .unwrap()
            .values()
            .find(|t| t.members.iter().any(|m| m.term_id == term_id))
            .cloned()
    }

    pub fn replace_all(&self, teams: Vec<Team>) {
        let mut map = self.inner.lock().unwrap();
        map.clear();
        for t in teams {
            map.insert(t.id.clone(), t);
        }
    }

    pub fn task_list(&self, team_id: &str) -> Result<Vec<Task>, String> {
        let map = self.inner.lock().unwrap();
        let team = map.get(team_id).ok_or_else(|| "not_found".to_string())?;
        Ok(team
            .tasks
            .iter()
            .filter(|t| t.status != TaskStatus::Deleted)
            .cloned()
            .collect())
    }

    pub fn task_get(&self, team_id: &str, task_id: &str) -> Result<Task, String> {
        let map = self.inner.lock().unwrap();
        let team = map.get(team_id).ok_or_else(|| "not_found".to_string())?;
        team.tasks
            .iter()
            .find(|t| t.id == task_id)
            .cloned()
            .ok_or_else(|| "not_found".to_string())
    }

    pub fn task_add(
        &self,
        team_id: &str,
        created_by: String,
        subject: String,
        description: String,
        blocked_by: Vec<String>,
    ) -> Result<Task, String> {
        if subject.trim().is_empty() {
            return Err("empty_subject".to_string());
        }
        let mut map = self.inner.lock().unwrap();
        let team = map.get_mut(team_id).ok_or_else(|| "not_found".to_string())?;
        let task = Task {
            id: format!("task_{}", Uuid::new_v4().simple()),
            subject,
            description,
            status: TaskStatus::Pending,
            owner: None,
            created_by,
            created_at: now_ms(),
            blocked_by,
        };
        team.tasks.push(task.clone());
        Ok(task)
    }

    pub fn task_update(
        &self,
        team_id: &str,
        task_id: &str,
        patch: TaskPatch,
    ) -> Result<Task, String> {
        let mut map = self.inner.lock().unwrap();
        let team = map.get_mut(team_id).ok_or_else(|| "not_found".to_string())?;
        let task = team
            .tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| "not_found".to_string())?;
        if let Some(s) = patch.status {
            task.status = s;
        }
        if let Some(o) = patch.owner {
            task.owner = if o.is_empty() { None } else { Some(o) };
        }
        if let Some(s) = patch.subject {
            task.subject = s;
        }
        if let Some(d) = patch.description {
            task.description = d;
        }
        for b in patch.add_blocked_by {
            if !task.blocked_by.contains(&b) {
                task.blocked_by.push(b);
            }
        }
        Ok(task.clone())
    }
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
