# Skills 系统实现 — Context Brief

> 给 fork 出来的 architect / backend / frontend worker 看的一份搜代码代替文档。读完这一份就能开干。

---

## 0. 给 Worker 的 200 字概述

Wodouyao 计划借鉴 OMC 的 Skills 系统（见 `omc-comparison.md`），为每个 terminal 在 spawn 时注入角色相关的 Markdown "skill 片段"进 system prompt。现有基础：**role → system prompt 注入已完整跑通**（hub/server.rs 的 `build_spawn_prompt` + `builtin_role_prompt`），注入点是 `/tmp/wodouyao/prompt_<id>.md` 临时文件，`claude @file` 读它。新工作是：（1）Rust 新模块 `src-tauri/src/skills/` 按约定目录加载 `.wodouyao/skills/*.md` + `~/.wodouyao/skills/*.md`；（2）spawn 时把匹配的 skill body 追加到 `append_system_prompt`；（3）CLI `wodouyao skill` 子命令；（4）前端 `skillStore.ts`（可选）。不需要动现有 role/store/workspace 体系。

---

## 1. role → system prompt 注入的精确路径

### 1a. 核心函数（最关键）

| 文件 | 行号 | 作用 |
|---|---|---|
| `src-tauri/src/hub/server.rs` | **L750–853** | `fn builtin_role_prompt(role: &str) -> Option<&'static str>` — 内置角色名 → 静态 system prompt 字符串映射（pm/architect/backend/frontend/qa/devops/designer/planner/generator/evaluator/researcher/shell） |
| `src-tauri/src/hub/server.rs` | **L855–905** | `fn build_spawn_prompt(name, role, append) -> String` — 拼最终 .md 文件内容，把 quick-ref + role section + append_section 合并 |
| `src-tauri/src/hub/server.rs` | **L652–664** | spawn handler 内：若 `append_system_prompt` 为 None 则用 `builtin_role_prompt` 回填；赋给 `effective_append` |
| `src-tauri/src/hub/server.rs` | **L670–684** | spawn handler 内：`kind==claude` 时调 `build_spawn_prompt`，写入 `/tmp/wodouyao/prompt_<id>.md`，command 变成 `claude --dangerously-skip-permissions "@<file>"` |
| `src-tauri/src/hub/server.rs` | **L1107** | 第二处调用 `build_spawn_prompt`（`workflow_bootstrap` 路径，逻辑相同） |

### 1b. 数据流（spawn CLI → system prompt 到 claude）

```
wodouyao spawn --role backend
    → POST /v1/spawn  {role:"backend", kind:"claude"}
    → hub/server.rs: builtin_role_prompt("backend") → &str
    → effective_append = Some(role_prompt)
    → build_spawn_prompt(name, role, append)
    → write /tmp/wodouyao/prompt_<id>.md
    → command = `claude --dangerously-skip-permissions "@/tmp/wodouyao/prompt_<id>.md"`
    → Tauri emit "wodouyao://spawn" → frontend create_terminal(command=...)
```

### 1c. SpawnBody struct（在 `server.rs` L488–513）

```rust
struct SpawnBody {
    name: Option<String>,
    kind: Option<String>,        // "claude" | "codex"
    command: Option<String>,
    cwd: Option<String>,
    auto_wire_from: Option<String>,
    team: Option<String>,
    team_role: Option<String>,
    role: Option<String>,
    append_system_prompt: Option<String>,  // ← Skills 内容追加到这里
    workspace_id: Option<String>,
}
```

**Skills 注入点**：在 hub/server.rs 构建 `effective_append` 之前（约 L652），把匹配的 skill body 拼到 `append_system_prompt` 或 `role_prompt` 上即可。

---

## 2. settingsStore / workspaceStore 持久化模板

### 2a. 前端 settingsStore（`src/store/settingsStore.ts`）

极简模式：Zustand + Tauri IPC。

```typescript
// 模式：load on mount, patch via IPC, optimistic local update
const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  loadSettings: async () => {
    const settings = await getSettings();   // tauriCommands.ts IPC
    set({ settings });
  },
  updateSettings: async (patch) => {
    const updated = { ...get().settings, ...patch };
    set({ settings: updated });             // optimistic
    await updateSettingsApi(updated);       // IPC call
  },
}));
```

新的 `skillStore.ts` 照此模式 1:1 复制，替换 IPC 命令名即可。

### 2b. 后端持久化（`src-tauri/src/settings/storage.rs`）

```rust
// 路径：dirs::data_dir() / "wodouyao" / "settings.json"
fn settings_path() -> Result<PathBuf, String> {   // L278
    let base = dirs::data_dir().ok_or("Cannot find data directory")?;
    Ok(base.join("wodouyao").join("settings.json"))  // 实际路径
}
pub fn load() -> Result<AppSettings, String> { ... }  // L285
pub fn save(settings: &AppSettings) -> Result<(), String> { ... } // L296
```

