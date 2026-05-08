# Wodouyao

> A cross-platform **infinite canvas terminal multiplexer** built with Tauri 2 + React 19 + TypeScript. Place PTY-backed terminals on a zoomable canvas, connect them with wires, and observe — or orchestrate — multi-agent workflows.

Wodouyao (我都要) is **not a harness** — it is an observation and orchestration panel for existing agent harnesses (Claude Code, Codex, etc.).

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) v2
- Platform toolchain: Visual Studio Build Tools (Windows), Xcode (macOS)

### Development

```bash
npm install
npm run tauri dev          # hot-reload frontend + Rust backend
```

### Production build

```bash
npm run tauri build
```

### Other commands

| Command | Description |
|---|---|
| `npm run dev` | Frontend only (no Tauri shell) |
| `npm run build` | Frontend build only |
| `npm run preview` | Preview production build |
| `npx tsc --noEmit` | TypeScript check (no emit) |

## Features

### Canvas & Terminals

- Infinite zoomable canvas with real PTY terminals
- Resizable from any edge or corner, rAF-throttled for smoothness
- WebGL renderer (Canvas fallback) + JetBrainsMono → SF Mono → Menlo font stack
- 5 xterm themes (Tokyo Night, Dracula, Nord, Monokai, Solarized) + 8 accent colors

### Wires & IO

- Typed wires: `io` (terminal↔terminal), `note`, `file`, `board` (task boards), `team`
- `io` wires mirror every keystroke (Enter, Ctrl-*, arrows) to the peer PTY
- Drop a wire on empty canvas to auto-spawn an agent terminal (configurable)

### Hub (Silicon Protocol)

- Embedded HTTP server on loopback port 19790, Bearer-authenticated
- Endpoints: `/v1/peers`, `/v1/whoami`, `/v1/send`, `/v1/read`, `/v1/watch`, `/v1/spawn`, `/v1/teams/*`, `/v1/tasks/*`
- Ships a POSIX `wodouyao` CLI and Claude Code / Codex skills

### Orchestration

- 12 role tags (pm, architect, backend, frontend, qa, devops, designer, planner, generator, evaluator, researcher, shell) with color glyphs
- Activity dots (working / idle / starting / exited / error) with pulse animation
- Task panel with drag-to-assign; task boards can be wired
- Teams with star topology (lead = wire source)

### Workspaces & Settings

- Save / load / switch full canvas layouts
- Fork a workspace as a parallel experiment branch
- Backgrounds: image / video / URL / particle presets
- Language switch (zh / en), shell picker, font size, custom roles

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop runtime | Tauri 2 |
| Backend | Rust, portable-pty, tiny_http, tokio |
| Frontend | React 19, TypeScript, Vite 6 |
| Terminal emulator | xterm.js 5.5 + WebGL renderer (Canvas fallback) |
| Canvas rendering | Konva (background), SVG (wires), DOM (nodes) |
| State management | Zustand 5 |
| i18n | react-i18next (en / zh) |

### Rendering Layers

```
5. CanvasControls          (zoom buttons, top-right overlay)
4. TerminalLayer           (DOM — PTY terminal nodes, CSS transform pan/zoom)
3. ResourceLayer           (DOM — sticky notes, file nodes, task boards)
2. WireLayer               (SVG — bezier curves between nodes)
1. BackgroundLayer         (Konva — grid dots, images, particles)
```

### State Management (Zustand)

| Store | Purpose |
|---|---|
| `terminalStore` | Terminal nodes Map, CRUD, z-index, status, role, activity |
| `canvasStore` | panX, panY, zoom, grid settings |
| `canvasInteractionStore` | Mode (select/draw/wire), draw rect, wire drag |
| `wireStore` | Wire connections Map (typed: io/note/file/team) |
| `workspaceStore` | Workspace CRUD, current workspace, CWD |
| `settingsStore` | App settings, quick commands, wire-to-empty spawn |
| `taskStore` | Task CRUD, drawer state, workspace-scoped |
| `teamStore` | Team management, drawer state |
| `noteStore` | Sticky notes on canvas |
| `fileNodeStore` | File/folder nodes on canvas |
| `taskBoardStore` | Task board nodes |
| `toastStore` | Toast notifications |
| `dialogStore` | Modal dialog open/close |
| `commandStore` | Command palette state |

### Backend (Rust)

```
src-tauri/src/
  pty/            # portable-pty sessions, shell detection, resize
  commands/       # Tauri IPC commands (terminal, workspace, settings, wire, team, tasks, file_preview)
  hub/            # HTTP server (topology, identity, teams, endpoints) on port 19790
  workspace/      # JSON file persistence in app data dir
  settings/       # App settings JSON persistence
  tasks/          # Task store with CRUD
  notes/          # Sticky note persistence
  file_nodes/     # File node persistence
  task_boards/    # Task board persistence
  state/          # Application state management
  integrations/   # Agent CLI detection (claude, codex) + skill installer
```

### Project Structure

```
src/
  components/
    canvas/            # InfiniteCanvas, WireLayer, BackgroundLayer, ResourceLayer
    terminal/          # TerminalNode, TerminalBody, TerminalTitleBar, status badge, context menu
    ui/                # Toolbar, Settings/Tasks/Teams drawers, workspace switcher, dialogs
    command-palette/   # Ctrl+K command palette
  hooks/               # useCanvas, useTerminal, useTerminalIO, useNodeDrag, useHubSpawn, ...
  store/               # Zustand stores (one file per domain)
  services/            # Tauri IPC wrappers, terminal registry
  types/               # TypeScript types (one file per domain)
  utils/               # Themes, roles, constants, geometry, ID generation
  i18n/                # en.json / zh.json
  styles/              # Global CSS

src-tauri/
  src/                 # Rust backend (see above)
  resources/bin/       # Shipped POSIX CLI (wodouyao)
  resources/skills/    # Claude Code / Codex skills
```

## Extending Wodouyao

### Adding a new terminal role

Edit `src/utils/terminalRoles.ts` — add an entry to `BUILTIN_ROLES` and a position in `ROLE_ORDER`:

```ts
// In BUILTIN_ROLES:
myrole: { label: "myrole", color: "var(--color-accent)", glyph: "★", hint: "does something" },

// In ROLE_ORDER (insert at desired position):
"myrole",
```

Users can also add custom roles via `settings.custom_roles` without code changes — see `resolveRoles()` in the same file.

### Adding a new skill

Skills live in `src-tauri/resources/skills/`. Each skill is a directory with a `SKILL.md` (description and trigger phrases) and any supporting scripts or resources. The Tauri installer copies skills to `~/.claude/plugins/wodouyao/` on first run. See existing skills for the expected format.

### Adding a background effect

Background presets (matrix, starfield, wave, dust) are configured in `src/components/canvas/BackgroundLayer.tsx`. Add a preset function that draws to the Konva canvas, then register it in the preset selector in the settings drawer.

## Contributing

1. **Fork** the repository and create a feature branch
2. **Make your changes**. Run `npx tsc --noEmit` to verify type correctness
3. **Test locally** with `npm run tauri dev`
4. **Open a pull request** with a clear title and description

Please keep commits focused and write descriptive commit messages following [Conventional Commits](https://www.conventionalcommits.org/).

## License

MIT
