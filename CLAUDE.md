# CLAUDE.md

## Project Overview

Wodouyao is a cross-platform infinite canvas terminal multiplexer built with Tauri 2 + React 19 + TypeScript. Users place PTY-backed terminal windows on a zoomable canvas and connect them with wires.

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
1. **Konva Stage** -- grid dot background, `pointerEvents: none`
2. **SVG WireLayer** -- bezier wire curves between terminals, z-index 5
3. **DOM TerminalLayer** -- CSS `transform: translate/scale` for pan/zoom, contains TerminalNode divs
4. **CanvasControls** -- zoom buttons overlay, top-right corner

### Coordinate System
- Screen-to-world: `worldX = (screenX - viewportOffsetX - panX) / zoom`
- Terminal positions are stored in world coordinates
- TerminalLayer applies `translate(panX, panY) scale(zoom)` so children use world coords directly

### State Management (Zustand)
| Store | Purpose |
|---|---|
| `terminalStore` | Terminal nodes Map, CRUD, z-index, status |
| `canvasStore` | panX, panY, zoom |
| `canvasInteractionStore` | Current mode (select/draw/wire), draw rect, wire drag state |
| `wireStore` | Wire connections Map |
| `workspaceStore` | Workspace CRUD, current workspace, CWD |
| `settingsStore` | App settings, default shell, quick commands |
| `dialogStore` | Modal dialog open/close state |
| `commandStore` | Command palette state |

### Backend (Rust)
- **PTY**: `src-tauri/src/pty/` -- portable-pty sessions, shell detection, resize
- **Commands**: `src-tauri/src/commands/` -- Tauri IPC commands (terminal, workspace, settings, agents)
- **Workspace**: `src-tauri/src/workspace/` -- JSON file persistence in app data dir
- **Settings**: `src-tauri/src/settings/` -- App settings JSON persistence

### Key Patterns
- **SpawnOptions**: `useTerminal.spawn()` takes an options object, not positional args
- **Terminal Registry**: `services/terminalRegistry.ts` -- global Map of xterm instances for cross-terminal read/write
- **Theme System**: `utils/terminalThemes.ts` -- 5 xterm ITheme objects + 8 accent colors
- **Event Forwarding**: Tauri events `terminal-output-{id}` and `terminal-exit-{id}` per terminal

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
- Wire `forwardOutput` is legacy -- wire semantics are being refactored to relationship registration
