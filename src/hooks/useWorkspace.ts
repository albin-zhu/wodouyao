import { useEffect, useCallback, useRef } from "react";
import { useTerminalStore } from "../store/terminalStore";
import { useCanvasStore } from "../store/canvasStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useSettingsStore } from "../store/settingsStore";
import { useWireStore } from "../store/wireStore";
import { useTaskStore } from "../store/taskStore";
import { useNoteStore } from "../store/noteStore";
import { useFileNodeStore } from "../store/fileNodeStore";
import { useTaskBoardStore } from "../store/taskBoardStore";
import type {
  Workspace,
  WorkspaceTerminalLayout,
  WorkspaceWireLayout,
  WorkspaceNoteLayout,
  WorkspaceFileNodeLayout,
  WorkspaceTaskBoardLayout,
} from "../types/workspace";
import type { TerminalNode, ShellType } from "../types/terminal";
import {
  createTerminal,
  saveWorkspace,
  saveWorkspaceTerminals,
} from "../services/tauriCommands";
import { generateId } from "../utils/id";
import { DEFAULT_COLS, DEFAULT_ROWS } from "../utils/constants";

/** Rewrite a terminal's spawn command so opening a saved workspace picks
 *  up the previous agent session instead of starting fresh. Rules:
 *
 *    claude with session_id → `claude --dangerously-skip-permissions -r <id>`
 *    claude without id      → `claude --dangerously-skip-permissions -c`
 *    codex with session_id  → `codex --dangerously-bypass-approvals-and-sandbox --resume <id>`
 *    codex without id       → `codex --dangerously-bypass-approvals-and-sandbox --resume`
 *    shell / unknown        → original command verbatim
 *
 *  Callers pass the verbatim `initial_command`; we only swap when we
 *  recognize a supported agent kind. If the user customized the command
 *  (piping, env prefix, bash -c wrapper), we keep it as-is rather than
 *  risk mangling — session recovery is best-effort. */
function buildResumeCommand(
  originalCommand: string | undefined,
  agentKind: WorkspaceTerminalLayout["agent_kind"],
  sessionId: string | undefined,
): string | undefined {
  if (!originalCommand || !agentKind) return originalCommand;
  const trimmed = originalCommand.trim();
  if (agentKind === "claude" && /^claude(\s|$)/.test(trimmed)) {
    return sessionId
      ? `claude --dangerously-skip-permissions -r ${sessionId}`
      : `claude --dangerously-skip-permissions -c`;
  }
  if (agentKind === "codex" && /^codex(\s|$)/.test(trimmed)) {
    return sessionId
      ? `codex --dangerously-bypass-approvals-and-sandbox --resume ${sessionId}`
      : `codex --dangerously-bypass-approvals-and-sandbox --resume`;
  }
  return originalCommand;
}

