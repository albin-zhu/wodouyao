import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store/settingsStore";
import { useTerminalStore } from "../../store/terminalStore";
import { hooksRuns, hooksStatus, hooksTest } from "../../services/tauriCommands";
import type {
  Hook,
  HookEvent,
  HookFilter,
  HookRun,
  HookStats,
} from "../../types/settings";
import { HOOK_EVENTS } from "../../types/settings";
import { generateId } from "../../utils/id";

type Tab = "form" | "json" | "logs";
type StatsMap = Record<string, HookStats>;

const STATUS_VALUES = ["pending", "in_progress", "completed"] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

function statusDotColor(stats: HookStats | undefined): string {
  if (!stats || stats.last_fired_at == null) return "var(--color-text-muted)";
  if (stats.last_error) return "var(--color-danger)";
  if (stats.last_notifier_count != null && stats.last_notifier_count === 0)
    return "var(--color-warning)";
  return "var(--color-success)";
}

function relTime(ms: number | null | undefined): string {
  if (!ms) return "never";
  const diff = Math.max(0, Date.now() - ms * 1000);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function freshHook(name: string): Hook {
  return {
    id: generateId("hook"),
    name,
    events: ["task.completed"],
    enabled: true,
    filter: {},
  };
}

export default function HooksSection() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const hooks = settings?.hooks ?? [];

  // Live count of notifier terminals on the current canvas — used for the
  // "no notifier wired up" warning.
  const notifierCount = useTerminalStore((s) =>
    Array.from(s.terminals.values()).filter((tm) => tm.role === "notifier").length
  );

  const [stats, setStats] = useState<StatsMap>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("form");

  useEffect(() => {
    let alive = true;
    const tick = () => {
      hooksStatus()
        .then((s) => {
          if (alive) setStats(s);
        })
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const patchHook = useCallback(
    (id: string, patch: Partial<Hook>) => {
      updateSettings({
        hooks: hooks.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      });
    },
    [hooks, updateSettings]
  );
  const replaceHook = useCallback(
    (next: Hook) => {
      updateSettings({ hooks: hooks.map((h) => (h.id === next.id ? next : h)) });
    },
    [hooks, updateSettings]
  );
  const removeHook = useCallback(
    (id: string) => {
      if (!confirm(t("settings.hooks.deleteConfirm", "Delete this hook?"))) return;
      updateSettings({ hooks: hooks.filter((h) => h.id !== id) });
      if (expandedId === id) setExpandedId(null);
    },
    [hooks, updateSettings, expandedId, t]
  );
  const addHook = useCallback(() => {
    const next = freshHook(t("settings.hooks.newName", "New hook"));
    updateSettings({ hooks: [...hooks, next] });
    setExpandedId(next.id);
    setTab("form");
  }, [hooks, updateSettings, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "var(--color-text-muted)", fontSize: 11, lineHeight: 1.5 }}>
        {t(
          "settings.hooks.hint",
          "On task lifecycle events, broadcast a [wodouyao:hook] line to every terminal whose role is `notifier`. The notifier agent reads it and uses its installed CLIs (lark, slack, etc.) to deliver."
        )}
      </div>

      {/* Notifier presence indicator */}
      <div
        style={{
          fontSize: 11,
          padding: "6px 10px",
          borderRadius: 4,
          background:
            notifierCount > 0
              ? "color-mix(in srgb, var(--color-success) 10%, transparent)"
              : "color-mix(in srgb, var(--color-warning) 10%, transparent)",
          border: `1px solid ${
            notifierCount > 0
              ? "color-mix(in srgb, var(--color-success) 30%, transparent)"
              : "color-mix(in srgb, var(--color-warning) 30%, transparent)"
          }`,
          color: notifierCount > 0 ? "var(--color-success)" : "var(--color-warning)",
        }}
      >
        {notifierCount > 0
          ? `${notifierCount} notifier ${notifierCount === 1 ? "terminal" : "terminals"} on canvas`
          : t(
              "settings.hooks.noNotifier",
              "No notifier terminals on canvas — spawn one with role=notifier so events have somewhere to go"
            )}
      </div>

      {hooks.length === 0 && (
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: 11,
            padding: "12px 8px",
            textAlign: "center",
            background: "var(--color-surface)",
            borderRadius: 6,
            border: "1px dashed var(--color-border)",
          }}
        >
          {t("settings.hooks.empty", "No hooks configured")}
        </div>
      )}

      {hooks.map((h) => (
        <HookRow
          key={h.id}
          hook={h}
          stats={stats[h.id]}
          expanded={expandedId === h.id}
          tab={tab}
          onToggleExpand={() => {
            const next = expandedId === h.id ? null : h.id;
            setExpandedId(next);
            if (next) setTab("form");
          }}
          onSetTab={setTab}
          onPatch={(patch) => patchHook(h.id, patch)}
          onReplace={replaceHook}
          onRemove={() => removeHook(h.id)}
        />
      ))}

      <button
        onClick={addHook}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: "5px 12px",
          fontSize: 11,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        + {t("settings.hooks.add", "Add hook")}
      </button>
    </div>
  );
}

