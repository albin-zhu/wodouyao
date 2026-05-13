import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TerminalNode } from "../../types/terminal";
import { useCloneStore } from "../../store/cloneStore";
import { ROLE_ORDER, TERMINAL_ROLES } from "../../utils/terminalRoles";
import { toast } from "../../store/toastStore";

interface Props {
  terminal: TerminalNode;
  onClose: () => void;
}

/** Modal dialog for capturing the metadata to attach to a clone snapshot.
 *  Triggered by the title-bar 💾 button on agent terminals. The terminal
 *  must already have a session_id (claude SessionStart hook fired). */
export default function SaveCloneDialog({ terminal, onClose }: Props) {
  const { t } = useTranslation();
  const createClone = useCloneStore((s) => s.createClone);
  const clonesMap = useCloneStore((s) => s.clones);
  const existingClones = useMemo(() => Array.from(clonesMap.values()), [clonesMap]);
  const [name, setName] = useState(terminal.name || "");
  const [description, setDescription] = useState("");
  const [roleHint, setRoleHint] = useState<string>(terminal.role ?? "");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // If this terminal was itself spawned from a clone, link the new clone's
  // parent for the inheritance tree. We approximate by matching the
  // terminal's session_id against any existing clone — if it matches, the
  // user is "saving a refined version" of that clone.
  const parentClone = existingClones.find((c) => c.session_id === terminal.sessionId);

  const submit = async () => {
    if (!name.trim()) return;
    if (!terminal.sessionId) {
      toast(t("clone.noSession", "Terminal has no session yet — start it first."), "error");
      return;
    }
    setSubmitting(true);
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const created = await createClone({
      name: name.trim(),
      description: description.trim(),
      session_id: terminal.sessionId,
      agent_kind: terminal.agentKind ?? "claude",
      role_hint: roleHint || null,
      parent_clone_id: parentClone?.id ?? null,
      tags,
    });
    setSubmitting(false);
    if (created) {
      toast(t("clone.saved", `Saved clone "${created.name}"`), "success");
      onClose();
    } else {
      toast(t("clone.saveFailed", "Failed to save clone"), "error");
    }
  };

  // Portal to <body>: TerminalTitleBar lives inside the canvas's transformed
  // layer, which breaks `position: fixed` (CSS contains it to the transformed
  // ancestor, so the dialog scales/translates with zoom/pan instead of
  // pinning to the viewport). Rendering into <body> escapes that.
  return createPortal(
    <div
      onClick={onClose}
      // Stop React synthetic mousedown bubbling: we're portal'd to <body>
      // but React still propagates through the component tree (TerminalTitleBar
      // → TerminalNode → … → InfiniteCanvas), and InfiniteCanvas's
      // select-mode pan handler preventDefaults on non-(.terminal-node|button)
      // targets — which would eat the browser's "mousedown focuses input"
      // default and break our text fields.
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-alt)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: 20,
          width: 460,
          maxWidth: "92vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: 4,
          }}
        >
          {t("clone.saveAs", "Save as clone")}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 14 }}>
          {t(
            "clone.saveHint",
            "Capture this agent's session as a reusable snapshot. Spawning from it later will resume from this exact point."
          )}
        </div>

        {parentClone && (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-info)",
              background: "color-mix(in srgb, var(--color-info) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-info) 25%, transparent)",
              borderRadius: 4,
              padding: "5px 8px",
              marginBottom: 12,
            }}
          >
            ↳ {t("clone.inheritsFrom", "inherits from")} <b>{parentClone.name}</b>
          </div>
        )}

        <Field label={t("clone.name", "Name")}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="frontend-knower"
            style={inputStyle}
          />
        </Field>

        <Field label={t("clone.description", "Description")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t(
              "clone.descPlaceholder",
              "What does this clone already know about this project?"
            )}
            style={{ ...inputStyle, resize: "vertical", minHeight: 50 }}
          />
        </Field>

        <Field label={t("clone.roleHint", "Role hint")}>
          <select
            value={roleHint}
            onChange={(e) => setRoleHint(e.target.value)}
            style={inputStyle}
          >
            <option value="">{t("clone.noRoleHint", "(none)")}</option>
            {ROLE_ORDER.filter((k) => TERMINAL_ROLES[k]).map((k) => {
              const meta = TERMINAL_ROLES[k];
              return (
                <option key={k} value={k}>
                  {meta.label} — {meta.hint}
                </option>
              );
            })}
          </select>
        </Field>

        <Field
          label={t("clone.tags", "Tags")}
          help={t("clone.tagsHint", "comma-separated, e.g. frontend, react")}
        >
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="frontend, react"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={onClose}
            style={{
              background: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim() || !terminal.sessionId}
            style={{
              background: "var(--color-accent)",
              color: "var(--color-bg-alt)",
              border: "none",
              borderRadius: 4,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting || !name.trim() || !terminal.sessionId ? 0.5 : 1,
            }}
          >
            {submitting ? "…" : t("clone.save", "Save")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  color: "var(--color-text)",
  padding: "6px 10px",
  fontSize: 12,
  outline: "none",
  fontFamily: "inherit",
};

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          color: "var(--color-text-muted)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
      {help && (
        <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 3 }}>{help}</div>
      )}
    </div>
  );
}
