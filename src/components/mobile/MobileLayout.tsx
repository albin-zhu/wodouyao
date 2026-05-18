import { useState, useCallback, useEffect, useMemo } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useWorkspace } from "../../hooks/useWorkspace";
import MobileTerminalView from "./MobileTerminalView";
import type { TerminalStatus, TerminalNode } from "../../types/terminal";

function StatusDot({ status }: { status: TerminalStatus }) {
  const color =
    status === "running"
      ? "var(--color-success)"
      : status === "error"
        ? "var(--color-danger)"
        : status === "starting"
          ? "var(--color-warning)"
          : "var(--color-text-muted)";
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

export default function MobileLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Incremented on every workspace switch to force MobileTerminalView remount.
  const [terminalViewKey, setTerminalViewKey] = useState(0);
  // Select the Map directly (stable reference between store updates) and
  // memoize the visible list so Zustand’s useSyncExternalStore doesn’t see
  // a new object on every render. Must also depend on currentWorkspaceId
  // so switching workspaces re-filters the list even when the Map ref
  // hasn’t changed (applyWorkspace updates terminals before currentWorkspace).
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspace?.id ?? null);
  const loading = useWorkspaceStore((s) => s.loading);
  const terminals = useMemo<TerminalNode[]>(() => {
    // Don't filter until the workspace switch has fully completed (loading=false).
    // applyWorkspace updates terminals first, then currentWorkspace — filtering
    // mid-switch would use the stale workspace id.
    const all = Array.from(terminalsMap.values());
    if (loading) return [];
    if (currentWorkspaceId === null) return all;
    return all.filter((t) => (t.workspaceId ?? currentWorkspaceId) === currentWorkspaceId);
  }, [terminalsMap, currentWorkspaceId, loading]);
  const { spawn, kill } = useTerminal();
  const { buildWorkspace, applyWorkspace } = useWorkspace();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const loadWorkspaceList = useWorkspaceStore((s) => s.loadWorkspaceList);
  const loadWorkspaceById = useWorkspaceStore((s) => s.loadWorkspaceById);
  const saveCurrentWorkspace = useWorkspaceStore((s) => s.saveCurrentWorkspace);

  // Load workspace list on mount.
  useEffect(() => {
    loadWorkspaceList();
  }, [loadWorkspaceList]);

  // When currentWorkspace changes (including after a workspace switch), auto-select
  // the first terminal so the user doesn't see a blank screen.
  useEffect(() => {
    if (!loading && terminals.length > 0 && !activeId) {
      setActiveId(terminals[0].id);
    }
  }, [loading, terminals, activeId]);

  // If the active terminal is removed (exit / kill), clear the selection.
  useEffect(() => {
    if (activeId && !terminals.some((t) => t.id === activeId)) {
      setActiveId(null);
    }
  }, [terminals, activeId]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setDrawerOpen(false);
  }, []);

  const handleNewTerminal = useCallback(async () => {
    const t = await spawn();
    setActiveId(t.id);
    setDrawerOpen(false);
  }, [spawn]);

  const handleSwitchWorkspace = useCallback(
    async (id: string) => {
      setActiveId(null);
      setDrawerOpen(false);
      setTerminalViewKey((k) => k + 1);
      if (currentWorkspace?.id === id) {
        await loadWorkspaceById(id, applyWorkspace);
      } else {
        await saveCurrentWorkspace(undefined, buildWorkspace);
        await loadWorkspaceById(id, applyWorkspace);
      }
    },
    [currentWorkspace, saveCurrentWorkspace, buildWorkspace, loadWorkspaceById, applyWorkspace]
  );

  const handleReloadWorkspace = useCallback(async () => {
    if (!currentWorkspace) return;
    setActiveId(null);
    await loadWorkspaceById(currentWorkspace.id, applyWorkspace);
  }, [currentWorkspace, loadWorkspaceById, applyWorkspace]);

  const activeTerminal = terminals.find((t) => t.id === activeId);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        overflow: "hidden",
        background: "var(--color-bg)",
      }}
    >
      {/* Drawer */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 280,
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "var(--color-text)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentWorkspace?.name ?? "Wodouyao"}
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: 20,
              padding: 0,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={currentWorkspace?.id ?? ""}
              onChange={(e) => {
                if (e.target.value) handleSwitchWorkspace(e.target.value);
              }}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-alt)",
                color: "var(--color-text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleReloadWorkspace}
              title="Reload workspace"
              style={{
                padding: "0 10px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-alt)",
                color: "var(--color-text-muted)",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ↻
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {terminals.length === 0 && (
            <div
              style={{
                padding: 16,
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: 13,
              }}
            >
              No terminals yet
            </div>
          )}
          {terminals.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                marginBottom: 6,
                borderRadius: 6,
                border: "none",
                background: activeId === t.id ? "var(--color-accent)" : "transparent",
                color: activeId === t.id ? "var(--color-on-accent)" : "var(--color-text)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: t.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.name}
              </span>
              <StatusDot status={t.status} />
            </button>
          ))}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--color-border)" }}>
          <button
            onClick={handleNewTerminal}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px dashed var(--color-border)",
              background: "transparent",
              color: "var(--color-text)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + New Terminal
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
        />
      )}

      {/* Main */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {activeTerminal ? (
          <>
            <header
              style={{
                height: 44,
                background: "var(--color-surface)",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text)",
                  fontSize: 18,
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                ≡
              </button>
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: "var(--color-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeTerminal.name}
              </span>
              <button
                onClick={() => {
                  if (activeTerminal) kill(activeTerminal.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-danger)",
                  fontSize: 16,
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </header>

            <div
              style={{
                flex: 1,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <MobileTerminalView key={terminalViewKey} terminalId={activeTerminal.id} />
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              color: "var(--color-text-muted)",
            }}
          >
            <div style={{ fontSize: 48, opacity: 0.3 }}>≡</div>
            <div style={{ fontSize: 14 }}>Select a terminal from the drawer</div>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{
                padding: "10px 20px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Open Drawer
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
