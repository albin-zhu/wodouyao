# Skills 系统架构设计

> 输出：architect task t_e291164a045f446db3717a0998b7a357  
> 目标读者：backend（Rust）、frontend（React/Zustand）、CLI 实现者  
> 日期：2026-05-09

---

## 1. SkillFile 数据结构

### 1.1 Frontmatter 字段（YAML）

```yaml
---
name: string          # 必填；全局唯一键（覆盖规则见 §2）；建议 kebab-case
description: string   # 可选；一行简介，出现在 `wodouyao skill list` 输出
version: string       # 可选；semver，默认 "1.0.0"
triggers: [string]    # 可选；关键词列表；spawn 时模糊匹配 task subject / command
roles: [string]       # 可选；匹配 terminal role；空 = 对所有 role 生效
author: string        # 可选；人工标注
tags: [string]        # 可选；自由标签，供 list --tag 过滤
---
```

**字段约束**

| 字段 | 类型 | 必填 | 最大长度 |
|---|---|---|---|
| name | string | ✅ | 64 chars |
| description | string | ❌ | 200 chars |
| version | semver string | ❌ | — |
| triggers | []string | ❌ | 每条 100 chars，最多 20 条 |
| roles | []string | ❌ | 枚举 builtin roles + 自定义 role |
| author | string | ❌ | 100 chars |
| tags | []string | ❌ | 每条 32 chars，最多 10 条 |

### 1.2 Body

Frontmatter 结束后的全部 Markdown 文本，无格式约束。注入时原样追加。  
建议在 body 头部写 `## <name>` 标题，帮助 claude 理解上下文边界。

### 1.3 Rust 结构体

```rust
// src-tauri/src/skills/storage.rs

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub triggers: Vec<String>,
    pub roles: Vec<String>,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub body: String,
    pub source: SkillSource,   // 来源，用于 UI 展示和覆盖诊断
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum SkillSource {
    User,    // ~/.wodouyao/skills/
    Project, // .wodouyao/skills/ (cwd 下)
}
```

### 1.4 TypeScript 类型（前端）

```typescript
// src/types/skill.ts

export type SkillSource = 'user' | 'project';

export interface Skill {
  name: string;
  description?: string;
  version?: string;
  triggers: string[];
  roles: string[];
  author?: string;
  tags: string[];
  body: string;
  source: SkillSource;
}
```

---

## 2. 加载顺序与覆盖规则

### 2.1 目录

```
~/.wodouyao/skills/*.md        # 用户级（低优先级）
<cwd>/.wodouyao/skills/*.md   # 项目级（高优先级，覆盖同名）
```

### 2.2 加载算法（伪代码）

```rust
fn load_skills(cwd: &Path) -> Vec<Skill> {
    let mut map: IndexMap<String, Skill> = IndexMap::new();

    // 1. 加载用户级（优先级低）
    let user_dir = dirs::home_dir().unwrap().join(".wodouyao/skills");
    for file in glob(user_dir + "/*.md") {
        let skill = parse_skill_file(file, SkillSource::User);
        map.insert(skill.name.clone(), skill);
    }

    // 2. 加载项目级（同名覆盖用户级）
    let project_dir = cwd.join(".wodouyao/skills");
    for file in glob(project_dir + "/*.md") {
        let skill = parse_skill_file(file, SkillSource::Project);
        map.insert(skill.name.clone(), skill); // 覆盖
    }

    map.into_values().collect()
}
```

### 2.3 冲突解决规则

| 场景 | 结果 |
|---|---|
| 同 name，user vs project | project 覆盖 user；`source` 字段记为 `Project` |
| 同 name，同作用域多文件 | 按文件系统字典序，后加载者覆盖（不推荐，应保持 name 唯一） |
| frontmatter 缺 `name` | 降级：用文件名（去 `.md` 后缀）作为 name |
| frontmatter 解析失败 | 跳过该文件；在日志输出 `[skills] parse error: <path>` |

---

## 3. CLI 命令签名

### 3.1 顶层：`wodouyao skill <subcommand>`

```
usage: wodouyao skill <subcommand> [flags]

subcommands:
  list              列出所有已加载的 skills
  add <file>        将 .md 文件安装为 skill（复制到 .wodouyao/skills/）
  remove <name>     删除 project 级 skill（用户级加 --user）
  show <name>       打印 skill 完整内容（frontmatter + body）
  capture <peer>    从 peer 终端的最近输出生成草稿 skill
```

### 3.2 `skill list`

```
wodouyao skill list [--role <role>] [--tag <tag>] [--source user|project] [--json]
```

**stdout（table 格式，默认）**

```
NAME                SOURCE    ROLES           TRIGGERS
rate-limit-handler  project   backend,devops  rate limit,限流,429
pm-deep-interview   user      pm              模糊需求,不确定
```