**Skills 的 Rust 模块建议路径**：`src-tauri/src/skills/storage.rs`。加载规则：
1. `~/.wodouyao/skills/*.md`（用户级）
2. `.wodouyao/skills/*.md`（项目级，在 `cwd` 下，覆盖用户级同名）

Frontmatter 约定（参考 omc-comparison.md 落地草图）：

```md
---
triggers: ["rate limit", "限流"]
roles: ["pm", "backend"]
---

skill body...
```

### 2c. workspace 持久化（`src-tauri/src/workspace/storage.rs`）

- 路径：`dirs::data_dir() / "wodouyao" / "workspaces" / <ws-id>.json`（L117–131）
- project-level 路径：`project_paths(cwd)` 返回 `ProjectPaths`，含 `workspace_json`（L149）
- Skills **不需要**写进 workspace.json，它们是文件系统级的（`.wodouyao/skills/`）

---

## 3. CLI 子命令注册位置

CLI 是一个 **POSIX shell script**：`src-tauri/resources/bin/wodouyao`

主分发表在文件**末尾**：

```sh
case $sub in
    peers)     cmd_peers "$@" ;;
    ...
    workflow)  cmd_workflow "$@" ;;
    -h|--help|help) usage 0 ;;
    *)         die "unknown subcommand: $sub" ;;
esac
```

**加 `skill` 子命令只需**：
1. 在 `usage()` 函数（文件顶部 L12 附近）加说明行
2. 新增 `cmd_skill()` 函数和 `cmd_skill_list/add/remove/show/capture` 子函数
3. 在末尾 case 表加一行：`skill) cmd_skill "$@" ;;`

已有子命令可参考 `cmd_note()`（`note list/add/update/remove`）— 结构完全一致，Skills CLI 照搬即可。

---

## 4. .wodouyao/ 目录命名约定

```
.wodouyao/
├── CLAUDE.md            # 项目级 Claude Code 快捷参考（hub spawn 时自动写入）
├── workspace.json       # 已废弃路径（已迁移到 OS data dir），保留兼容
├── research/            # 人工研究笔记（本文件所在目录）
│   ├── omc-comparison.md
│   └── skills-context-brief.md
└── tasks/               # wodouyao task 数据（hub 写入）
    └── <task-id>        # 各任务 JSON
```

**Skills 目录约定**（尚未创建，需新建）：

```
.wodouyao/skills/        # 项目级 skills（优先级高）
~/.wodouyao/skills/      # 用户级 skills（全局默认）
```

每个 skill 是一个 `.md` 文件，frontmatter 含 `triggers` 和 `roles`。

---

## 5. 关键文件索引（给 worker 直接跳转用）

| 任务 | 文件 | 关键行 |
|---|---|---|
| role prompt 内容 | `src-tauri/src/hub/server.rs` | L750–853 `builtin_role_prompt` |
| spawn prompt 拼接 | `src-tauri/src/hub/server.rs` | L855–905 `build_spawn_prompt` |
| skill 注入挂载点 | `src-tauri/src/hub/server.rs` | L652–664（effective_append 组装前） |
| Rust 设置持久化模板 | `src-tauri/src/settings/storage.rs` | L278–299 |
| 前端 store 模板 | `src/store/settingsStore.ts` | 全文（约 40 行） |
| role 元数据（前端） | `src/utils/terminalRoles.ts` | BUILTIN_ROLES，resolveRoles() |
| CLI 子命令分发 | `src-tauri/resources/bin/wodouyao` | 末尾 case 表 |
| CLI note 子命令参考 | `src-tauri/resources/bin/wodouyao` | `cmd_note*` 函数 |
| integration install 模板 | `src-tauri/src/integrations/claude.rs` | `install()` + `copy_dir_if_newer` |
| .wodouyao 写入时机 | `src-tauri/src/hub/server.rs` | `write_project_claude_md()` |

---

## 6. 新模块建议目录结构

```
src-tauri/src/skills/
├── mod.rs      # pub use storage / commands
├── storage.rs  # load_skills(cwd) -> Vec<Skill>; Skill { name, body, triggers, roles }
└── commands.rs # Tauri IPC: list_skills, get_skill, (add/remove 写到 .wodouyao/skills/)

src/store/skillStore.ts          # 前端 Zustand store（参考 settingsStore.ts）
src/types/skill.ts               # Skill 类型定义
```

不需要新的 hub HTTP 路由——Skills 仅在 spawn 时静态注入，hub 不需要实时 skill API。

---

*Generated by context-loader on 2026-05-09. 后续 worker 无需重新搜代码，直接按本 brief 的文件:行号开干。*
