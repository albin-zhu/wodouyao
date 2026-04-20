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
import { destroyTerminal, createTerminal, saveWorkspace } from "../services/tauriCommands";
import { generateId } from "../utils/id";
import { DEFAULT_COLS, DEFAULT_ROWS } from "../utils/constants";

export function useWorkspace() {
  const terminals = useTerminalStore((s) => s.terminals);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
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
  const initRef = useRef(false);

  // Build workspace from current state
  const buildWorkspace = useCallback((): Workspace => {
    const terms = getTerminals();
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
    }));

    const wireLayouts: WorkspaceWireLayout[] = Array.from(wiresMap.values()).map((w) => ({
      id: w.id,
      source_id: w.sourceId,
      target_id: w.targetId,
      forward_output: true,
    }));

    const noteLayouts: WorkspaceNoteLayout[] = useNoteStore.getState().getNotes().map((n) => ({
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
    ).map((b) => ({
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

  // Apply workspace: clear existing terminals and recreate from layout
  const applyWorkspace = useCallback(
    async (ws: Workspace) => {
      // Destroy all existing PTY sessions
      const existing = getTerminals();
      for (const t of existing) {
        await destroyTerminal(t.id).catch(console.error);
        removeTerminal(t.id);
      }

      // Backend's load_workspace command has already seeded the wire topology
      // from ws.wires; the frontend just mirrors that state below via hydrate().

      // Restore workspace cwd
      useWorkspaceStore.getState().setWorkspaceCwd(ws.cwd ?? null);

      // Restore canvas state
      setPan(ws.canvas.pan_x, ws.canvas.pan_y);
      useCanvasStore.setState({ zoom: ws.canvas.zoom });

      // Recreate terminals from layout
      for (const layout of ws.terminals) {
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
        };

        addTerminal(overrides);

        try {
          await createTerminal({
            id: layout.id,
            command: layout.initial_command,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
            cwd: layout.cwd ?? ws.cwd,
          });
        } catch (err) {
          console.error("[workspace] Failed to create terminal:", err);
        }
      }

      // Pull the freshly seeded wire topology from the backend.
      await useWireStore.getState().hydrate();
      // Backend's task store was replaced by load_workspace; mirror to FE.
      await useTaskStore.getState().hydrate();
      // Hydrate notes from workspace
      if (ws.notes && ws.notes.length > 0) {
        const newMap = new Map<string, import("../types/note").NoteNode>();
        let maxZ = 0;
        for (const n of ws.notes) {
          const node = {
            id: n.id,
            text: n.text,
            color: n.color,
            position: n.position,
            size: n.size,
            zIndex: n.z_index,
            createdAt: n.created_at,
          };
          newMap.set(node.id, node);
          if (node.zIndex > maxZ) maxZ = node.zIndex;
        }
        useNoteStore.setState({ notes: newMap, nextZIndex: maxZ + 1 });
      } else {
        useNoteStore.setState({ notes: new Map(), nextZIndex: 1 });
      }

      // Hydrate file nodes, task boards, and web nodes from workspace
      useFileNodeStore.getState().syncFromRust(
        (ws.file_nodes ?? []).map((f) => ({
          id: f.id,
          path: f.path,
          name: f.name,
          kind: f.kind,
          position: f.position,
          size: f.size,
          z_index: f.z_index,
          created_at: f.created_at,
        }))
      );
      useTaskBoardStore.getState().syncFromRust(
        (ws.task_boards ?? []).map((b) => ({
          id: b.id,
          label: b.label,
          position: b.position,
          size: b.size,
          z_index: b.z_index,
          created_at: b.created_at,
        }))
      );
    },
    [getTerminals, removeTerminal, addTerminal, setPan]
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

  // Auto-save: debounce 3s on terminal/canvas changes
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