**stdout（--json 格式）**

```json
[
  {
    "name": "rate-limit-handler",
    "source": "project",
    "description": "检测限流错误并给出恢复建议",
    "roles": ["backend","devops"],
    "triggers": ["rate limit","限流","429"],
    "tags": []
  }
]
```

**退出码**：0=成功，1=内部错误

### 3.3 `skill add <file>`

```
wodouyao skill add <path-to.md> [--user] [--force]
```

- 默认安装到 `<cwd>/.wodouyao/skills/`；`--user` 安装到 `~/.wodouyao/skills/`
- 若目标已存在同名文件且无 `--force`，退出码 2，stderr 打印冲突提示
- 成功：stdout 打印 `Installed skill "<name>" → <dest>`

**退出码**：0=成功，1=parse 失败，2=冲突（需 --force）

### 3.4 `skill remove <name>`

```
wodouyao skill remove <name> [--user]
```

- 默认删除 project 级；`--user` 删用户级
- 若只存在于用户级但未加 `--user`，stderr 提示并退出码 2
- 成功：stdout 打印 `Removed skill "<name>"`

**退出码**：0=成功，1=未找到，2=作用域不匹配

### 3.5 `skill show <name>`

```
wodouyao skill show <name> [--body-only]
```

- 默认打印 frontmatter + body
- `--body-only` 只打印 body（方便管道）

**退出码**：0=成功，1=未找到

### 3.6 `skill capture <peer>`

```
wodouyao skill capture <peer> --subject "<one-line description>" [--lines <n>] [--out <file>]
```

- `<peer>` 是 peer terminal id（同 `wodouyao read <peer>`）
- `--lines` 默认 200；`--out` 默认 `.wodouyao/skills/<slugified-subject>.md`（draft，不自动激活）
- 生成文件带 `# DRAFT` 注释，提醒人工审核触发词/角色

**生成的草稿格式**

```markdown
---
# DRAFT — review triggers/roles before activating
name: slugified-subject
description: "<subject>"
triggers: []
roles: []
---

<!-- captured from peer <peer-id> at <timestamp> -->
<!-- edit triggers and roles, then run: wodouyao skill add <this-file> -->

<peer output excerpt>
```

**退出码**：0=成功，1=peer 不存在，2=无输出可捕获

---

## 4. Tauri IPC 命令清单

所有命令在 `src-tauri/src/commands/skills.rs` 注册，通过 `tauri::Builder::invoke_handler` 暴露。

### 4.1 `skill_list`

**请求**（前端调用无参数，或带可选过滤）

```typescript
invoke<Skill[]>('skill_list', { role?: string, tag?: string, source?: 'user'|'project' })
```

**响应**

```json
[
  {
    "name": "rate-limit-handler",
    "description": "...",
    "version": "1.0.0",
    "triggers": ["rate limit", "限流"],
    "roles": ["backend"],
    "author": null,
    "tags": [],
    "body": "## rate-limit-handler\n...",
    "source": "project"
  }
]
```

**错误**：Tauri Result<Vec<Skill>, String>；前端 try/catch

### 4.2 `skill_get`

**请求**

```typescript
invoke<Skill>('skill_get', { name: string })
```

**响应**：单个 `Skill` 对象（同上结构）

**错误**：`"skill not found: <name>"`

### 4.3 `skill_save`

**用途**：写入 `.md` 文件（add / update）

**请求**

```typescript
invoke<void>('skill_save', {
  skill: Skill,
  scope: 'user' | 'project',
  cwd: string,    // project scope 需要
  force: boolean  // 是否覆盖同名
})
```

**响应**：void（成功）

**错误**：
- `"skill already exists: <name>"` — 未设 force 时同名冲突
- `"parse error: <detail>"` — frontmatter 格式错误

### 4.4 `skill_delete`

**请求**

```typescript
invoke<void>('skill_delete', {
  name: string,
  scope: 'user' | 'project',
  cwd: string
})
```

**响应**：void（成功）

**错误**：
- `"skill not found in <scope> scope: <name>"`

---

## 5. Spawn 时注入点伪代码

注入发生在 `src-tauri/src/hub/server.rs` 中，位于现有 `effective_append` 组装前（约 L652）。