export function useWorkspace() {
  const terminals = useTerminalStore((s) => s.terminals);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const getTerminals = useTerminalStore((s) => s.getTerminals);
  const { panX, panY, zoom, gridVisible, gridSize, setPan } =
    useCanvasStore();
  const {
    currentWorkspace,
    saveCurrentWorkspace,
    loadWorkspaceById,
    loadWorkspaceList,
  } = useWorkspaceStore();
  const currentWorkspaceCwd = useWorkspaceStore((s) => s.currentWorkspaceCwd);
  const { settings, updateSettings } = useSettingsStore();
  const wiresMap = useWireStore((s) => s.wires);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const initRef = useRef(false);

  // Build workspace from current state. Filters by the active workspace
  // so terminals/notes/etc belonging to other workspaces are NOT persisted
  // into this workspace's file (they're persisted into theirs at the
  // moment of switching out / explicit save).
  const buildWorkspace = useCallback((): Workspace => {
    const activeWsId =
      useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const inActiveWs = <T extends { workspaceId?: string | null }>(item: T) =>
      activeWsId === null || (item.workspaceId ?? activeWsId) === activeWsId;

    const terms = getTerminals().filter(inActiveWs);
    const termLayouts: WorkspaceTerminalLayout[] = terms.map((t) => ({
      id: t.id,
      name: t.name,
      shell_type: t.shellType,
      initial_command: t.initialCommand,
      position: { x: t.position.x, y: t.position.y },
      size: { width: t.size.width, height: t.size.height },
      is_folded: t.isFolded,
      color: t.color,
      theme: t.theme,
      cwd: t.cwd,
      role: t.role,
      agent_kind: t.agentKind,
      session_id: t.sessionId,
    }));

    const wireLayouts: WorkspaceWireLayout[] = Array.from(wiresMap.values())
      .filter((w) => activeWsId === null || (w.workspaceId ?? activeWsId) === activeWsId)
      .map((w) => ({
        id: w.id,
        source_id: w.sourceId,
        target_id: w.targetId,
        forward_output: true,
      }));

    const noteLayouts: WorkspaceNoteLayout[] = useNoteStore
      .getState()
      .getNotes()
      .filter(inActiveWs)
      .map((n) => ({
        id: n.id,
        text: n.text,
        color: n.color,
        position: n.position,
        size: n.size,
        z_index: n.zIndex,
        created_at: n.createdAt,
      }));

    const fileNodeLayouts: WorkspaceFileNodeLayout[] = useFileNodeStore
      .getState()
      .getFileNodes()
      .filter(inActiveWs)
      .map((f) => ({
        id: f.id,
        path: f.path,
        name: f.name,
        kind: f.kind,
        position: f.position,
        size: f.size,
        z_index: f.zIndex,
        created_at: f.createdAt,
      }));

    const taskBoardLayouts: WorkspaceTaskBoardLayout[] = Array.from(
      useTaskBoardStore.getState().boards.values()
    )
      .filter(inActiveWs)
      .map((b) => ({
        id: b.id,
        label: b.label,
        position: b.position,
        size: b.size,
        z_index: b.zIndex,
        created_at: Date.now(),
      }));

    return {
      id: "",
      name: "",
      cwd: useWorkspaceStore.getState().currentWorkspaceCwd ?? undefined,
      canvas: {
        pan_x: panX,
        pan_y: panY,
        zoom,
        grid_visible: gridVisible,
        grid_size: gridSize,
      },
      terminals: termLayouts,
      wires: wireLayouts,
      notes: noteLayouts,
      file_nodes: fileNodeLayouts,
      task_boards: taskBoardLayouts,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }, [getTerminals, wiresMap, panX, panY, zoom, gridVisible, gridSize]);

  // Apply workspace: hot-switch render only, do NOT destroy live PTYs.
  //  - Autosave the outgoing workspace (its layout/positions) before flipping.
  //  - Snapshot/restore canvas pan/zoom per workspace.
  //  - Reconcile terminals: spawn only those whose PTY is not alive, update
  //    metadata (position/size/role/etc) on the rest, mark them as belonging
  //    to the new workspace.
  //  - Stamp wires/notes/file_nodes/task_boards/tasks with the new workspace
  //    id (legacy migration). Backend has already upserted them.
  const applyWorkspace = useCallback(
    async (ws: Workspace) => {
      const outgoingId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
      const incomingId = ws.id;

      // 1) Autosave the outgoing workspace's current layout snapshot before
      //    we start mutating things — so positions/pan/zoom aren't lost.
      if (outgoingId && outgoingId !== incomingId) {
        try {
          const snapshot = buildWorkspace();
          snapshot.id = outgoingId;
          // Preserve name/created_at by hydrating from the existing meta.
          const outgoingMeta = useWorkspaceStore
            .getState()
            .workspaces.find((w) => w.id === outgoingId);
          snapshot.name = outgoingMeta?.name ?? "Workspace";
          snapshot.updated_at = Date.now();
          await saveWorkspace(snapshot);
        } catch (e) {
          console.warn("[workspace] autosave outgoing failed:", e);
        }
      }

      // 2) Per-workspace canvas swap (snapshot outgoing, restore incoming).
      useCanvasStore.getState().switchTo(incomingId, outgoingId);
      // If the workspace file has explicit pan/zoom AND we have no prior
      // snapshot for this id, honor the file. Otherwise prefer snapshot.
      const hasSnapshot = useCanvasStore
        .getState()
        .workspaceViews.has(incomingId);
      if (!hasSnapshot) {
        setPan(ws.canvas.pan_x, ws.canvas.pan_y);
        useCanvasStore.setState({ zoom: ws.canvas.zoom });
      }

      // 3) Restore workspace cwd.
      useWorkspaceStore.getState().setWorkspaceCwd(ws.cwd ?? null);

      // 4) Terminal reconcile — spawn only what's missing, stamp the rest.
      const liveTerminals = useTerminalStore.getState().terminals;
      for (const layout of ws.terminals) {
        const existing = liveTerminals.get(layout.id);
        if (existing) {
          // Terminal is alive (probably from a prior workspace); just
          // update its layout metadata and re-tag it for this workspace.
          useTerminalStore.getState().updateTerminal(layout.id, {
            name: layout.name,
            position: { x: layout.position.x, y: layout.position.y },
            size: { width: layout.size.width, height: layout.size.height },
            isFolded: layout.is_folded,
            color: layout.color ?? existing.color,
            theme: (layout.theme as TerminalNode["theme"]) ?? existing.theme,
            role: layout.role as TerminalNode["role"],
            cwd: layout.cwd ?? existing.cwd,
            workspaceId: incomingId,
          });
          continue;
        }
        // Fresh spawn — terminal does not exist yet (cold start, or fork
        // from a different ws where this terminal was never spawned).
        // Rewrite the command to a resume form for known agents so the
        // previous chat session is picked up. Session-id-specific resume
        // (`-r <id>` / `--resume <id>`) wins when we have one stored;
        // otherwise fall through to the agent's continue-most-recent flag.
        const resumeCommand = buildResumeCommand(
          layout.initial_command,
          layout.agent_kind,
          layout.session_id,
        );
        const overrides: Partial<TerminalNode> = {
          id: layout.id,
          name: layout.name,
          shellType: layout.shell_type as ShellType,
          initialCommand: layout.initial_command,
          position: { x: layout.position.x, y: layout.position.y },
          size: { width: layout.size.width, height: layout.size.height },
          isFolded: layout.is_folded,
          color: layout.color,
          theme: (layout.theme as TerminalNode["theme"]) ?? "tokyonight",
          cwd: layout.cwd,
          role: layout.role as TerminalNode["role"],
          agentKind: layout.agent_kind,
          sessionId: layout.session_id,
          workspaceId: incomingId,
        };
        addTerminal(overrides);
        try {
          await createTerminal({
            id: layout.id,
            command: resumeCommand,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
            cwd: layout.cwd ?? ws.cwd,
            workspace_id: incomingId,
          });
        } catch (err) {
          console.error("[workspace] Failed to create terminal:", err);
        }
      }

      // 5) Wires + tasks: backend already upserted; pull the fresh state.
      await useWireStore.getState().hydrate();
      await useTaskStore.getState().hydrate();

      // 6) Notes / file nodes / task boards: stamp with incomingId on the way in.
      const noteMap = new Map<string, import("../types/note").NoteNode>();
      let maxNoteZ = 0;
      // Preserve notes from OTHER workspaces (don't blast them away).
      for (const n of useNoteStore.getState().notes.values()) {
        if (n.workspaceId && n.workspaceId !== incomingId) {
          noteMap.set(n.id, n);
        }
      }
      for (const n of ws.notes ?? []) {
        const node = {
          id: n.id,
          text: n.text,
          color: n.color,
          position: n.position,
          size: n.size,
          zIndex: n.z_index,
          createdAt: n.created_at,
          workspaceId: incomingId,
        };
        noteMap.set(node.id, node);
        if (node.zIndex > maxNoteZ) maxNoteZ = node.zIndex;
      }
      useNoteStore.setState({ notes: noteMap, nextZIndex: maxNoteZ + 1 });

      const fileMap = new Map<string, import("../types/fileNode").FileNode>();
      let maxFileZ = 0;
      for (const f of useFileNodeStore.getState().fileNodes.values()) {
        if (f.workspaceId && f.workspaceId !== incomingId) {
          fileMap.set(f.id, f);
        }
      }
      for (const f of ws.file_nodes ?? []) {
        const node: import("../types/fileNode").FileNode = {
          id: f.id,
          path: f.path,
          name: f.name,
          kind: f.kind as import("../types/fileNode").FileKind,
          position: f.position,
          size: f.size,
          zIndex: f.z_index,
          createdAt: f.created_at,
          workspaceId: incomingId,
        };
        fileMap.set(node.id, node);
        if (node.zIndex > maxFileZ) maxFileZ = node.zIndex;
      }
      useFileNodeStore.setState({ fileNodes: fileMap, nextZIndex: maxFileZ + 1 });

      const boardMap = new Map<string, import("../store/taskBoardStore").TaskBoard>();
      for (const b of useTaskBoardStore.getState().boards.values()) {
        if (b.workspaceId && b.workspaceId !== incomingId) {
          boardMap.set(b.id, b);
        }
      }
      for (const b of ws.task_boards ?? []) {
        boardMap.set(b.id, {
          id: b.id,
          label: b.label,
          position: b.position,
          size: b.size,
          zIndex: b.z_index,
          workspaceId: incomingId,
        });
      }
      useTaskBoardStore.setState({ boards: boardMap });
    },
    [addTerminal, setPan, buildWorkspace]
  );

  const forkCurrentWorkspace = useCallback(
    async (newName?: string) => {
      const { currentWorkspace, loadWorkspaceList, loadWorkspaceById } =
        useWorkspaceStore.getState();
      const base = buildWorkspace();
      const forkedId = generateId();
      const forked: Workspace = {
        ...base,
        id: forkedId,
        name: newName ?? `${currentWorkspace?.name ?? "Workspace"} (fork)`,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      await saveWorkspace(forked);
      await loadWorkspaceList();
      await loadWorkspaceById(forkedId, applyWorkspace);
    },
    [buildWorkspace, applyWorkspace]
  );

  // Auto-save: debounce 3s on terminal/canvas changes (full workspace save).
  useEffect(() => {
    if (!currentWorkspace) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveCurrentWorkspace(undefined, buildWorkspace);
    }, 3000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [terminals, panX, panY, zoom, currentWorkspaceCwd, currentWorkspace, buildWorkspace, saveCurrentWorkspace]);

  // Fast terminal-layout autosave: 250ms debounce. Drag/resize fires this
  // burst many times — coalesce into a single partial write so the on-disk
  // `terminals` slice is at most ~250ms behind reality, not 3s. Survives
  // kill -9 within that window without paying the full-workspace cost on
  // every drag tick.
  useEffect(() => {
    if (!currentWorkspace) return;

    if (terminalSaveTimerRef.current) {
      clearTimeout(terminalSaveTimerRef.current);
    }

    terminalSaveTimerRef.current = setTimeout(() => {
      const wsId = useWorkspaceStore.getState().currentWorkspace?.id;
      if (!wsId) return;
      const ws = buildWorkspace();
      void saveWorkspaceTerminals(wsId, ws.terminals).catch((e) =>
        console.warn("[workspace] terminal autosave failed:", e),
      );
    }, 250);

    return () => {
      if (terminalSaveTimerRef.current) {
        clearTimeout(terminalSaveTimerRef.current);
      }
    };
  }, [terminals, currentWorkspace, buildWorkspace]);

  // Startup: load last workspace
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      await loadWorkspaceList();
      const lastId = settings?.last_workspace_id;
      if (lastId) {
        await loadWorkspaceById(lastId, applyWorkspace);
      }
    };

    if (settings) {
      init();
    }
  }, [settings]);

  // Persist last_workspace_id when workspace changes
  useEffect(() => {
    if (currentWorkspace && settings) {
      if (settings.last_workspace_id !== currentWorkspace.id) {
        updateSettings({ last_workspace_id: currentWorkspace.id });
      }
    }
  }, [currentWorkspace?.id]);

  return { buildWorkspace, applyWorkspace, forkCurrentWorkspace };
}
