import { useEffect, useMemo, useState } from "react";
// Selectors below subscribe to the Map (stable ref between mutations) and
// derive arrays inside useMemo. Returning Array.from(...) directly from a
// Zustand selector creates a new array on every render and tips React's
// useSyncExternalStore into an infinite re-render loop.
import { useTranslation } from "react-i18next";
import { useCloneStore } from "../../store/cloneStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useDialogStore } from "../../store/dialogStore";
import { clonesForkSession } from "../../services/tauriCommands";
import { toast } from "../../store/toastStore";
import type { Clone } from "../../types/clone";
import { TERMINAL_ROLES } from "../../utils/terminalRoles";
import type { TerminalRole } from "../../types/terminal";

interface TreeNode {
  clone: Clone;
  children: TreeNode[];
  depth: number;
}

function buildTree(clones: Clone[]): TreeNode[] {
  const byId = new Map<string, Clone>();
  for (const c of clones) byId.set(c.id, c);
  const childrenOf = new Map<string | null, Clone[]>();
  for (const c of clones) {
    const k = c.parent_clone_id && byId.has(c.parent_clone_id) ? c.parent_clone_id : null;
    const arr = childrenOf.get(k) ?? [];
    arr.push(c);
    childrenOf.set(k, arr);
  }
  const sortFn = (a: Clone, b: Clone) =>
    (b.last_used_at || b.created_at) - (a.last_used_at || a.created_at);
  const walk = (parentId: string | null, depth: number): TreeNode[] => {
    const list = (childrenOf.get(parentId) ?? []).sort(sortFn);
    return list.map((c) => ({
      clone: c,
      depth,
      children: walk(c.id, depth + 1),
    }));
  };
  return walk(null, 0);
}

function relTime(secs: number | null | undefined): string {
  if (!secs) return "never";
  const diff = Math.max(0, Date.now() / 1000 - secs);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ClonesDrawer() {
  const { t } = useTranslation();
  const drawerOpen = useCloneStore((s) => s.drawerOpen);
  const closeDrawer = useCloneStore((s) => s.closeDrawer);
  const clonesMap = useCloneStore((s) => s.clones);
  const clones = useMemo(() => Array.from(clonesMap.values()), [clonesMap]);
  const validation = useCloneStore((s) => s.validation);
  const validateClone = useCloneStore((s) => s.validateClone);
  const removeClone = useCloneStore((s) => s.removeClone);
  const { spawn } = useTerminal();
  const closeTerminalCreate = useDialogStore((s) => s.closeTerminalCreate);

  const [filterText, setFilterText] = useState("");

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return clones;
    return clones.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [clones, filterText]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Lazy validate: when drawer opens, check each clone once.
  useEffect(() => {
    if (!drawerOpen) return;
    for (const c of clones) {
      if (!validation.has(c.id)) {
        void validateClone(c.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, clones.length]);

  if (!drawerOpen) return null;

  const handleSpawn = async (c: Clone) => {
    let forked: string;
    try {
      forked = await clonesForkSession(c.id);
    } catch (e) {
      toast(`Failed to fork clone session: ${e}`, "error");
      return;
    }
    spawn({
      command: `claude --dangerously-skip-permissions -r ${forked}`,
      name: c.name,
      role: (c.role_hint as TerminalRole | undefined) ?? undefined,
    });
    closeTerminalCreate();
    closeDrawer();
  };

  const handleRemove = async (c: Clone) => {
    if (!confirm(t("clone.removeConfirm", `Remove clone "${c.name}"?`))) return;
    await removeClone(c.id);
  };

  const flat: TreeNode[] = [];
  const flatten = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      flat.push(n);
      flatten(n.children);
    }
  };
  flatten(tree);

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        background: "var(--color-bg-alt)",
        borderLeft: "1px solid var(--color-border)",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
          {t("clone.libraryTitle", "Clone library")}
        </span>
        <button
          onClick={closeDrawer}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            fontSize: 16,
            padding: "0 4px",
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--color-border)" }}>
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={t("clone.search", "Search by name / tag / description")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            color: "var(--color-text)",
            padding: "5px 8px",
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {flat.length === 0 ? (
          <div
            style={{
              color: "var(--color-text-muted)",
              fontSize: 12,
              textAlign: "center",
              padding: "32px 16px",
            }}
          >
            {clones.length === 0
              ? t(
                  "clone.empty",
                  "No clones saved. Click ⎘ on a claude terminal's title bar to capture its session."
                )
              : t("clone.noMatches", "No clones match the filter")}
          </div>
        ) : (
          flat.map((node) => (
            <CloneRow
              key={node.clone.id}
              clone={node.clone}
              depth={node.depth}
              valid={validation.get(node.clone.id)?.valid}
              onSpawn={() => handleSpawn(node.clone)}
              onRemove={() => handleRemove(node.clone)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface RowProps {
  clone: Clone;
  depth: number;
  valid: boolean | undefined;
  onSpawn: () => void;
  onRemove: () => void;
}

function CloneRow({ clone, depth, valid, onSpawn, onRemove }: RowProps) {
  const [hover, setHover] = useState(false);
  const roleMeta = clone.role_hint ? TERMINAL_ROLES[clone.role_hint] : undefined;
  const dot =
    valid === undefined
      ? "var(--color-text-muted)"
      : valid
        ? "var(--color-success)"
        : "var(--color-danger)";
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "8px 14px",
        paddingLeft: 14 + depth * 16,
        borderBottom: "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
        background: hover ? "var(--color-surface)" : "transparent",
        position: "relative",
      }}
    >
      {depth > 0 && (
        <span
          style={{
            position: "absolute",
            left: 14 + (depth - 1) * 16 + 6,
            top: 12,
            color: "var(--color-text-muted)",
            fontSize: 10,
          }}
        >
          ↳
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          title={
            valid === undefined
              ? "checking session"
              : valid
                ? "session is alive"
                : "session file missing"
          }
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dot,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            color: "var(--color-text)",
            fontSize: 12,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {clone.name}
        </span>
        {roleMeta && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              color: roleMeta.color,
              background: `color-mix(in srgb, ${roleMeta.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${roleMeta.color} 30%, transparent)`,
              flexShrink: 0,
            }}
          >
            {roleMeta.label}
          </span>
        )}
      </div>
      {clone.description && (
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: 11,
            marginTop: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {clone.description}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 4,
          alignItems: "center",
          fontSize: 10,
          color: "var(--color-text-muted)",
        }}
      >
        <span>{clone.fork_count} fork{clone.fork_count === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>{clone.last_used_at ? `used ${relTime(clone.last_used_at)}` : "never used"}</span>
        {clone.tags.length > 0 && (
          <>
            <span>·</span>
            {clone.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontFamily: "monospace",
                  background: "var(--color-bg)",
                  padding: "1px 4px",
                  borderRadius: 2,
                }}
              >
                {tag}
              </span>
            ))}
          </>
        )}
      </div>
      {hover && (
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <button
            onClick={onSpawn}
            disabled={valid === false}
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg-alt)",
              border: "none",
              borderRadius: 3,
              padding: "3px 10px",
              fontSize: 10,
              fontWeight: 600,
              cursor: valid === false ? "not-allowed" : "pointer",
              opacity: valid === false ? 0.4 : 1,
            }}
          >
            Spawn
          </button>
          <button
            onClick={onRemove}
            style={{
              background: "transparent",
              color: "var(--color-danger)",
              border: "1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)",
              borderRadius: 3,
              padding: "3px 10px",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
