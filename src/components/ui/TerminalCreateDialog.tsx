import { useState, useEffect, useRef } from "react";
import { useDialogStore } from "../../store/dialogStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { listAvailableShells, detectCliAgents } from "../../services/tauriCommands";
import type { CliAgent } from "../../services/tauriCommands";
import { ACCENT_COLORS, TERMINAL_THEMES } from "../../utils/terminalThemes";
import type { TerminalTheme, ShellInfo } from "../../types/terminal";

// Fields that persist between dialog opens (remembered from last Create).
// Name/command/cwd vary per terminal, so they're explicitly NOT carried over.
const PREFS_KEY = "wodouyao.terminalCreatePrefs";
interface DialogPrefs {
  color?: string;
  theme?: TerminalTheme;
  shell?: string;
  fastStart?: boolean;
}
function loadPrefs(): DialogPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function savePrefs(prefs: DialogPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / disabled storage — best effort */
  }
}

export default function TerminalCreateDialog() {
  const { terminalCreateOpen, terminalCreateDefaults, closeTerminalCreate } =
    useDialogStore();
  const { spawn } = useTerminal();
  const workspaceCwd = useWorkspaceStore((s) => s.currentWorkspaceCwd);

  const [name, setName] = useState("");
  const [color, setColor] = useState(ACCENT_COLORS[0].hex);
  const [theme, setTheme] = useState<TerminalTheme>("tokyonight");
  const [shell, setShell] = useState("");
  const [cwd, setCwd] = useState("");
  const [command, setCommand] = useState("");
  const [fastStart, setFastStart] = useState(true);
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [agents, setAgents] = useState<CliAgent[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (terminalCreateOpen) {
      listAvailableShells().then(setShells).catch(() => {});
      detectCliAgents().then(setAgents).catch(() => {});
      // Restore remembered color/theme/shell/fastStart, explicit dialog
      // defaults still win.
      const prefs = loadPrefs();
      setName(terminalCreateDefaults?.name ?? "");
      setColor(
        terminalCreateDefaults?.color ?? prefs.color ?? ACCENT_COLORS[0].hex
      );
      setTheme(terminalCreateDefaults?.theme ?? prefs.theme ?? "tokyonight");
      setShell(terminalCreateDefaults?.shell ?? prefs.shell ?? "");
      setCwd(terminalCreateDefaults?.cwd ?? workspaceCwd ?? "");
      setCommand(terminalCreateDefaults?.command ?? "");
      setFastStart(prefs.fastStart ?? true);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [terminalCreateOpen, terminalCreateDefaults, workspaceCwd]);

  if (!terminalCreateOpen) return null;

  const handleCreate = () => {
    savePrefs({ color, theme, shell, fastStart });
    spawn({
      name: name || undefined,
      color,
      theme,
      shell: shell || undefined,
      cwd: cwd || undefined,
      command: command || undefined,
      fastStart,
      position: terminalCreateDefaults?.position,
      size: terminalCreateDefaults?.size,
    });
    closeTerminalCreate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
    if (e.key === "Escape") {
      closeTerminalCreate();
    }
  };

  const themeNames = Object.keys(TERMINAL_THEMES) as TerminalTheme[];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeTerminalCreate();
      }}
    >
      <div
        onKeyDown={handleKeyDown}
        style={{
          background: "#1f2335",
          border: "1px solid #292e42",
          borderRadius: 12,
          padding: 24,
          width: 420,
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        <h3
          style={{
            margin: "0 0 20px 0",
            color: "#c0caf5",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          New Terminal
        </h3>

        {/* Quick-start agent buttons */}
        {agents.some((a) => a.available) && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Quick Start</label>
            <div style={{ display: "flex", gap: 6 }}>
              {agents
                .filter((a) => a.available)
                .map((a) => (
                  <button
                    key={a.name}
                    onClick={() => {
                      spawn({
                        command: a.name,
                        name: a.name.charAt(0).toUpperCase() + a.name.slice(1),
                        color:
                          a.name === "claude"
                            ? "#ff9e64"
                            : a.name === "codex"
                              ? "#9ece6a"
                              : "#7dcfff",
                        position: terminalCreateDefaults?.position,
                        size: terminalCreateDefaults?.size,
                      });
                      closeTerminalCreate();
                    }}
                    style={{
                      background: "#292e42",
                      color: "#c0caf5",
                      border: "1px solid #3b4261",
                      borderRadius: 6,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {a.name.charAt(0).toUpperCase() + a.name.slice(1)}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Name */}
        <label style={labelStyle}>Name</label>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Auto-generated"
          style={inputStyle}
        />

        {/* Color */}
        <label style={labelStyle}>Color</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.hex}
              title={c.name}
              onClick={() => setColor(c.hex)}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: c.hex,
                border:
                  color === c.hex ? "2px solid #fff" : "2px solid transparent",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>

        {/* Theme */}
        <label style={labelStyle}>Theme</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {themeNames.map((t) => {
            const bg = TERMINAL_THEMES[t].background ?? "#1a1b26";
            const fg = TERMINAL_THEMES[t].foreground ?? "#a9b1d6";
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  background: bg,
                  color: fg,
                  border:
                    theme === t
                      ? "2px solid #7aa2f7"
                      : "1px solid #3b4261",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: theme === t ? 600 : 400,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Shell */}
        <label style={labelStyle}>Shell</label>
        <select
          value={shell}
          onChange={(e) => setShell(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">Default</option>
          {shells.map((s) => (
            <option key={s.path} value={s.path}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Working Directory */}
        <label style={labelStyle}>Working Directory</label>
        <input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder={workspaceCwd ?? "System default"}
          style={inputStyle}
        />

        {/* Initial Command */}
        <label style={labelStyle}>Initial Command</label>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Optional command to run on start"
          style={inputStyle}
        />

        <label
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            marginTop: 6,
          }}
        >
          <input
            type="checkbox"
            checked={fastStart}
            onChange={(e) => setFastStart(e.target.checked)}
            style={{ margin: 0 }}
          />
          <span>Fast startup (skip shell rc)</span>
        </label>
        <div style={{ color: "#565f89", fontSize: 11, marginTop: -4 }}>
          Shell opens instantly but loses your PATH / aliases / prompt.
        </div>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 20,
          }}
        >
          <button onClick={closeTerminalCreate} style={cancelBtnStyle}>
            Cancel
          </button>
          <button onClick={handleCreate} style={createBtnStyle}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#565f89",
  fontSize: 12,
  marginBottom: 4,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#13141b",
  border: "1px solid #292e42",
  borderRadius: 6,
  padding: "8px 10px",
  color: "#c0caf5",
  fontSize: 13,
  marginBottom: 14,
  outline: "none",
  boxSizing: "border-box",
};

const cancelBtnStyle: React.CSSProperties = {
  background: "#292e42",
  color: "#c0caf5",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  cursor: "pointer",
};

const createBtnStyle: React.CSSProperties = {
  background: "#7aa2f7",
  color: "#1a1b26",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
