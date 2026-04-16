import { useTerminalStore } from "../../store/terminalStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useSettingsStore } from "../../store/settingsStore";
import { useCanvasInteractionStore, type CanvasMode } from "../../store/canvasInteractionStore";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const MODE_BUTTONS: { mode: CanvasMode; label: string; title: string }[] = [
  { mode: "select", label: "\u2190", title: "Select (move/resize terminals)" },
  { mode: "draw", label: "\u25AD", title: "Draw (drag to create terminal)" },
  { mode: "wire", label: "\u2014", title: "Wire (connect terminals)" },
];

export default function Toolbar() {
  const terminalCount = useTerminalStore((s) => s.terminals.size);
  const { spawn } = useTerminal();
  const settings = useSettingsStore((s) => s.settings);
  const openDrawer = useSettingsStore((s) => s.openDrawer);
  const currentMode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);

  const quickCommands = settings?.quick_commands ?? [];

  return (
    <div
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "#1f2335",
        borderBottom: "1px solid #292e42",
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#7aa2f7", fontWeight: 600, fontSize: 14 }}>TheMaestri</span>
        <WorkspaceSwitcher />
        <span style={{ color: "#565f89", fontSize: 12 }}>
          {terminalCount} terminal{terminalCount !== 1 ? "s" : ""}
        </span>

        {/* Mode toggle buttons */}
        <div
          style={{
            display: "flex",
            border: "1px solid #292e42",
            borderRadius: 6,
            overflow: "hidden",
            marginLeft: 4,
          }}
        >
          {MODE_BUTTONS.map((btn) => (
            <button
              key={btn.mode}
              onClick={() => setMode(btn.mode)}
              title={btn.title}
              style={{
                background: currentMode === btn.mode ? "#7aa2f7" : "#1f2335",
                color: currentMode === btn.mode ? "#1a1b26" : "#565f89",
                border: "none",
                padding: "4px 10px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                borderRight: "1px solid #292e42",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Quick Command Buttons */}
        {quickCommands.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => spawn(cmd.command, cmd.label)}
            title={cmd.label}
            style={{
              background: "#292e42",
              color: "#c0caf5",
              border: "1px solid #3b4261",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            {cmd.icon_label}
          </button>
        ))}

        <button
          onClick={() => spawn()}
          style={{
            background: "#7aa2f7",
            color: "#1a1b26",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Terminal
        </button>
        <span style={{ color: "#565f89", fontSize: 11 }}>
          Ctrl+K
        </span>

        {/* Settings gear button */}
        <button
          onClick={openDrawer}
          title="Settings"
          style={{
            background: "none",
            border: "none",
            color: "#565f89",
            cursor: "pointer",
            fontSize: 16,
            padding: "4px 6px",
            lineHeight: 1,
          }}
        >
          {"\u2699"}
        </button>
      </div>
    </div>
  );
}
