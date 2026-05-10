# CLAUDE.md

## Project Overview

Wodouyao is a cross-platform infinite canvas terminal multiplexer built with Tauri 2 + React 19 + TypeScript. Users place PTY-backed terminal windows on a zoomable canvas, connect them with wires, and observe multi-agent workflows. It is **not** a harness -- it is an observation and orchestration panel for existing agent harnesses (Claude Code, Codex, etc.).

**Dual runtime.** The same Rust core compiles into two binaries: `wodouyao` (Tauri desktop, default) and `wodouyao-server` (headless axum HTTP+WS server for browser-side UI). They share `PtyManager`, hub, stores, and command-impl logic via the `EventEmitter` / `PathResolver` trait abstraction in `src-tauri/src/runtime/`. Cargo features `tauri-runtime` (default) and `web-runtime` are mutually exclusive — pick one per build.

## Commands

```bash
# Tauri desktop (default — frontend hot-reload + Rust backend)
npm run tauri dev
npm run tauri build

# Headless web server (single-user remote access via browser)
npm run server:start    # daemonize: build SPA + cargo --release + nohup
npm run server:stop     # SIGTERM (escalates to SIGKILL after 2s)
npm run server:status   # pid + URL
npm run server:logs     # tail -f .wodouyao-runtime/server.log
npm run server:dev      # foreground variant for active development

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
- **Runtime**: `src-tauri/src/runtime/` -- `EventEmitter` + `PathResolver` traits and their two impls. `tauri_impl` wraps `AppHandle::emit` and `app.path().resource_dir()`; `web_impl` wraps a `tokio::sync::broadcast<WebEvent>` channel and `current_exe()`-based path resolution. PtyManager / hub / commands hold `Arc<dyn EventEmitter>` and `Arc<dyn PathResolver>` — no direct `tauri::AppHandle` outside `runtime/tauri_impl.rs` and the setup hook.
- **PTY**: `src-tauri/src/pty/` -- portable-pty sessions, shell detection, resize. `create_session` is idempotent on id (re-attach instead of re-spawn).
- **Commands**: `src-tauri/src/commands/` -- each command has a `*_impl(&AppState, …)` runtime-agnostic body and a `#[cfg(feature = "tauri-runtime")] #[tauri::command]` wrapper. The headless server reuses the same `*_impl` via a JSON dispatch in `bin/server.rs`.
- **Hub**: `src-tauri/src/hub/` -- local `tiny_http` server (topology, identity, teams, endpoints) on a random loopback port; `wodouyao` CLI talks to this. Separate from the axum-based wodouyao-server.
- **Web server binary**: `src-tauri/src/bin/server.rs` -- axum app on `127.0.0.1:19799` (override via `WODOUYAO_WEB_PORT`), Bearer-auth on `/v1/cmd/{name}` and `/v1/file/raw`, single-WS multiplexer at `/v1/events`, SPA hosted via tower-http `ServeDir`. Token persisted at `~/.wodouyao/web-token`.
- **Workspace**: `src-tauri/src/workspace/` -- JSON file persistence in app data dir
- **Settings**: `src-tauri/src/settings/` -- App settings JSON persistence
- **Tasks**: `src-tauri/src/tasks/` -- Task store with CRUD
- **Integrations**: `src-tauri/src/integrations/` -- Agent CLI detection (claude, codex)
- **Shaders**: `src-tauri/src/shaders.rs` -- runtime-agnostic shader file ops (the `commands::shaders::seed_from_resources` Tauri-setup-hook helper still uses `AppHandle` for bundled-asset copy).

### Key Patterns
- **Transport layer**: `services/transport.ts` -- runtime-detects `__TAURI_INTERNALS__` and routes `call(cmd, args)` / `subscribeJson(event, cb)` / `subscribeTerminalBinary(termId, cb)` / `openUrl(url)` / `fileUrl(path)` to either the Tauri APIs or HTTP+WS against wodouyao-server. All command + event call sites go through this so the same SPA boots in either environment.
- **SpawnOptions**: `useTerminal.spawn()` takes an options object, not positional args
- **Terminal Registry**: `services/terminalRegistry.ts` -- global Map of xterm instances for cross-terminal read/write
- **Theme System**: `utils/terminalThemes.ts` -- 5 xterm ITheme objects + 8 accent colors
- **Role System**: `utils/terminalRoles.ts` -- 5 terminal roles with color/glyph metadata
- **Event Forwarding**: under Tauri, `terminal-output-{id}` and `terminal-exit-{id}` events per terminal; under web, the same names ride `/v1/events` (binary frame `[id_len:u8][id_utf8][data]` for output, JSON envelope for exit)
- **Activity Polling**: `useTerminalActivity` runs a 500ms tick to derive working/idle from last output timestamp
- **Node Drag**: `useNodeDrag` -- shared drag/resize hook for terminals, notes, and file nodes
- **Font picker**: `components/ui/FontPresetPicker.tsx` -- 6 curated CSS font-family chains (default mixed CN+EN / Sarasa Term SC / Maple Mono CN / LXGW WenKai Mono / JetBrains Mono only / system mono) with live preview. Bundled JetBrains Mono via `@fontsource/jetbrains-mono` (imported in `main.tsx`) guarantees Latin renders sharp.

## Conventions

- Tokyo Night color palette throughout the UI (`#1a1b26` bg, `#1f2335` surface, `#7aa2f7` accent, `#c0caf5` text, `#565f89` muted)
- Inline styles (no CSS modules/Tailwind) -- all styling is in component files
- Types in `src/types/`, one file per domain
- Stores in `src/store/`, one file per store
- Hooks in `src/hooks/`, prefixed with `use`
- IPC call sites use `call()` / `subscribeJson()` from `src/services/transport.ts`; `src/services/tauriCommands.ts` and `tauriEvents.ts` are typed wrappers around those primitives (NOT direct `invoke`/`listen`)
- New Tauri commands: pair a runtime-agnostic `*_impl(&AppState, …)` with a `#[cfg(feature = "tauri-runtime")] #[tauri::command]` wrapper, plus a match arm in `bin/server.rs::cmd_dispatch` so the web server can reach it
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
- Web mode only: native file picker (`@tauri-apps/plugin-dialog`) and OS drag-drop (`getCurrentWebview().onDragDropEvent`) early-return under `!isTauri`; the user types server paths into the text input and uses HTML5-style drop equivalents (not yet implemented). `convertFileSrc` is replaced by `services/fileUrl.ts` which routes through `/v1/file/raw?path=…&token=…`.
- Web mode only: `create_terminal` is idempotent on id (returns Ok if `has_session(id)`). Without this, browser refresh / workspace switch would re-spawn live PTYs because the frontend rebuilds its terminal-node Map and replays the layout's `createTerminal` calls.