// ── one hook row ────────────────────────────────────────────────────────

interface HookRowProps {
  hook: Hook;
  stats: HookStats | undefined;
  expanded: boolean;
  tab: Tab;
  onToggleExpand: () => void;
  onSetTab: (tab: Tab) => void;
  onPatch: (patch: Partial<Hook>) => void;
  onReplace: (next: Hook) => void;
  onRemove: () => void;
}

function HookRow({
  hook,
  stats,
  expanded,
  tab,
  onToggleExpand,
  onSetTab,
  onPatch,
  onReplace,
  onRemove,
}: HookRowProps) {
  const { t } = useTranslation();
  const dot = statusDotColor(stats);

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 6,
        opacity: hook.enabled ? 1 : 0.55,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 10,
          cursor: "pointer",
        }}
        onClick={onToggleExpand}
      >
        <span
          title={
            stats?.last_fired_at
              ? `${stats.fire_count} fires • last ${relTime(stats.last_fired_at)} • ` +
                `delivered to ${stats.last_notifier_count ?? 0} notifier(s)` +
                (stats.last_error ? `\n${stats.last_error}` : "")
              : "never fired"
          }
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dot,
            flexShrink: 0,
          }}
        />
        <input
          type="checkbox"
          checked={hook.enabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onPatch({ enabled: e.target.checked })}
          style={{ margin: 0, cursor: "pointer" }}
        />
        <input
          value={hook.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder={t("settings.hooks.namePlaceholder", "Hook name")}
          style={{
            flex: 1,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            color: "var(--color-text)",
            padding: "4px 8px",
            fontSize: 12,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {hook.events.slice(0, 2).map((e) => (
            <span
              key={e}
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                padding: "1px 5px",
                borderRadius: 3,
                background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                color: "var(--color-accent)",
                border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
              }}
            >
              {e.replace("task.", "")}
            </span>
          ))}
          {hook.events.length > 2 && (
            <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
              +{hook.events.length - 2}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={t("common.delete", "Delete")}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-danger)",
            cursor: "pointer",
            fontSize: 13,
            padding: "0 4px",
            flexShrink: 0,
          }}
        >
          ✕
        </button>
        <span
          style={{
            color: "var(--color-text-muted)",
            fontSize: 11,
            flexShrink: 0,
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        >
          ▶
        </span>
      </div>

      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 0,
              borderBottom: "1px solid var(--color-border)",
              padding: "0 8px",
            }}
          >
            {(["form", "json", "logs"] as Tab[]).map((id) => (
              <button
                key={id}
                onClick={() => onSetTab(id)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${tab === id ? "var(--color-accent)" : "transparent"}`,
                  color: tab === id ? "var(--color-text)" : "var(--color-text-muted)",
                  padding: "8px 12px",
                  fontSize: 11,
                  fontWeight: tab === id ? 600 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {id}
              </button>
            ))}
          </div>
          <div style={{ padding: 12 }}>
            {tab === "form" && <FormTab hook={hook} onPatch={onPatch} />}
            {tab === "json" && <JsonTab hook={hook} onReplace={onReplace} />}
            {tab === "logs" && <LogsTab hook={hook} stats={stats} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Form tab ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  color: "var(--color-text)",
  padding: "5px 8px",
  fontSize: 12,
  outline: "none",
};
const monoInput: React.CSSProperties = { ...inputStyle, fontFamily: "monospace" };
const fieldLabel: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

function FormTab({ hook, onPatch }: { hook: Hook; onPatch: (p: Partial<Hook>) => void }) {
  const { t } = useTranslation();
  const filter: HookFilter = hook.filter ?? {};

  const toggleEvent = (evt: HookEvent) => {
    const has = hook.events.includes(evt);
    const next = has ? hook.events.filter((e) => e !== evt) : [...hook.events, evt];
    onPatch({ events: next });
  };
  const toggleStatus = (s: StatusValue) => {
    const list = filter.status ?? [];
    const next = list.includes(s) ? list.filter((x) => x !== s) : [...list, s];
    onPatch({ filter: { ...filter, status: next.length ? next : null } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={fieldLabel}>{t("settings.hooks.events", "Events")}</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {HOOK_EVENTS.map((evt) => {
            const active = hook.events.includes(evt);
            return (
              <button
                key={evt}
                onClick={() => toggleEvent(evt)}
                style={{
                  background: active ? "var(--color-accent)" : "transparent",
                  color: active ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                  border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                  borderRadius: 3,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                {evt}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={fieldLabel}>{t("settings.hooks.filter", "Filter (optional)")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ ...fieldLabel, fontSize: 9, textTransform: "none", marginBottom: 3 }}>
              {t("settings.hooks.filterStatus", "Only when task status is")}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {STATUS_VALUES.map((s) => {
                const active = (filter.status ?? []).includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    style={{
                      background: active ? "var(--color-accent)" : "transparent",
                      color: active ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                      border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
                      borderRadius: 3,
                      padding: "2px 8px",
                      fontSize: 10,
                      cursor: "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    {s}
                  </button>
                );
              })}
              {(filter.status ?? []).length === 0 && (
                <span style={{ color: "var(--color-text-muted)", fontSize: 10, padding: "2px 4px" }}>
                  any
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={{ ...fieldLabel, fontSize: 9, textTransform: "none", marginBottom: 3 }}>
              {t("settings.hooks.filterPattern", "Subject regex")}
            </div>
            <input
              value={filter.subject_pattern ?? ""}
              onChange={(e) =>
                onPatch({ filter: { ...filter, subject_pattern: e.target.value || null } })
              }
              placeholder="^bug:"
              style={{ ...monoInput, width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <div style={{ ...fieldLabel, fontSize: 9, textTransform: "none", marginBottom: 3 }}>
              {t("settings.hooks.filterWs", "Workspace ID (blank = any)")}
            </div>
            <input
              value={filter.workspace_id ?? ""}
              onChange={(e) =>
                onPatch({ filter: { ...filter, workspace_id: e.target.value || null } })
              }
              placeholder="ws_..."
              style={{ ...monoInput, width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── JSON tab ────────────────────────────────────────────────────────────

function JsonTab({ hook, onReplace }: { hook: Hook; onReplace: (next: Hook) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => JSON.stringify(hook, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const lastSerializedRef = useRef(JSON.stringify(hook));
  useEffect(() => {
    const ser = JSON.stringify(hook);
    if (ser !== lastSerializedRef.current) {
      lastSerializedRef.current = ser;
      setDraft(JSON.stringify(hook, null, 2));
      setErr(null);
    }
  }, [hook]);

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setErr(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      setErr("Top-level value must be an object");
      return;
    }
    const obj = parsed as Partial<Hook>;
    if (typeof obj.id !== "string" || obj.id !== hook.id) {
      setErr("`id` must be present and unchanged");
      return;
    }
    if (typeof obj.name !== "string" || !obj.name.trim()) {
      setErr("`name` is required");
      return;
    }
    if (!Array.isArray(obj.events)) {
      setErr("`events` must be an array");
      return;
    }
    if (typeof obj.enabled !== "boolean") {
      setErr("`enabled` must be a boolean");
      return;
    }
    setErr(null);
    onReplace(obj as Hook);
    lastSerializedRef.current = JSON.stringify(obj);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const reset = () => {
    setDraft(JSON.stringify(hook, null, 2));
    setErr(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        spellCheck={false}
        rows={14}
        style={{
          background: "var(--color-surface)",
          border: `1px solid ${err ? "var(--color-danger)" : "var(--color-border)"}`,
          borderRadius: 4,
          color: "var(--color-text)",
          padding: "8px 10px",
          fontSize: 12,
          fontFamily: "monospace",
          outline: "none",
          resize: "vertical",
          minHeight: 240,
          lineHeight: 1.5,
        }}
      />
      {err && (
        <div
          style={{
            color: "var(--color-danger)",
            fontSize: 11,
            fontFamily: "monospace",
            background: "color-mix(in srgb, var(--color-danger) 8%, transparent)",
            padding: "6px 8px",
            borderRadius: 4,
          }}
        >
          {err}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={apply}
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg-alt)",
            border: "none",
            borderRadius: 4,
            padding: "5px 14px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("common.save", "Save")}
        </button>
        <button
          onClick={reset}
          style={{
            background: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "5px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {t("common.reset", "Reset")}
        </button>
        {saved && (
          <span style={{ color: "var(--color-success)", fontSize: 11 }}>
            ✓ {t("common.saved", "Saved")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Logs tab ────────────────────────────────────────────────────────────

function LogsTab({ hook, stats }: { hook: Hook; stats: HookStats | undefined }) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<HookRun[]>([]);
  const [testing, setTesting] = useState(false);
  const [testErr, setTestErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    hooksRuns(hook.id)
      .then((r) => setRuns(r.slice().reverse()))
      .catch(() => {});
  }, [hook.id]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const runTest = async () => {
    setTesting(true);
    setTestErr(null);
    try {
      await hooksTest(hook.id);
      refresh();
    } catch (e) {
      setTestErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={runTest}
          disabled={testing}
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg-alt)",
            border: "none",
            borderRadius: 4,
            padding: "5px 14px",
            fontSize: 11,
            fontWeight: 600,
            cursor: testing ? "wait" : "pointer",
            opacity: testing ? 0.6 : 1,
          }}
        >
          {testing ? "…" : t("settings.hooks.test", "Test fire")}
        </button>
        <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
          {stats?.fire_count ?? 0} {t("settings.hooks.totalFires", "total fires")}
          {stats?.last_fired_at
            ? ` · ${t("settings.hooks.last", "last")} ${relTime(stats.last_fired_at)}`
            : ""}
        </span>
      </div>
      {testErr && (
        <div
          style={{
            color: "var(--color-danger)",
            fontSize: 11,
            background: "color-mix(in srgb, var(--color-danger) 8%, transparent)",
            padding: "6px 8px",
            borderRadius: 4,
          }}
        >
          {testErr}
        </div>
      )}
      {runs.length === 0 ? (
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: 11,
            padding: "12px 8px",
            textAlign: "center",
            background: "var(--color-surface)",
            borderRadius: 4,
            border: "1px dashed var(--color-border)",
          }}
        >
          {t("settings.hooks.noRuns", "No runs yet")}
        </div>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}
        >
          {runs.map((r, i) => (
            <RunRow key={i} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: HookRun }) {
  const [open, setOpen] = useState(false);
  const failed = run.error != null;
  const undelivered = !failed && run.notifier_count === 0;
  const dot = failed
    ? "var(--color-danger)"
    : undelivered
      ? "var(--color-warning)"
      : "var(--color-success)";
  const date = new Date(run.timestamp * 1000);

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 4,
        padding: "6px 10px",
        fontSize: 11,
        fontFamily: "monospace",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", cursor: run.error ? "pointer" : "default" }}
        onClick={() => run.error && setOpen((v) => !v)}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
          {date.toLocaleTimeString()}
        </span>
        <span style={{ color: "var(--color-accent)", flexShrink: 0 }}>{run.event}</span>
        <span
          style={{
            color: "var(--color-text)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {run.task_subject}
        </span>
        <span style={{ color: failed ? "var(--color-danger)" : "var(--color-text-muted)", flexShrink: 0 }}>
          → {run.notifier_count} notifier{run.notifier_count === 1 ? "" : "s"}
        </span>
      </div>
      {open && run.error && (
        <pre
          style={{
            margin: "6px 0 0",
            padding: "6px 8px",
            background: "var(--color-bg)",
            borderRadius: 3,
            color: "var(--color-text-dim)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {run.error}
        </pre>
      )}
    </div>
  );
}
