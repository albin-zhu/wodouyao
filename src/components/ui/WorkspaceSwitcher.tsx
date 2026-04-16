import { useState, useRef, useEffect } from "react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useWorkspace } from "../../hooks/useWorkspace";

export default function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, loadWorkspaceById, deleteWorkspace, createWorkspace } =
    useWorkspaceStore();
  const { buildWorkspace, applyWorkspace } = useWorkspace();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    await createWorkspace(newName.trim(), buildWorkspace);
    setCreating(false);
    setNewName("");
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
    await renameWorkspace(renaming, renameValue.trim(), buildWorkspace);
    setRenaming(null);
  };

  const displayName = currentWorkspace?.name ?? "No Workspace";

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setDropdownOpen((v) => !v)}
        style={{
          background: "none",
          border: "1px solid #292e42",
          borderRadius: 6,
          color: "#c0caf5",
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
        <span style={{ color: "#565f89", fontSize: 10 }}>
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
            background: "#1f2335",
            border: "1px solid #292e42",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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
                  color: "#565f89",
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
                      ? "#292e42"
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
                      background: "#13141b",
                      border: "1px solid #3b4261",
                      borderRadius: 4,
                      color: "#c0caf5",
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
                          color: "#c0caf5",
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ws.name}
                      </div>
                      <div style={{ color: "#565f89", fontSize: 10 }}>
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
                          color: "#565f89",
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
                          color: "#f7768e",
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
              borderTop: "1px solid #292e42",
              padding: "8px 14px",
            }}
          >
            {creating ? (
              <div style={{ display: "flex", gap: 6 }}>
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
                    flex: 1,
                    background: "#13141b",
                    border: "1px solid #3b4261",
                    borderRadius: 4,
                    color: "#c0caf5",
                    padding: "4px 8px",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleCreate}
                  style={{
                    background: "#7aa2f7",
                    color: "#1a1b26",
                    border: "none",
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{
                  width: "100%",
                  background: "#292e42",
                  color: "#c0caf5",
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