```rust
// === 新增：skills 注入 ===
// 位置：在 L652 builtin_role_prompt 回填之前

async fn resolve_skill_injection(
    role: Option<&str>,
    cwd: Option<&str>,
) -> String {
    let cwd_path = cwd.map(Path::new).unwrap_or(Path::new("."));
    let skills = load_skills(cwd_path);  // §2.2 加载算法

    skills
        .iter()
        .filter(|s| {
            // 按 role 过滤：skill.roles 为空 = 对所有 role 生效
            s.roles.is_empty()
                || role.map(|r| s.roles.iter().any(|sr| sr == r)).unwrap_or(true)
        })
        .map(|s| s.body.as_str())
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}

// 在 spawn handler 组装 effective_append 之前：
let skill_injection = resolve_skill_injection(
    body.role.as_deref(),
    body.cwd.as_deref(),
).await;

// 拼接顺序：skill injection → 用户传入的 append_system_prompt → builtin role prompt
let effective_append = Some(format!(
    "{}{}\n\n{}",
    if skill_injection.is_empty() { String::new() } else { format!("{}\n\n", skill_injection) },
    body.append_system_prompt.as_deref().unwrap_or(""),
    builtin_role_prompt(body.role.as_deref().unwrap_or("")).unwrap_or("")
).trim().to_string());
```

### 5.1 按 role 过滤规则

| skill.roles | spawn role | 是否注入 |
|---|---|---|
| `[]`（空） | 任意 | ✅ 注入 |
| `["backend"]` | `backend` | ✅ 注入 |
| `["backend"]` | `pm` | ❌ 跳过 |
| `["backend","pm"]` | `pm` | ✅ 注入 |
| `["backend"]` | `null`（无 role） | ❌ 跳过（不注入有角色限定的 skill） |

### 5.2 拼接顺序（最终 system prompt 结构）

```
[wodouyao quick-ref section]          ← build_spawn_prompt 现有逻辑
[matched skill bodies, joined by ---] ← 新增注入
[user append_system_prompt]           ← SpawnBody.append_system_prompt
[builtin role prompt]                 ← builtin_role_prompt(role)
```

---

## 6. 最小 Skill 示例（含 frontmatter）

```markdown
---
name: rate-limit-handler
description: 遭遇 API 限流时的诊断与恢复建议
version: 1.0.0
triggers:
  - "rate limit"
  - "限流"
  - "429"
  - "quota exceeded"
roles:
  - backend
  - devops
author: mt
tags:
  - resilience
  - api
---

## Rate Limit Handler

当你遇到 HTTP 429 或 "rate limited" 错误时：

1. **识别来源**：区分 Anthropic API 限流 vs 业务 API 限流。
2. **指数退避**：首次等待 1s，后续 2×，最大 60s，最多重试 5 次。
3. **上报状态**：在终端输出 `[RATE_LIMITED] waiting Xs, attempt N/5` 让观测者可感知。
4. **不要静默重试**：每次重试都输出一行，让 wodouyao 画布可观测。

**恢复信号**：输出 `[RATE_LIMIT_RECOVERED]` 一行，让 quota watch 守护知道已恢复。
```

---

## 7. 前端 skillStore 设计（参考 settingsStore 模式）

```typescript
// src/store/skillStore.ts

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Skill } from '../types/skill';

interface SkillStore {
  skills: Skill[];
  loading: boolean;
  loadSkills: () => Promise<void>;
  saveSkill: (skill: Skill, scope: 'user' | 'project', cwd: string, force?: boolean) => Promise<void>;
  deleteSkill: (name: string, scope: 'user' | 'project', cwd: string) => Promise<void>;
  getSkill: (name: string) => Skill | undefined;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  loading: false,

  loadSkills: async () => {
    set({ loading: true });
    try {
      const skills = await invoke<Skill[]>('skill_list');
      set({ skills, loading: false });
    } catch (e) {
      set({ loading: false });
      console.error('[skillStore] load failed:', e);
    }
  },

  saveSkill: async (skill, scope, cwd, force = false) => {
    await invoke('skill_save', { skill, scope, cwd, force });
    await get().loadSkills(); // reload
  },

  deleteSkill: async (name, scope, cwd) => {
    await invoke('skill_delete', { name, scope, cwd });
    set({ skills: get().skills.filter(s => s.name !== name) });
  },

  getSkill: (name) => get().skills.find(s => s.name === name),
}));
```

**注意**：`loadSkills()` 在 App 挂载时调用一次即可；spawn 时的注入发生在 Rust 侧，前端 store 仅用于 UI 展示（SkillDrawer / command palette）。

---

## 验收检查清单

| 验收项 | 负责方 |
|---|---|
| `wodouyao skill list/add/remove/show/capture` 五个子命令可调用 | CLI |
| `skill_list / skill_get / skill_save / skill_delete` IPC 有响应 | Backend |
| `load_skills(cwd)` 正确执行用户级→项目级覆盖 | Backend |
| spawn backend terminal，匹配 backend skill，body 出现在 claude system prompt | Backend + 集成测试 |
| spawn pm terminal，不注入 roles:["backend"] skill | Backend |
| `skill capture <peer>` 生成合法 frontmatter draft 文件 | CLI |
| 前端 `useSkillStore` 加载后 `skills` 非空（项目有 skill 时） | Frontend |
| `skill_save` 未设 force 时同名返回错误字符串，前端 toast 展示 | Frontend + Backend |

