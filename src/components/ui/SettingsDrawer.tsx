import { useEffect, useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import { listAvailableShells } from "../../services/tauriCommands";
import type { ShellInfo } from "../../types/terminal";
import type { QuickCommand } from "../../types/settings";

export default function SettingsDrawer() {
  const { settings, drawerOpen, closeDrawer, updateSettings } =
    useSettingsStore();
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [editingCmd, setEditingCmd] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCommand, setEditCommand] = useState("");

  useEffect(() => {
    if (drawerOpen) {
      listAvailableShells()
        .then(setShells)
        .catch(() => {});
    }
  }, [drawerOpen]);

  if (!drawerOpen || !settings) return null;

  const handleShellChange = (path: string) => {
    updateSettings({ default_shell_path: path || null });
  };

  const handleFontSize = (size: number) => {
    if (size >= 8 && size <= 32) {
      updateSettings({ font_size: size });
    }
  };

  const startEditCmd = (cmd: QuickCommand) => {
    setEditingCmd(cmd.id);
    setEditLabel(cmd.label);
    setEditCommand(cmd.command);
  };

  const saveEditCmd = () => {
    if (!editingCmd) return;
    const updated = settings.quick_commands.map((c) =>
      c.id === editingCmd ? { ...c, label: editLabel, command: editCommand } : c
    );
    updateSettings({ quick_commands: updated });
    setEditingCmd(null);
  };

  const sectionStyle: React.CSSProperties = {
    padding: "16px 0",
    borderBottom: "1px solid #292e42",
  };

  const labelStyle: React.CSSProperties = {
    color: "#7aa2f7",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8999,
          background: "rgba(0,0,0,0.3)",
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 320,
          height: "100vh",
          zIndex: 9000,
          background: "#1f2335",
          borderLeft: "1px solid #292e42",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid #292e42",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#c0caf5", fontWeight: 600, fontSize: 14 }}>
            Settings
          </span>
          <button
            onClick={closeDrawer}
            style={{
              background: "none",
              border: "none",
              color: "#565f89",
              cursor: "pointer",
              fontSize: 18,
              padding: "2px 6px",
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* Content */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}
        >
          {/* Default Shell */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Default Shell</div>
            <select
              value={settings.default_shell_path || ""}
              onChange={(e) => handleShellChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#13141b",
                border: "1px solid #292e42",
                borderRadius: 6,
                color: "#c0caf5",
                fontSize: 13,
                outline: "none",
              }}
            >
              <option value="">System Default</option>
              {shells.map((s) => (
                <option key={s.path} value={s.path}>
                  {s.name} ({s.path})
                </option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div style={sectionStyle}>
            <div style={labelStyle}>Terminal Font Size</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => handleFontSize(settings.font_size - 1)}
                style={{
                  background: "#292e42",
                  border: "none",
                  color: "#c0caf5",
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                -
              </button>
              <span
                style={{
                  color: "#c0caf5",
                  fontSize: 14,
                  minWidth: 30,
                  textAlign: "center",
                }}
              >
                {settings.font_size}
              </span>
              <button
                onClick={() => handleFontSize(settings.font_size + 1)}
                style={{
                  background: "#292e42",
                  border: "none",
                  color: "#c0caf5",
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Commands */}
          <div style={{ ...sectionStyle, borderBottom: "none" }}>
            <div style={labelStyle}>Quick Commands</div>
            {settings.quick_commands.map((cmd) => (
              <div
                key={cmd.id}
                style={{
                  background: "#13141b",
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                {editingCmd === cmd.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Label"
                      style={{
                        background: "#1f2335",
                        border: "1px solid #292e42",
                        borderRadius: 4,
                        color: "#c0caf5",
                        padding: "4px 8px",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                    <input
                      value={editCommand}
                      onChange={(e) => setEditCommand(e.target.value)}
                      placeholder="Command"
                      style={{
                        background: "#1f2335",
                        border: "1px solid #292e42",
                        borderRadius: 4,
                        color: "#c0caf5",
                        padding: "4px 8px",
                        fontSize: 13,
                        fontFamily: "monospace",
                        outline: "none",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={saveEditCmd}
                        style={{
                          background: "#7aa2f7",
                          color: "#1a1b26",
                          border: "none",
                          borderRadius: 4,
                          padding: "4px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingCmd(null)}
                        style={{
                          background: "#292e42",
                          color: "#c0caf5",
                          border: "none",
                          borderRadius: 4,
                          padding: "4px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ color: "#c0caf5", fontSize: 13 }}>
                        {cmd.label}
                      </div>
                      <div
                        style={{
                          color: "#565f89",
                          fontSize: 11,
                          fontFamily: "monospace",
                        }}
                      >
                        $ {cmd.command}
                      </div>
                    </div>
                    <button
                      onClick={() => startEditCmd(cmd)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#565f89",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: "2px 8px",
                      }}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
