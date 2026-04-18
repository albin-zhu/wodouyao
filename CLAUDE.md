# CLAUDE.md

## Project Overview

Wodouyao is a cross-platform infinite canvas terminal multiplexer built with Tauri 2 + React 19 + TypeScript. Users place PTY-backed terminal windows on a zoomable canvas, connect them with wires, and observe multi-agent workflows. It is **not** a harness -- it is an observation and orchestration panel for existing agent harnesses (Claude Code, Codex, etc.).

## Commands

```bash
# Dev (frontend hot-reload + Rust backend)
npm run tauri dev

# Build production
npm run tauri build

# TypeScript check only (no emit)
npx tsc --noEmit

# Frontend only (no Tauri shell)
npm run dev
```

## Architecture

### Rendering Layers (bottom to top)
1. **BackgroundLayer** (Konva) -- grid dot background, `pointerEvents: none`
2. **WireLayer** (SVG) -- bezier wire curves between nodes, z-index 5
3. **ResourceLayer** (DOM) -- sticky notes + file nodes, pan/zoom via CSS transform
4. **TerminalLayer** (DOM) -- CSS `transform: translate/scale` for pan/zoom, contains TerminalNode divs
5. **CanvasControls** -- zoom buttons overlay, top-right corner

### Coordinate System
- Screen-to-world: `worldX = (screenX - viewportOffsetX - panX) / zoom`
- Terminal positions are stored in world coordinates
- TerminalLayer applies `translate(panX, panY) scale(zoom)` so children use world coords directly

### State Management (Zustand)
| Store | Purpose |
|---|---|
| `terminalStore` | Terminal nodes Map, CRUD, z-index, status, role, activity |
| `canvasStore` | panX, panY, zoom, grid settings |
| `canvasInteractionStore` | Current mode (select/draw/wire), draw rect, wire drag state |
| `wireStore` | Wire connections Map (typed: io/note/file/team) |
| `workspaceStore` | Workspace CRUD, current workspace, CWD |
| `settingsStore` | App settings, quick commands, wire-to-empty spawn config |
| `taskStore` | Task CRUD, drawer state, workspace-scoped |
| `teamStore` | Team management, drawer state |
| `noteStore` | Sticky notes on canvas |
| `fileNodeStore` | File/folder nodes on canvas |
| `dialogStore` | Modal dialog open/close state |
| `commandStore` | Command palette state |

### Backend (Rust)
- **PTY**: `src-tauri/src/pty/` -- portable-pty sessions, shell detection, resize
- **Commands**: `src-tauri/src/commands/` -- Tauri IPC commands (terminal, workspace, settings, agents, wire, team, tasks, file_preview)
- **Hub**: `src-tauri/src/hub/` -- local HTTP server (topology, identity, teams, endpoints) on port 19790
- **Workspace**: `src-tauri/src/workspace/` -- JSON file persistence in app data dir
- **Settings**: `src-tauri/src/settings/` -- App settings JSON persistence
- **Tasks**: `src-tauri/src/tasks/` -- Task store with CRUD
- **Integrations**: `src-tauri/src/integrations/` -- Agent CLI detection (claude, codex)

### Key Patterns
- **SpawnOptions**: `useTerminal.spawn()` takes an options object, not positional args
- **Terminal Registry**: `services/terminalRegistry.ts` -- global Map of xterm instances for cross-terminal read/write
- **Theme System**: `utils/terminalThemes.ts` -- 5 xterm ITheme objects + 8 accent colors
- **Role System**: `utils/terminalRoles.ts` -- 5 terminal roles with color/glyph metadata
- **Event Forwarding**: Tauri events `terminal-output-{id}` and `terminal-exit-{id}` per terminal
- **Activity Polling**: `useTerminalActivity` runs a 500ms tick to derive working/idle from last output timestamp
- **Node Drag**: `useNodeDrag` -- shared drag/resize hook for terminals, notes, and file nodes

## Conventions

- Tokyo Night color palette throughout the UI (`#1a1b26` bg, `#1f2335` surface, `#7aa2f7` accent, `#c0caf5` text, `#565f89` muted)
- Inline styles (no CSS modules/Tailwind) -- all styling is in component files
- Types in `src/types/`, one file per domain
- Stores in `src/store/`, one file per store
- Hooks in `src/hooks/`, prefixed with `use`
- Tauri IPC wrappers in `src/services/tauriCommands.ts` and `tauriEvents.ts`
- IDs generated with nanoid via `src/utils/id.ts`

## Gotchas

- xterm.js v5.5 requires the CanvasAddon to render text -- without it the terminal appears blank
- TerminalLayer uses `pointerEvents: none` on the container, `pointerEvents: auto` on individual TerminalNode divs
- The `--zoom` CSS custom property on `#terminal-layer` is read by drag/resize handlers to compensate for scale
- Workspace files are stored in the OS app data directory (via Rust `dirs::data_dir()`)
- Wire `forwardOutput` is legacy -- wire semantics are relationship registration, not output forwarding
- Port 1420 conflicts with Windows Hyper-V reserved range; dev server runs on port 5173
- Shell pref must be `undefined` (not empty string) to fall back to system default -- empty string causes null-byte crash
- OS file drop listener registers once with `[]` deps; reads store via `getState()` inside handler to avoid re-registration leaks
