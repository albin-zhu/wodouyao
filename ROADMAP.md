# Roadmap

## Completed

### Phase 1 -- Canvas & Terminals
- [x] Infinite canvas with pan/zoom (mouse wheel, middle-click drag)
- [x] Konva grid background with dot pattern
- [x] Terminal nodes on canvas (PTY-backed via portable-pty)
- [x] Drag to move, handle to resize
- [x] Terminal title bar with status badge
- [x] Fold/unfold terminals
- [x] Z-index management (bring to front on click)
- [x] Canvas controls (zoom buttons, reset view)

### Phase 2 -- Draw, Wires, Workspaces
- [x] Draw mode -- drag rectangle to create terminal
- [x] Wire mode -- connect terminals with bezier curves
- [x] Wire layer (SVG) with click-to-delete
- [x] Typed wires (io, note, file, team) derived from connected node types
- [x] Wire-to-empty spawn -- drag wire to blank canvas to auto-create agent terminal
- [x] Workspace persistence (save/load terminal layouts as JSON)
- [x] Workspace switcher dropdown (create, rename, delete, switch)
- [x] Workspace fork -- clone entire canvas as parallel experiment
- [x] Command palette (Ctrl+K) with fuzzy search

### Phase 3 -- Settings & Polish
- [x] Settings drawer (quick commands, wire-to-empty spawn config)
- [x] Native file pickers for path inputs
- [x] Terminal panel (list view of all terminals)
- [x] Available shell detection (bash, zsh, fish, PowerShell, cmd)
- [x] Keyboard shortcut system
- [x] Fullscreen toggle (F11 + toolbar button)

### Phase 4 -- Customization & Agents
- [x] 8 accent colors per terminal
- [x] 5 xterm themes (Tokyo Night, Dracula, Nord, Monokai, Solarized)
- [x] Terminal creation dialog (name, color, theme, shell, role, cwd, command)
- [x] Workspace working directory (inherited by new terminals)
- [x] CLI agent detection (claude, codex, opencode)
- [x] Agent-specific icons and colors on toolbar
- [x] Right-click context menu (rename, color, wire, fold, copy buffer, close)
- [x] Wire anchors visible on hover, auto-mode-switch
- [x] Terminal content read/write registry (cross-terminal buffer access)

### Phase 5 -- Canvas Resources
- [x] Sticky notes (freeform editable text on canvas)
- [x] File nodes via OS drag-and-drop (image/text/video/directory classification)
- [x] File preview (text content, directory listing, image display)
- [x] ResourceLayer renders notes + files with shared pan/zoom
- [x] Scroll containment (note/file scroll stays inside node, doesn't pan canvas)

### Phase 6 -- Hub & Communication
- [x] Hub server (tiny_http on port 19790)
- [x] Wire topology as relationship registry (not output forwarding)
- [x] Identity registry -- agents self-register via `wodouyao hello`
- [x] Peer discovery -- agents query connected peers via `wodouyao peers`
- [x] Inter-terminal messaging -- `wodouyao send` / `wodouyao read`
- [x] Team management -- create/list/join/leave teams via hub API
- [x] `wodouyao` CLI wrapper (POSIX shell script)

### Phase 7 -- Orchestration Panel (P0)
- [x] Role tags (planner/generator/evaluator/researcher/shell) with color chips
- [x] RolePicker component in title bar and create dialog
- [x] Live terminal status dots (working/idle/starting/exited/error)
- [x] Pulse animation on status badge for active terminals
- [x] 500ms polling tick for activity detection (avoids per-byte re-renders)
- [x] Task panel -- workspace-scoped task CRUD in right drawer
- [x] Task-to-terminal drag assignment (HTML5 drag-and-drop)
- [x] Task store with Rust backend persistence

---

## In Progress

### Phase 8 -- Agent Identity Integration
- [ ] Auto-populate terminal role from agent's self-reported identity (`wodouyao hello --kind`)
- [ ] Map hub identity registry `agent_kind` to frontend `terminal.role`
- [ ] CLI subcommands for tasks (`wodouyao task list/create/take/done`)
- [ ] CLI subcommands for notes (`wodouyao note read/write`)
- [ ] Update SKILL.md with Tasks API surface

### Phase 9 -- Wire Routing & Visual Polish
- [ ] Wire bezier curves route around terminal windows (obstacle avoidance)
- [ ] Wire visual improvements (direction indicators, labels, kind-based styling)
- [ ] Terminal search (find text in terminal buffer)
- [ ] Minimap overlay for large canvases
- [ ] Snap-to-grid for terminal placement

---

## Planned

### Phase 10 -- Advanced Orchestration
- [ ] Agent capability negotiation (what skills each CLI supports)
- [ ] Task routing based on wire topology and roles
- [ ] Conversation context sharing between connected agents
- [ ] Evaluator auto-spawn on code generation completion
- [ ] Replay timeline for terminal sessions

### Phase 11 -- UX Polish
- [ ] Terminal split view (horizontal/vertical within a node)
- [ ] Undo/redo for canvas operations
- [ ] Terminal groups (select multiple, move together)
- [ ] Export workspace as shareable file
- [ ] File node text selection support

### Phase 12 -- Platform & Distribution
- [ ] Auto-update (Tauri updater plugin)
- [ ] macOS and Linux testing/packaging
- [ ] Custom icon and branding
- [ ] Installer configurations per platform
- [ ] Crash reporting and telemetry (opt-in)

### Future Ideas
- [ ] Plugin system for custom terminal node types
- [ ] SSH/remote terminal support
- [ ] Recording/replay terminal sessions
- [ ] Collaborative canvas (multi-user via CRDT)
- [ ] Voice control for agent orchestration
