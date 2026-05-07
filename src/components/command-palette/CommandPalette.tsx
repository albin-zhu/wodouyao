import { useState, useRef, useEffect } from "react";
import { useCommandStore } from "../../store/commandStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useTerminalStore } from "../../store/terminalStore";
import { useNoteStore } from "../../store/noteStore";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useTaskBoardStore } from "../../store/taskBoardStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useSettingsStore } from "../../store/settingsStore";
import { fuzzyMatch } from "../../utils/fuzzyMatch";
import { TITLE_BAR_HEIGHT } from "../../utils/constants";

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
  const bringToFront = useTerminalStore((s) => s.bringToFront);
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const unfoldTerminal = useTerminalStore((s) => s.unfoldTerminal);
  const notesMap = useNoteStore((s) => s.notes);
  const fileNodesMap = useFileNodeStore((s) => s.fileNodes);
  const boardsMap = useTaskBoardStore((s) => s.boards);
  const { buildWorkspace, applyWorkspace } = useWorkspace();
  const { saveCurrentWorkspace, loadWorkspaceById, workspaces } = useWorkspaceStore();
  const openDrawer = useSettingsStore((s) => s.openDrawer);

  const panToCenter = (
    position: { x: number; y: number },
    size: { width: number; height: number },
  ) => {
    const { zoom, setPan } = useCanvasStore.getState();
    const cx = position.x + size.width / 2;
    const cy = position.y + size.height / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight - TITLE_BAR_HEIGHT;
    setPan(vw / 2 - cx * zoom, TITLE_BAR_HEIGHT + vh / 2 - cy * zoom);
  };

  const focusTerminal = (id: string) => {
    const term = useTerminalStore.getState().terminals.get(id);
    if (!term) return;
    if (term.isFolded) unfoldTerminal(id);
    bringToFront(id);
    panToCenter(term.position, term.size);
  };
  const focusNote = (id: string) => {
    const n = useNoteStore.getState().notes.get(id);
    if (n) panToCenter(n.position, n.size);
  };
  const focusFileNode = (id: string) => {
    const f = useFileNodeStore.getState().fileNodes.get(id);
    if (f) panToCenter(f.position, f.size);
  };
  const focusBoard = (id: string) => {
    const b = useTaskBoardStore.getState().boards.get(id);
    if (b) panToCenter(b.position, b.size);
  };

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

  // Node focus entries (terminals, notes, file nodes, task boards) are
  // injected into results only when the query matches their label —
  // we don't list every node by default to keep the palette tidy.
  type Hit = { item: CommandItem; score: number };
  const hits: Hit[] = [];
  if (query) {
    for (const t of terminalsMap.values()) {
      const m = fuzzyMatch(query, t.name);
      if (m.match) {
        hits.push({
          score: m.score,
          item: {
            id: `focus-term-${t.id}`,
            label: t.name,
            description: `Focus terminal · ${t.shellType}${
              t.initialCommand ? ` · ${t.initialCommand}` : ""
            }`,
            execute: () => focusTerminal(t.id),
          },
        });
      }
    }
    for (const n of notesMap.values()) {
      const firstLine = (n.text ?? "").split("\n")[0]?.trim() ?? "";
      const label = firstLine || "(empty note)";
      const m = fuzzyMatch(query, label);
      if (m.match) {
        hits.push({
          score: m.score,
          item: {
            id: `focus-note-${n.id}`,
            label,
            description: "Focus note",
            execute: () => focusNote(n.id),
          },
        });
      }
    }
    for (const f of fileNodesMap.values()) {
      const m = fuzzyMatch(query, f.name);
      if (m.match) {
        hits.push({
          score: m.score,
          item: {
            id: `focus-file-${f.id}`,
            label: f.name,
            description: "Focus file node",
            execute: () => focusFileNode(f.id),
          },
        });
      }
    }
    for (const b of boardsMap.values()) {
      const m = fuzzyMatch(query, "task board");
      if (m.match) {
        hits.push({
          score: m.score,
          item: {
            id: `focus-board-${b.id}`,
            label: "Task board",
            description: "Focus task board",
            execute: () => focusBoard(b.id),
          },
        });
      }
    }
  }
  const nodeMatches = hits.sort((a, b) => b.score - a.score).map((h) => h.item);

  const filtered = query
    ? [
        ...commands
          .map((cmd) => {
            const byLabel = fuzzyMatch(query, cmd.label);
            const byDesc  = fuzzyMatch(query, cmd.description);
            const match   = byLabel.match || byDesc.match;
            const score   = Math.max(byLabel.score, byDesc.score);
            return { cmd, score, match };
          })
          .filter((r) => r.match)
          .sort((a, b) => b.score - a.score)
          .map((r) => r.cmd),
        ...nodeMatches,
      ]
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
          background: "var(--overlay-backdrop)",
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
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-dropdown)",
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
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              color: "var(--color-text)",
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
                background: i === selectedIndex ? "var(--color-surface-alt)" : "transparent",
                borderLeft: i === selectedIndex ? "2px solid var(--color-accent)" : "2px solid transparent",
              }}
            >
              <div style={{ color: "var(--color-text)", fontSize: 14 }}>{cmd.label}</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{cmd.description}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
            fontSize: 11,
          }}
        >
          Ctrl+K to toggle
        </div>
      </div>
    </>
  );
}
