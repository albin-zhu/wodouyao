# Skills 端到端验收报告

**日期**: 2026-05-09  
**任务**: t_21eda32ae8fe4b3aa2933206f8fa2ced  
**验收人**: QA terminal t_6b96b4237c3b4aae858347cf6afda046

---

## 验收结果总览

| 步骤 | 描述 | 结果 |
|------|------|------|
| 1 | 构建检查（tsc + cargo check） | ✅ PASS |
| 2 | skill 文件创建 + 格式验证 | ✅ PASS |
| 3 | workflow init 时 backend prompt 注入 skill body | ✅ PASS（代码路径静态验证） |
| 4 | CLI `skill list` / `skill show backend-tdd` | ✅ PASS |
| 5 | 项目级 vs 用户级覆盖 | ✅ PASS |
| — | 回归检查 | ✅ 无回归 |

---

## 步骤 1 — 构建检查

```
$ npx tsc --noEmit
exit=0  (0 errors，含 skillStore.ts / SkillsDrawer.tsx / skill.ts)

$ cargo check --manifest-path src-tauri/Cargo.toml
Finished `dev` profile [unoptimized + debuginfo] target(s) in 5.92s
```

**BE（`src-tauri/src/skills/`）和 FE（`src/store/skillStore.ts`, `src/components/ui/SkillsDrawer.tsx`）均编译干净。**

---

## 步骤 2 — skill 文件创建与格式

`backend-tdd` 已写入项目级目录：

```
/Users/mt/workspace/wodouyao/.wodouyao/skills/backend-tdd.md
```

```markdown
---
name: backend-tdd
description: "TDD rule for backend agents"
roles:
  - backend
---
任何修改都先写测试
```

FE 组件路径：
- `src/App.tsx:8` — 导入 `SkillsDrawer`，挂载于 L129
- `src/App.tsx:76` — 应用启动时调用 `loadSkills()`
- `src/components/ui/Toolbar.tsx:384` — Skills 按钮绑定 `openSkillsDrawer`
- `SkillsDrawer` 字段：name / description / roles / triggers / tags / body / scope(project|user) / overwrite

IPC 链：`skillSave(skill, scope, cwd, force)` → `invoke("skill_save", ...)` → Rust `skill_save` command → 写 `.md` 文件。

**格式符合设计，IPC 链完整。**

---

## 步骤 3 — workflow init skill 注入

`src-tauri/src/hub/server.rs:663–684`：

```rust
// Inject matching skill bodies into the system prompt.
let skill_injection = crate::skills::skill_injection_for_role(
    parsed.role.as_deref(),   // "backend"
    parsed.cwd.as_deref(),    // workspace cwd
);

// Compose effective_append: skill bodies → user append → builtin role prompt
let parts = [skill_injection, append_system_prompt, role_prompt];
let composed_append = parts.join("\n\n");
// → effective_append 传入 build_spawn_prompt → 写入 /tmp/wodouyao/prompt_<id>.md
```

逻辑追踪（`skill_injection_for_role("backend", cwd)`）：
1. 扫描 `~/.wodouyao/skills/` → 找到 `backend-tdd.md`（user 级）
2. 扫描 `<cwd>/.wodouyao/skills/` → 找到 `backend-tdd.md`（project 级，覆盖）
3. 过滤 `roles.contains("backend")` → 匹配
4. 返回 body：`"任何修改都先写测试"`

**`workflow init --role backend` 产生的终端系统 prompt 会包含 `任何修改都先写测试`。**  
（hub 在验收时未运行，代码路径静态验证通过；live 验证需 app 运行。）

---

## 步骤 4 — CLI 输出验证

使用 dev binary（`src-tauri/resources/bin/wodouyao`）：

```
$ wodouyao skill list
NAME                     SOURCE   ROLES                TRIGGERS
backend-tdd              project  backend

$ wodouyao skill list --role backend
NAME                     SOURCE   ROLES                TRIGGERS
backend-tdd              project  backend

$ wodouyao skill list --role frontend
NAME                     SOURCE   ROLES                TRIGGERS
(空，符合预期)

$ wodouyao skill show backend-tdd
---
name: backend-tdd
description: "TDD rule for backend agents"
roles:
  - backend
---
任何修改都先写测试

$ wodouyao skill show backend-tdd --body-only
任何修改都先写测试

$ wodouyao skill list --json
[
  {
    "name": "backend-tdd",
    "description": "TDD rule for backend agents",
    "roles": ["backend"],
    "triggers": [],
    "tags": [],
    "body": "任何修改都先写测试\n",
    "source": "project"
  }
]
```

**tabular + JSON 输出均符合设计规范。**

> **注**：已安装的 release bundle 中的 `wodouyao` 是旧版快照，返回
> `unknown subcommand: skill`。下次 `npm run tauri build` 后同步。
> 不影响 BE/FE 实现正确性。

---

## 步骤 5 — 项目级 vs 用户级覆盖

两处均放了同名 `backend-tdd.md`：

| 路径 | description | body |
|------|-------------|------|
| `~/.wodouyao/skills/backend-tdd.md` | TDD rule — USER LEVEL | `USER LEVEL: 用户级 TDD 规则（应被项目级覆盖）` |
| `<cwd>/.wodouyao/skills/backend-tdd.md` | TDD rule for backend agents | `任何修改都先写测试` |

```
$ wodouyao skill list
NAME          SOURCE   ROLES
backend-tdd   project  backend     ← project 胜出 ✓

$ wodouyao skill list --source project
NAME          SOURCE   ROLES
backend-tdd   project  backend     ✓

$ wodouyao skill list --source user
NAME          SOURCE   ROLES
(空)

$ wodouyao skill show backend-tdd | grep description
description: "TDD rule for backend agents"   ← project 版本 ✓
```

Rust `storage.rs` `IndexMap::insert` 先插入 user 再插入 project，实现正确覆盖。

**设计细节**：`skill list --source user` 在同名 skill 被 project 覆盖时返回空，因为
`load_skills` 合并后有效列表仅含 project 版本。此行为符合设计（只展示有效 skill），
用户可通过 `ls ~/.wodouyao/skills/` 查看原始 user-level 文件。

---

## 回归检查

| 检查项 | 结果 |
|--------|------|
| `tsc --noEmit` | ✅ 0 errors |
| `cargo check` | ✅ 0 errors / warnings |
| 既有 Tauri commands 未修改 | ✅ lib.rs 仅追加 4 条 skill handler |
| Store 隔离 | ✅ skillStore 不干涉其他 store |
| Toolbar 无副作用 | ✅ 仅新增 Skills 按钮 |
| App.tsx 挂载 | ✅ 仅新增 `<SkillsDrawer />` 和 `loadSkills()` 调用 |
