import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogStore } from "../../store/dialogStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { resolveRoles, ROLE_ORDER, type RoleMeta } from "../../utils/terminalRoles";
import { toast } from "../../store/toastStore";

interface BootstrapPayload {
  roles: { role: string; name?: string; kind?: string; append_system_prompt?: string }[];
  wire_mesh: boolean;
  cwd?: string;
}

const DEFAULT_PRESET: string[] = ["pm", "backend", "frontend"];

const PM_BUILTIN_PROMPT = `## You are the Project Manager

You coordinate this multi-agent workflow. You don't write code yourself —
you keep the team unblocked.

Responsibilities:
1. **Parse PRDs** — when a user sends a PRD note, expand it into a task
   tree using \`wodouyao task add\` for each item, with \`--blocked-by\`
   for ordering.
2. **Watch for stuck tasks** — if a task has been \`in_progress\` for too
   long without progress reports, ask the owner what's going on. If they
   don't respond, \`wodouyao task update <id>\` to unclaim it.
3. **Re-route work** — when an agent finishes a task and pulls the next
   one, you don't intervene; agents self-serve via \`task next --role X\`.
4. **Summarize status** — when the user asks "what's happening", give a
   one-screen rundown of the board.

Don't claim tasks yourself. Don't run commands the workers can run.`;

export default function BootstrapWorkflowDialog() {
  const { t } = useTranslation();
  const open = useDialogStore((s) => s.bootstrapWorkflowOpen);
  const close = useDialogStore((s) => s.closeBootstrapWorkflow);
  const settings = useSettingsStore((s) => s.settings);

  const allRoles = resolveRoles(
    settings?.custom_roles?.map((r) => ({
      label: r.label,
      color: r.color,
      glyph: r.glyph,
      hint: r.hint,
    })) as RoleMeta[] | undefined,
    settings?.custom_roles?.map((r) => r.key),
  );
  const orderedKeys = [
    ...ROLE_ORDER.filter((k) => k in allRoles),
    ...Object.keys(allRoles).filter((k) => !ROLE_ORDER.includes(k)),
  ];

  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_PRESET));
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const toggle = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) {
      toast(t("workflow.pickAtLeastOne", "Pick at least one role"), "warning");
      return;
    }
    setBusy(true);
    // Order matters — pm first if selected (becomes the wire star hub).
    const ordered = orderedKeys.filter((k) => selected.has(k));
    const cwd = useWorkspaceStore.getState().currentWorkspaceCwd ?? undefined;

    const pmPrompt =
      settings?.pm_prompt && settings.pm_prompt.trim().length > 0
        ? settings.pm_prompt
        : PM_BUILTIN_PROMPT;

    const payload: BootstrapPayload = {
      roles: ordered.map((role) => {
        const customPrompt = settings?.custom_roles?.find((r) => r.key === role)?.prompt;
        const append = role === "pm" ? pmPrompt : customPrompt;
        return {
          role,
          name: allRoles[role]?.label ?? role,
          kind: "claude",
          ...(append && append.trim() ? { append_system_prompt: append } : {}),
        };
      }),
      wire_mesh: ordered.length <= 4, // mesh small teams; star otherwise
      cwd,
    };

    try {
      const { call } = await import("../../services/transport");
      const data = await call<{ terminal_ids: string[] }>("bootstrap_workflow", {
        roles: payload.roles,
        wireMesh: payload.wire_mesh,
        cwd: payload.cwd,
      });
      toast(
        t("workflow.spawned", "Spawned {{n}} terminals", { n: data.terminal_ids.length }),
        "success",
        2500,
      );
      close();
    } catch (e) {
      console.error("[bootstrap] failed:", e);
      toast(t("workflow.failed", "Workflow bootstrap failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8999,
          background: "var(--overlay-backdrop)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          maxWidth: "92vw",
          maxHeight: "85vh",
          zIndex: 9000,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-panel)",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "var(--color-text)", fontSize: 14, fontWeight: 600 }}>
            ✨ {t("workflow.title", "Bootstrap workflow")}
          </span>
          <button
            onClick={close}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ color: "var(--color-text-muted)", fontSize: 11, lineHeight: 1.5 }}>
          {t(
            "workflow.hint",
            "Pick which roles to spawn. Each becomes a wired Claude terminal with a role-specific system prompt. PM (if selected) gets the orchestration prompt and runs first.",
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            overflowY: "auto",
            maxHeight: "55vh",
          }}
        >
          {orderedKeys.map((key) => {
            const meta = allRoles[key];
            const active = selected.has(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: `1px solid ${active ? meta.color : "var(--color-border)"}`,
                  background: active
                    ? `color-mix(in srgb, ${meta.color} 15%, transparent)`
                    : "var(--color-bg)",
                  cursor: "pointer",
                  textAlign: "left",
                  minHeight: 56,
                }}
                title={meta.hint}
              >
                <span
                  style={{
                    color: meta.color,
                    fontSize: 14,
                    lineHeight: 1.2,
                    width: 16,
                    flexShrink: 0,
                    textAlign: "center",
                    paddingTop: 2,
                  }}
                >
                  {meta.glyph}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--color-text)", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                    {meta.label}
                  </div>
                  <div
                    style={{
                      color: "var(--color-text-muted)",
                      fontSize: 10,
                      lineHeight: 1.4,
                      wordBreak: "break-word",
                    }}
                  >
                    {meta.hint}
                  </div>
                </div>
                <span style={{ color: meta.color, fontSize: 12, flexShrink: 0, paddingTop: 2 }}>
                  {active ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button
            onClick={close}
            disabled={busy}
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy || selected.size === 0}
            style={{
              background: "var(--color-accent)",
              border: "none",
              color: "var(--color-on-accent)",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: busy || selected.size === 0 ? "not-allowed" : "pointer",
              opacity: busy || selected.size === 0 ? 0.6 : 1,
            }}
          >
            {busy
              ? t("workflow.spawning", "Spawning…")
              : t("workflow.create", "Create {{n}} terminals", { n: selected.size })}
          </button>
        </div>
      </div>
    </>
  );
}
