import { useCallback } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useTerminalStore } from "../store/terminalStore";
import { useCanvasStore } from "../store/canvasStore";
import { useWireStore } from "../store/wireStore";
import type { Workspace, WorkspaceTerminalLayout, WorkspaceWireLayout } from "../types/workspace";
import { saveWorkspace } from "../services/tauriCommands";
import { generateId } from "../utils/id";

export function useForkWorkspace() {
  const { currentWorkspace, loadWorkspaceList, loadWorkspaceById } = useWorkspaceStore();
  const getTerminals = useTerminalStore((s) => s.getTerminals);
  const wiresMap = useWireStore((s) => s.wires);
  const { panX, panY, zoom, gridVisible, gridSize } = useCanvasStore();

  return useCallback(
    async (newName?: string) => {
      const terms = getTerminals();
      const termLayouts: WorkspaceTerminalLayout[] = terms.map((t) => ({
        id: t.id,
        name: t.name,
        shell_type: t.shellType,
        initial_command: t.initialCommand,
        position: t.position,
        size: t.size,
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
      const forkedId = generateId();
      const forked: Workspace = {
        id: forkedId,
        name: newName ?? `${currentWorkspace?.name ?? "Workspace"} (fork)`,
        cwd: useWorkspaceStore.getState().currentWorkspaceCwd ?? undefined,
        canvas: { pan_x: panX, pan_y: panY, zoom, grid_visible: gridVisible, grid_size: gridSize },
        terminals: termLayouts,
        wires: wireLayouts,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      await saveWorkspace(forked);
      await loadWorkspaceList();
      // loadWorkspaceById requires applyWorkspace — dispatch a custom event
      // so App.tsx (which owns applyWorkspace) handles the actual switch.
      window.dispatchEvent(new CustomEvent("wodouyao:fork-workspace", { detail: forkedId }));
    },
    [currentWorkspace, getTerminals, wiresMap, panX, panY, zoom, gridVisible, gridSize, loadWorkspaceList, loadWorkspaceById]
  );
}
