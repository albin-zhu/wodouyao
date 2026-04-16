import { useState, useRef, useEffect } from "react";
import { useCommandStore } from "../../store/commandStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useTerminalStore } from "../../store/terminalStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useSettingsStore } from "../../store/settingsStore";
import { fuzzyMatch } from "../../utils/fuzzyMatch";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  execute: (args?: string) => void;
}

export default function CommandPalette() {
  const { paletteOpen, closePalette } = useCommandStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { spawn } = useTerminal();
  const foldAll = useTerminalStore((s) => s.foldAll);
  const unfoldAll = useTerminalStore((s) => s.unfoldAll);
  const { buildWorkspace, applyWorkspace } = useWorkspace();
  const { saveCurrentWorkspace, loadWorkspaceById, workspaces } = useWorkspaceStore();
  const openDrawer = useSettingsStore((s) => s.openDrawer);

  const commands: CommandItem[] = [
    {
      id: "spawn",
      label: "New Terminal",
      description: "Create a new terminal window",
      execute: (args) => spawn(args ? { command: args } : undefined),
    },
    {
      id: "spawn-with-cmd",
      label: "Run Command",
      description: "Create terminal and run a command",
      execute: (args) => {
        if (args) spawn({ command: args, name: `Run: ${args}` });
      },
    },
    {
      id: "fold-all",
      label: "Fold All",
      description: "Collapse all terminal windows",
      execute: () => foldAll(),
    },
    {
      id: "unfold-all",
      label: "Unfold All",
      description: "Expand all terminal windows",
      execute: () => unfoldAll(),
    },
    {
      id: "save-workspace",
      label: "Save Workspace",
      description: "Save current layout as workspace",
      execute: (args) => saveCurrentWorkspace(args, buildWorkspace),
    },
    {
      id: "settings",
      label: "Settings",
      description: "Open settings drawer",
      execute: () => openDrawer(),
    },
    // Dynamic workspace switch commands
    ...workspaces.map((ws) => ({
      id: `switch-ws-${ws.id}`,
      label: `Switch: ${ws.name}`,
      description: `Switch to workspace "${ws.name}" (${ws.terminal_count} terminals)`,
      execute: () => loadWorkspaceById(ws.id, applyWorkspace),
    })),
  ];

  const filtered = query
    ? commands
        .map((cmd) => ({
          cmd,
          score: Math.max(
            fuzzyMatch(query, cmd.label).score,
            fuzzyMatch(query, cmd.description).score
          ),
          match:
            fuzzyMatch(query, cmd.label).match ||
            fuzzyMatch(query, cmd.description).match,
        }))
        .filter((r) => r.match)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.cmd)
    : commands;

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [paletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!paletteOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closePalette();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        // Extract args after the command name
        const parts = query.split(" ");
        const args = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
        filtered[selectedIndex].execute(args);
        closePalette();
      }
    }
  };

  return (
    <>
      <div
        onClick={closePalette}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0,0,0,0.4)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 500,
          zIndex: 9999,
          background: "#1f2335",
          borderRadius: 12,
          border: "1px solid #292e42",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 12 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#13141b",
              border: "1px solid #292e42",
              borderRadius: 8,
              color: "#c0caf5",
              fontSize: 14,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onClick={() => {
                const parts = query.split(" ");
                const args = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
                cmd.execute(args);
                closePalette();
              }}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                background: i === selectedIndex ? "#292e42" : "transparent",
                borderLeft: i === selectedIndex ? "2px solid #7aa2f7" : "2px solid transparent",
              }}
            >
              <div style={{ color: "#c0caf5", fontSize: 14 }}>{cmd.label}</div>
              <div style={{ color: "#565f89", fontSize: 12 }}>{cmd.description}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #292e42",
            color: "#565f89",
            fontSize: 11,
          }}
        >
          Ctrl+K to toggle
        </div>
      </div>
    </>
  );
}
