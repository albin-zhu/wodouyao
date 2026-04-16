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
- [x] Workspace persistence (save/load terminal layouts as JSON)
- [x] Workspace switcher dropdown (create, rename, delete, switch)
- [x] Command palette (Ctrl+K) with fuzzy search

### Phase 3 -- Settings & Polish
- [x] Settings drawer (default shell, quick commands)
- [x] Terminal panel (list view of all terminals)
- [x] Available shell detection (bash, zsh, fish, PowerShell, cmd)
- [x] Keyboard shortcut system

### Phase 4 -- Customization & Agents
- [x] 8 accent colors per terminal
- [x] 5 xterm themes (Tokyo Night, Dracula, Nord, Monokai, Solarized)
- [x] Terminal creation dialog (name, color, theme, shell, cwd, command)
- [x] Workspace working directory (inherited by new terminals)
- [x] CLI agent detection (claude, codex, opencode)
- [x] Agent-specific icons and colors on toolbar
- [x] Right-click context menu (rename, color, wire, fold, copy buffer, close)
- [x] Wire anchors visible on hover, auto-mode-switch
- [x] Terminal content read/write registry (cross-terminal buffer access)

---

## In Progress

### Phase 5 -- Wire Routing & Event Handling
- [ ] Wire bezier curves route around terminal windows (obstacle avoidance)
- [ ] Mouse event capture inside terminals (scroll/wheel stays in xterm, doesn't pan canvas)
- [ ] Wire visual improvements (direction indicators, labels)

### Phase 6 -- Hub & Skill Communication
- [ ] Refactor wire semantics: wires = relationship registration, not output forwarding
- [ ] Central hub/registry for connected agent relationships
- [ ] Skill-based inter-agent communication protocol
- [ ] Hub API: agents discover connected peers and exchange structured messages
- [ ] Remove raw stdout forwarding (current useWireForwarding behavior)

---

## Planned

### Phase 7 -- Agent Intelligence
- [ ] Skill definitions (read buffer, write input, query state, delegate task)
- [ ] Agent capability negotiation (what skills each CLI supports)
- [ ] Orchestration layer -- maestri coordinates multi-agent workflows
- [ ] Task routing based on wire topology
- [ ] Conversation context sharing between connected agents

### Phase 8 -- UX Polish
- [ ] Terminal search (find text in terminal buffer)
- [ ] Terminal split view (horizontal/vertical within a node)
- [ ] Minimap overlay for large canvases
- [ ] Snap-to-grid for terminal placement
- [ ] Undo/redo for canvas operations
- [ ] Terminal groups (select multiple, move together)
- [ ] Export workspace as shareable file

### Phase 9 -- Platform & Distribution
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
