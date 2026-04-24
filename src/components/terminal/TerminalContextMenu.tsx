import { useState, useEffect, useCallback, useRef } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useWireStore } from "../../store/wireStore";
import { getXterm, readTerminalBuffer } from "../../services/terminalRegistry";
import { ACCENT_COLORS } from "../../utils/terminalThemes";
import type { TerminalNode } from "../../types/terminal";

interface ContextMenuState {
  x: number;
  y: number;
  terminal: TerminalNode;
}

let globalSetMenu: ((state: ContextMenuState | null) => void) | null = null;

export function showTerminalContextMenu(
  x: number,
  y: number,
  terminal: TerminalNode
) {
  globalSetMenu?.({ x, y, terminal });
}

export default function TerminalContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [showColors, setShowColors] = useState(false);
  const [showWireTargets, setShowWireTargets] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const updateTerminal = useTerminalStore((s) => s.updateTerminal);
  const foldTerminal = useTerminalStore((s) => s.foldTerminal);
  const unfoldTerminal = useTerminalStore((s) => s.unfoldTerminal);
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const { kill } = useTerminal();
  const addWire = useWireStore((s) => s.addWire);
  const getWiresForTerminal = useWireStore((s) => s.getWiresForTerminal);

  useEffect(() => {
    globalSetMenu = setMenu;
    return () => {
      globalSetMenu = null;
    };
  }, []);

  // Close on outside click or escape
  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menu]);

  useEffect(() => {
    if (renaming) {
      setTimeout(() => renameRef.current?.focus(), 50);
    }
  }, [renaming]);

  const close = useCallback(() => {
    setMenu(null);
    setRenaming(false);
    setShowColors(false);
    setShowWireTargets(false);
  }, []);

  if (!menu) return null;

  const { terminal } = menu;

  // Get other terminals for wire targets
  const otherTerminals = Array.from(terminalsMap.values()).filter(
    (t) => t.id !== terminal.id
  );
  const existingWires = getWiresForTerminal(terminal.id);
  const connectedIds = new Set(
    existingWires.flatMap((w) => [w.sourceId, w.targetId])
  );

  const term = getXterm(terminal.id);
  const hasSelection = term?.hasSelection() ?? false;

  const handleCopySelected = () => {
    const selection = term?.getSelection() ?? "";
    if (selection) {
      navigator.clipboard.writeText(selection).catch(console.error);
    }
    close();
  };

  const handleCopyBuffer = () => {
    const content = readTerminalBuffer(terminal.id);
    navigator.clipboard.writeText(content).catch(console.error);
    close();
  };

  const handleStartWireDrag = () => {
    setMode("wire");
    setWireStart(terminal.id);
    close();
  };

  const handleConnectTo = (targetId: string) => {
    addWire(terminal.id, targetId);
    close();
  };

  const handleRename = () => {
    if (renameName.trim()) {
      updateTerminal(terminal.id, { name: renameName.trim() });
    }
    setRenaming(false);
    close();
  };

  const handleFold = () => {
    if (terminal.isFolded) {
      unfoldTerminal(terminal.id);
    } else {
      foldTerminal(terminal.id);
    }
    close();
  };

  const handleClose = () => {
    kill(terminal.id);
    close();
  };

  const handleColorChange = (hex: string) => {
    updateTerminal(terminal.id, { color: hex });
    setShowColors(false);
    close();
  };

  // Adjust position to stay within viewport
  const menuX = Math.min(menu.x, window.innerWidth - 200);
  const menuY = Math.min(menu.y, window.innerHeight - 350);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: menuX,
        top: menuY,
        zIndex: 10000,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        boxShadow: "var(--shadow-dropdown)",
        minWidth: 180,
        padding: "4px 0",
        userSelect: "none",
      }}
    >
      {/* Header: terminal name + color dot */}
      <div
        style={{
          padding: "8px 12px 6px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: terminal.color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color: "var(--color-text)",
            fontSize: 12,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {terminal.name}
        </span>
      </div>

      {/* Wire: Connect → submenu or drag */}
      {!showWireTargets ? (
        <MenuItem
          label="Connect Wire..."
          shortcut={`${otherTerminals.length}`}
          onClick={() => {
            if (otherTerminals.length <= 5) {
              setShowWireTargets(true);
            } else {
              handleStartWireDrag();
            }
          }}
        />
      ) : (
        <div style={{ padding: "2px 0" }}>
          <div
            style={{
              padding: "4px 12px",
              color: "var(--color-text-muted)",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Connect to:
          </div>
          {otherTerminals.map((t) => {
            const alreadyConnected = connectedIds.has(t.id);
            return (
              <MenuItem
                key={t.id}
                label={t.name}
                disabled={alreadyConnected}
                onClick={() => handleConnectTo(t.id)}
                icon={
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: t.color,
                      display: "inline-block",
                    }}
                  />
                }
              />
            );
          })}
          <MenuItem label="Drag to connect..." onClick={handleStartWireDrag} />
          <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />
        </div>
      )}

      {/* Copy Selected */}
      <MenuItem
        label="Copy Selected"
        disabled={!hasSelection}
        onClick={handleCopySelected}
      />

      {/* Copy Buffer */}
      <MenuItem label="Copy Buffer" onClick={handleCopyBuffer} />

      <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />

      {/* Rename */}
      {!renaming ? (
        <MenuItem
          label="Rename"
          onClick={() => {
            setRenameName(terminal.name);
            setRenaming(true);
          }}
        />
      ) : (
        <div style={{ padding: "4px 12px" }}>
          <input
            ref={renameRef}
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setRenaming(false);
              }
              e.stopPropagation();
            }}
            style={{
              width: "100%",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              color: "var(--color-text)",
              padding: "4px 8px",
              fontSize: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Color */}
      {!showColors ? (
        <MenuItem
          label="Change Color"
          icon={
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: terminal.color,
                display: "inline-block",
              }}
            />
          }
          onClick={() => setShowColors(true)}
        />
      ) : (
        <div style={{ padding: "6px 12px", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.hex}
              title={c.name}
              onClick={() => handleColorChange(c.hex)}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: c.hex,
                border:
                  terminal.color === c.hex
                    ? "2px solid #fff"
                    : "2px solid transparent",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />

      {/* Fold/Unfold */}
      <MenuItem
        label={terminal.isFolded ? "Unfold" : "Fold"}
        onClick={handleFold}
      />

      {/* Close */}
      <MenuItem label="Close" danger onClick={handleClose} />
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  shortcut,
  danger,
  disabled,
  icon,
}: {
  label: string;
  onClick?: () => void;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 12px",
        background: "none",
        border: "none",
        color: disabled ? "var(--color-border-strong)" : danger ? "var(--color-danger)" : "var(--color-text)",
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.target as HTMLElement).style.background = "var(--color-surface-alt)";
        }
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLElement).style.background = "none";
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{ color: "var(--color-text-muted)", fontSize: 10 }}>{shortcut}</span>
      )}
    </button>
  );
}
