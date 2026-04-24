import { useState, useRef, useEffect } from "react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useWorkspace } from "../../hooks/useWorkspace";

export default function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, loadWorkspaceById, deleteWorkspace, createWorkspace, loadWorkspaceList } =
    useWorkspaceStore();
  const { applyWorkspace } = useWorkspace();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCwd, setNewCwd] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Refresh the workspace list whenever the dropdown opens. The startup
  // listing could race with the settings load; this guarantees the user
  // always sees the current set without needing to create a new workspace
  // to force a refresh.
  useEffect(() => {
    if (dropdownOpen) {
      loadWorkspaceList();
    }
  }, [dropdownOpen, loadWorkspaceList]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCreating(false);
        setRenaming(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleSwitch = async (id: string) => {
    if (id === currentWorkspace?.id) {
      setDropdownOpen(false);
      return;
    }
    await loadWorkspaceById(id, applyWorkspace);
    setDropdownOpen(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    // createWorkspace now saves a BLANK workspace file (no terminals/notes
    // copied from the current WS). Then switch into it via loadWorkspaceById
    // so the full reconcile/isolation runs.
    const newId = await createWorkspace(newName.trim(), newCwd.trim() || null);
    await loadWorkspaceById(newId, applyWorkspace);
    if (newCwd.trim()) {
      useWorkspaceStore.getState().setWorkspaceCwd(newCwd.trim());
    }
    setCreating(false);
    setNewName("");
    setNewCwd("");
    setDropdownOpen(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteWorkspace(id);
  };

  const handleRenameStart = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenaming(id);
    setRenameValue(name);
  };

  const handleRenameSubmit = async () => {
    if (!renaming || !renameValue.trim()) return;
    const { renameWorkspace } = useWorkspaceStore.getState();
    await renameWorkspace(renaming, renameValue.trim());
    setRenaming(null);
  };

  const displayName = currentWorkspace?.name ?? "No Workspace";

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setDropdownOpen((v) => !v)}
        style={{
          background: "none",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          color: "var(--color-text)",
          padding: "4px 10px",
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          maxWidth: 160,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName}
        </span>
        <span style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
          {dropdownOpen ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {dropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            width: 260,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-dropdown)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {/* Workspace list */}
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {workspaces.length === 0 && (
              <div
                style={{
                  padding: "12px 14px",
                  color: "var(--color-text-muted)",
                  fontSize: 12,
                }}
              >
                No saved workspaces
              </div>
            )}
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => handleSwitch(ws.id)}
                style={{
                  padding: "8px 14px",
                  cursor: "pointer",
                  background:
                    ws.id === currentWorkspace?.id
                      ? "var(--color-surface-alt)"
                      : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {renaming === ws.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={handleRenameSubmit}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    style={{
                      flex: 1,
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border-strong)",
                      borderRadius: 4,
                      color: "var(--color-text)",
                      padding: "2px 6px",
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: "var(--color-text)",
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ws.name}
                      </div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
                        {ws.terminal_count} terminal
                        {ws.terminal_count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={(e) =>
                          handleRenameStart(ws.id, ws.name, e)
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--color-text-muted)",
                          cursor: "pointer",
                          fontSize: 10,
                          padding: "2px 4px",
                        }}
                      >
                        ren
                      </button>
                      <button
                        onClick={(e) => handleDelete(ws.id, e)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--color-danger)",
                          cursor: "pointer",
                          fontSize: 10,
                          padding: "2px 4px",
                        }}
                      >
                        del
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* New workspace */}
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              padding: "8px 14px",
            }}
          >
            {creating ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Workspace name"
                  autoFocus
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: 4,
                    color: "var(--color-text)",
                    padding: "4px 8px",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <input
                  value={newCwd}
                  onChange={(e) => setNewCwd(e.target.value)}
                  placeholder="Working directory (optional)"
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: 4,
                    color: "var(--color-text)",
                    padding: "4px 8px",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleCreate}
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-bg-alt)",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{
                  width: "100%",
                  background: "var(--color-surface-alt)",
                  color: "var(--color-text)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 0",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                + New Workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
