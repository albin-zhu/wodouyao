# OMC (oh-my-claudecode) vs Wodouyao — 借鉴评估

来源：https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/README.zh.md
评估日期：2026-05-08

## 一句话定位差异

**OMC 是单 Agent（Claude Code）内的"插件包"**：通过 slash command + skill 文件 + 魔法关键字，把多 Agent 编排塞进一个 CLI 会话里，目标是"零学习成本、最大化 Claude Code 单进程能力"。

**Wodouyao 是多 Agent 之上的"观测/编排面板"**：用画布 + wire + PTY 把任意 harness（Claude / Codex / shell）做成一等公民节点，让人类肉眼看到拓扑、用 wire 做 ACL、用 task board 做协作锚点。它**不是 harness**、不替 Claude Code 做路由，定位在 OMC 之"上"一层。

> 推论：OMC 的"会话内"创新基本不冲突，多数能作为 wodouyao 内部某个 role/team 的"插件"被引入；OMC 的"会话即编排"假设（tmux + 单进程主导）则与 wodouyao 的"画布即编排"哲学正面冲突。

---

## 特性映射表

| OMC 特性 | wodouyao 现状 | 是否值得借鉴 | 借鉴方式建议 |
|---|---|---|---|
| 32 个专业 agent | 部分（12 个内置 role：pm/architect/backend/frontend/qa/devops/designer + 5 generic，支持 custom_roles） | ✅ 值得 | 在 `src/utils/terminalRoles.ts` 增加 research/security/data/docs 等空白 role；不必到 32 个，挑 wodouyao 用户实际能拖到画布上的即可 |
| 智能模型路由（Haiku 简单 / Opus 复杂） | ❌ 缺失（spawn 时只指定 command，模型由 harness 内部决定） | ⚠️ 部分 | wodouyao 不该接管模型选择（违反"非 harness"原则），但可以在 spawn `--role` 时附带模型偏好元数据，让 harness 自取；或在 `default_command_template` 里按 role 注入 `--model haiku` flag |
| Team 模式：plan→PRD→exec→verify→fix 循环 | 部分（有 team / team task / role，但流水线相位是隐性的，靠人/PM agent 推动） | ✅ 值得 | 新增 `wodouyao team phase <team> <plan\|prd\|exec\|verify\|fix>` 命令 + `team_phase` 字段写到 teamStore；TeamDrawer 顶部显示当前相位；任务可绑定 `phase` 标签做过滤 |
| omc-teams：tmux 多 CLI worker | 已覆盖（spawn + wire + PTY，本身就是这个） | ✅ 已实现 | 无需借鉴，wodouyao 是该思路的可视化超集 |
| Slash 命令 + 魔法关键字（autopilot:, ralph:, ulw, plan…） | 部分（有 command palette，但触发面在 wodouyao UI；harness 内的关键字 wodouyao 不感知） | ⚠️ 部分 | command palette 加一组"对当前选中终端发送魔法关键字"的快捷动作；不要试图劫持/解析 harness 内的关键字 |
| Skills 系统（.omc/skills/*.md，触发词自动注入） | ❌ 缺失 | ✅ **强烈推荐** | 新增 `.wodouyao/skills/` + `wodouyao skill list/add/remove`，spawn 时按 role + 触发词把匹配的 skill 内容拼进 system prompt（沿用现有 `bakes a role-aware system prompt` 路径） |
| `/skillify` 抽取调试经验为 skill | ❌ 缺失 | ✅ 值得 | 配合上一条，提供 `wodouyao skill capture <peer>` —— 把指定终端最近 N 屏输出 + 用户标注存成 skill md |
| Deep Interview（苏格拉底澄清需求） | ❌ 缺失 | ✅ 值得 | 作为一个 PM role 的 skill 落地（不需要新机制），命名 `pm-deep-interview.md`，触发词"模糊需求/不确定" |
| HUD 状态栏（agent / token / 状态） | 部分（每个 TerminalNode 显示 status/role/activity；没有 token 计数） | ⚠️ 部分 | 不抄全局 HUD（画布本身就是 HUD）；可在 TerminalNode 角标加上"最近 1min token 估算"，从 PTY 字节流粗略估即可 |
| 限流恢复（omc wait --start） | ❌ 缺失 | ✅ 值得 | wodouyao 已经能看到所有终端，适合做这事：新增 `wodouyao watch-quota <peer>`，检测到限流文本 → 暂停 → 倒计时 → 自动 send 续上 |
| Pipeline / Ralph / Ultrawork / Autopilot 等多种执行模式 | 部分（有 workflow init / role / team） | ❌ 不抄 | 这些"模式"是会话内 prompt 工程；放到 wodouyao 会变成一组互相打架的隐式规则，冲淡画布"所见即拓扑"的卖点 |
| OpenClaw Gateway（webhook → Discord/Slack） | ❌ 缺失 | ⚠️ 部分 | 有用但优先级低；可作为 hub 已开放端点（19790）的扩展，留作 v2 |
| 通知回调（config-stop-callback） | ❌ 缺失 | ✅ 值得（小） | settingsStore 加一个 `stop_callback_url`，hub 在终端 exit 时 POST；和 OMC 几乎一样的 30 行 |
| Codex/Gemini 多模协同（ccg） | 已覆盖（spawn 任意 CLI 即可） | ✅ 已实现 | 可加 preset：`workflow init triple --kinds claude,codex,gemini` |
| 项目/用户级 skill 双作用域 | ❌ 缺失 | ✅ 值得 | 同 skills 实现：`.wodouyao/skills/` 项目级 + `~/.wodouyao/skills/` 用户级，前者覆盖后者 |

---

## 排名前 3「明显能抄」+ 落地草图

### 1. Skills 系统（项目级 + 用户级 markdown，按触发词注入）
**为什么是第一名**：wodouyao 已经有 `--role` → 注入 system prompt 的路径，skill 是同一抽象的延伸（"context fragments"）。OMC 把它做成最受欢迎的特性，wodouyao 几乎零阻力就能落地。

落地草图：
- 后端：`src-tauri/src/skills/` 新模块（mod.rs + store.rs + commands.rs），加载顺序 `~/.wodouyao/skills/*.md` → `.wodouyao/skills/*.md`（后者覆盖）。每个 md 用 frontmatter 写 `triggers: [...]` + `roles: [...]`。
- 前端 store：`src/store/skillStore.ts`，跟 `taskStore` 同模子。
- CLI：`wodouyao skill list / add <path> / remove <name> / show <name> / capture <peer>`（capture 把 `wodouyao read <peer>` 的最近输出 + 用户给的 subject 存成草稿 skill）。
- 注入点：`src/services/spawn.ts`（或拼 default command 的地方）—— spawn 时按 role 过滤，把匹配的 skill body 拼进系统消息。
- 触发词运行时匹配：`useTerminalActivity` tick 里扫描最近输出，命中 trigger 则用 `wodouyao send` 把 skill 简短 hint 注入对应终端（可选，先做静态注入即可）。

### 2. Team 相位（plan→PRD→exec→verify→fix）显式化
**为什么**：wodouyao 已经有 team / role / task，但缺一个"我们现在在哪一步"的共同状态。给 PM role 一个明确的相位机器，多 Agent 协作的失败模式（exec 提前开始、verify 被跳过）会立刻可见。

落地草图：
- 类型：`src/types/team.ts` 加 `phase: 'plan' | 'prd' | 'exec' | 'verify' | 'fix' | 'done'`。
- store：`teamStore` 加 `setPhase(teamId, phase)` + 持久化。
- 后端：`src-tauri/src/commands/team.rs` 加 `team_set_phase`。
- CLI：`wodouyao team phase <team> [<phase>]`（无参数=查询）。
- UI：TeamDrawer 顶部 5 段相位指示条；切换时给 team bcast 一条相位变更消息。
- 任务：`taskStore.Task` 加可选 `phase` 字段，TaskDrawer 加按相位过滤。

### 3. 限流恢复守护（watch-quota / auto-resume）
**为什么**：wodouyao 是唯一能"在 harness 之外看到 harness"的工具，做这个比 OMC 在 harness 内做更干净。也给画布"观测面板"定位增加一个独占价值点。

落地草图：
- 后端：`src-tauri/src/quota_watch/` 新模块；订阅 PTY 输出，按可配的正则（默认 `claude` / `codex` 各一组）识别"rate limited until X"。
- store：`terminalStore.TerminalNode` 加 `quotaWaitUntil?: number` 状态字段，TerminalNode 角标显示倒计时。
- CLI：`wodouyao quota watch <peer> [--pattern P] [--resume "<text>"]` 和 `wodouyao quota status`。
- 自动续：到点后用现有 `send_input` 发预设的 resume 文本（默认空 Enter）；用户可在 settingsStore 设默认。
- 不要：不要尝试调用 Anthropic API 查配额——wodouyao 不持有用户密钥，纯从 PTY 文本判断更符合"非 harness"原则。

---

## 排名前 3「不该抄」+ 原因

### 1. 多套执行模式（Autopilot / Ralph / Ultrawork / Pipeline / Swarm…）
**冲突点**：这些是 OMC 在单 CLI 会话里争夺主导权的不同 prompt 模板。wodouyao 的"主导权"是用户的鼠标和 wire 拓扑，不是某个 mode flag。把 5 种模式塞进 wodouyao 会让用户先挑模式再画布，违背"先画布、再让任意 Agent 接进来"的次序。
**替代**：保留 `workflow init` 的 preset 思路（一键铺一组 role + 任务），让"模式"退化为"拓扑模板"，而不是行为开关。

### 2. 智能模型路由（Haiku/Opus 自动切换）
**冲突点**：wodouyao 文档明确说"it is not a harness"。模型选择是 harness 的内部决策，wodouyao 一旦插手就要维护 token 计数、成本估算、provider 适配——成本巨大且本职模糊。
**替代**：让 role 元数据携带"建议模型"提示，写进 system prompt 里让 harness 自己读；wodouyao 不做强制路由。

### 3. 魔法关键字解析（autopilot:、ralph:、ulw 等会话内 DSL）
**冲突点**：解析这些关键字意味着 wodouyao 要实时监听并改写用户在终端里的输入，这把 PTY 从"透明管道"变成"中间人"，会破坏现有 send/read 的简单语义，也会和 harness 自身的 slash command 冲突。
**替代**：command palette 提供"把这条魔法关键字发给选中终端"的快捷条目即可——把 wodouyao 摆在用户和 harness 之间，但**不解析、只透传**。

---

## 一行结论

**抄 skills 系统、team 相位、限流守护；放过模式开关、模型路由、关键字劫持。** 这条线让 wodouyao 在保持"画布观测面板"定位的前提下，把 OMC 在会话内做的最有价值的三件事抬到画布层、变成所有 harness 共享的能力。
