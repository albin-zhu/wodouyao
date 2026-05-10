import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { call, isTauri } from "../../services/transport";
import { useSettingsStore } from "../../store/settingsStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import type {
  BackgroundKind,
  BackgroundSettings,
  EnvOverride,
  QuickCommand,
  TerminalOptions,
} from "../../types/settings";
import { DEFAULT_TERMINAL_OPTIONS } from "../../types/settings";
import IntegrationsSection from "./IntegrationsSection";
import TerminalOptionsSection from "./TerminalOptionsSection";

type Tab = "general" | "terminal" | "appearance" | "advanced";

export default function SettingsDrawer() {
  const { t, i18n } = useTranslation();
  const { settings, drawerOpen, closeDrawer, updateSettings } = useSettingsStore();
  const workspaceCwd = useWorkspaceStore((s) => s.currentWorkspaceCwd);
  const setWorkspaceCwd = useWorkspaceStore((s) => s.setWorkspaceCwd);
  const [activeTab, setActiveTab] = useState<Tab>("general");

  const TABS: { id: Tab; label: string }[] = [
    { id: "general",    label: t("settings.tabs.general") },
    { id: "terminal",   label: t("settings.tabs.terminal") },
    { id: "appearance", label: t("settings.tabs.appearance") },
    { id: "advanced",   label: t("settings.tabs.advanced") },
  ];
  const [editingCmd, setEditingCmd] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCommand, setEditCommand] = useState("");
  const [cwdInput, setCwdInput] = useState("");
  const [shaderList, setShaderList] = useState<string[]>([]);

  const refreshShaders = useCallback(() => {
    call<string[]>("shaders_list")
      .then((list) => setShaderList(list))
      .catch((e) => console.warn("[settings] shaders_list failed:", e));
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      setCwdInput(workspaceCwd ?? "");
      refreshShaders();
    }
  }, [drawerOpen, workspaceCwd, refreshShaders]);

  if (!drawerOpen || !settings) return null;

  // ── helpers ──────────────────────────────────────────────────────────────

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

  const addQuickCmd = () => {
    const id = `cmd-${Date.now().toString(36)}`;
    const next: QuickCommand = { id, label: t("settings.newCommand"), command: "", icon_label: "?" };
    updateSettings({ quick_commands: [...settings.quick_commands, next] });
    setEditingCmd(id);
    setEditLabel(next.label);
    setEditCommand(next.command);
  };

  const deleteQuickCmd = (id: string) => {
    updateSettings({ quick_commands: settings.quick_commands.filter((c) => c.id !== id) });
    if (editingCmd === id) setEditingCmd(null);
  };

  const bg: BackgroundSettings = settings.background ?? { kind: "none", opacity: 1 };
  const patchBg = (patch: Partial<BackgroundSettings>) =>
    updateSettings({ background: { ...bg, ...patch } });

  const termOpts: TerminalOptions = settings.terminal_options ?? DEFAULT_TERMINAL_OPTIONS;
  const patchTermOpts = (patch: Partial<TerminalOptions>) =>
    updateSettings({ terminal_options: { ...termOpts, ...patch } });

  // ── styles ────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "var(--color-bg)",
    borderRadius: 8,
    padding: "0 12px",
    marginBottom: 8,
    overflow: "hidden",
  };

  const cardHeader: React.CSSProperties = {
    color: "var(--color-accent)",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    padding: "10px 0 8px",
    borderBottom: "1px solid var(--color-border)",
    marginBottom: 2,
  };

  const settingRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid var(--color-border)",
  };

  const lastRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
  };

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    color: "var(--color-text)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const rowLabel: React.CSSProperties = {
    color: "var(--color-text)",
    fontSize: 12,
  };

  // ── tab content ───────────────────────────────────────────────────────────

  const renderGeneral = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Language + Theme in one card */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.langTheme")}</div>
        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.language")}</span>
          <select value={settings.language ?? "en"}
            onChange={(e) => { updateSettings({ language: e.target.value }); i18n.changeLanguage(e.target.value); }}
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 5, color: "var(--color-text)", fontSize: 12, padding: "4px 6px", outline: "none" }}>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
        <div style={lastRow}>
          <span style={rowLabel}>{t("settings.theme")}</span>
          <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 5, overflow: "hidden" }}>
            {(["system", "dark", "light"] as const).map((v, i) => {
              const active = (settings.theme ?? "system") === v;
              const label = v === "system" ? t("settings.themeSystem") : v === "dark" ? t("settings.themeDark") : t("settings.themeLight");
              return (
                <button key={v} onClick={() => updateSettings({ theme: v })} style={{
                  background: active ? "var(--color-accent)" : "var(--color-surface)",
                  color: active ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                  border: "none", borderRight: i < 2 ? "1px solid var(--color-border)" : "none",
                  padding: "5px 10px", fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer",
                }}>{label}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workspace */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.workspaceDir")}</div>
        <div style={{ padding: "10px 0" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={cwdInput} onChange={(e) => setCwdInput(e.target.value)}
              onBlur={() => setWorkspaceCwd(cwdInput || null)}
              onKeyDown={(e) => { if (e.key === "Enter") setWorkspaceCwd(cwdInput || null); }}
              placeholder={t("settings.workspaceDirPlaceholder")}
              style={{ ...inputBase, fontSize: 12, fontFamily: "monospace" }} />
            {isTauri && (
              <button onClick={async () => {
                const sel = await openDialog({ directory: true, multiple: false }).catch(() => null);
                if (typeof sel === "string") { setCwdInput(sel); setWorkspaceCwd(sel); }
              }} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>📂</button>
            )}
            {cwdInput && (
              <button onClick={() => { setCwdInput(""); setWorkspaceCwd(null); }}
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
            )}
          </div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 6 }}>{t("settings.workspaceDirHint")}</div>
        </div>
      </div>

      {/* Terminal spawn */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.newTerminal")}</div>
        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.newTerminal")}</span>
          <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 5, overflow: "hidden" }}>
            {[{ value: false, label: t("settings.showDialog") }, { value: true, label: t("settings.useLastPrefs") }].map((opt, i) => {
              const active = (settings.skip_create_dialog ?? false) === opt.value;
              return (
                <button key={String(opt.value)} onClick={() => updateSettings({ skip_create_dialog: opt.value })} style={{
                  background: active ? "var(--color-accent)" : "var(--color-surface)",
                  color: active ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                  border: "none", borderRight: i === 0 ? "1px solid var(--color-border)" : "none",
                  padding: "5px 10px", fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer",
                }}>{opt.label}</button>
              );
            })}
          </div>
        </div>
        <div style={{ ...lastRow, flexDirection: "column" as const, alignItems: "flex-start", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={settings.wire_empty_spawn_enabled ?? true}
              onChange={(e) => updateSettings({ wire_empty_spawn_enabled: e.target.checked })} style={{ margin: 0 }} />
            <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.autoSpawnTerminal")}</span>
          </label>
          {(settings.wire_empty_spawn_enabled ?? true) && (
            <input value={settings.wire_empty_spawn_command ?? "claude"}
              onChange={(e) => updateSettings({ wire_empty_spawn_command: e.target.value })}
              placeholder="claude" style={{ ...inputBase, fontSize: 12, fontFamily: "monospace" }} />
          )}
          <div style={{ color: "var(--color-text-muted)", fontSize: 10 }}>{t("settings.wireToEmptyHint")}</div>
        </div>
      </div>
    </div>
  );

  const renderTerminal = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Opacity card */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.terminalOpacity")}</div>
        <div style={{ padding: "10px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={rowLabel}>{t("settings.terminalOpacity")}</span>
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{(settings.terminal_opacity ?? 1).toFixed(2)}</span>
          </div>
          <input type="range" min={0.3} max={1} step={0.05} value={settings.terminal_opacity ?? 1}
            onChange={(e) => updateSettings({ terminal_opacity: parseFloat(e.target.value) })}
            style={{ width: "100%" }} />
        </div>
      </div>
      <TerminalOptionsSection opts={termOpts} onPatch={patchTermOpts} />
    </div>
  );

  const renderAppearance = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={card}>
        <div style={cardHeader}>{t("settings.background")}</div>
        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.bgType")}</span>
          <select value={bg.kind} onChange={(e) => patchBg({ kind: e.target.value as BackgroundKind })}
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 5, color: "var(--color-text)", fontSize: 12, padding: "4px 6px", outline: "none" }}>
            <option value="none">{t("settings.bgNone")}</option>
            <option value="image">{t("settings.bgImage")}</option>
            <option value="video">{t("settings.bgVideo")}</option>
            <option value="url">{t("settings.bgUrl")}</option>
            <option value="shader">{t("settings.bgShader")}</option>
          </select>
        </div>

        {(bg.kind === "image" || bg.kind === "video" || bg.kind === "url") && (
          <div style={{ ...settingRow, flexDirection: "column" as const, alignItems: "stretch", gap: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={bg.source ?? ""} onChange={(e) => patchBg({ source: e.target.value || null })}
                placeholder={bg.kind === "url" ? t("settings.bgUrlPlaceholder") : t("settings.bgFilePlaceholder")}
                style={{ ...inputBase, fontSize: 12, fontFamily: "monospace" }} />
              {isTauri && (bg.kind === "image" || bg.kind === "video") && (
                <button onClick={async () => {
                  const filters = bg.kind === "image"
                    ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"] }]
                    : [{ name: "Videos", extensions: ["mp4", "webm", "mov", "mkv", "avi"] }];
                  const sel = await openDialog({ multiple: false, filters }).catch(() => null);
                  if (typeof sel === "string") patchBg({ source: sel });
                }} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>📂</button>
              )}
            </div>
          </div>
        )}

        {bg.kind === "shader" && (
          <div style={settingRow}>
            <span style={rowLabel}>Shader</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select value={bg.shader ?? ""} onChange={(e) => patchBg({ shader: e.target.value || null })}
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 5, color: "var(--color-text)", fontSize: 12, padding: "4px 6px", outline: "none" }}>
                {shaderList.length === 0 ? <option value="">{t("settings.bgShaderNone")}</option> : (
                  <>{!bg.shader && <option value="">—</option>}{shaderList.map((n) => <option key={n} value={n}>{n}</option>)}</>
                )}
              </select>
              <button onClick={refreshShaders} title={t("settings.bgShaderRefresh")}
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 13 }}>↻</button>
            </div>
          </div>
        )}

        <div style={{ ...settingRow, flexDirection: "column" as const, alignItems: "stretch", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={rowLabel}>{t("settings.opacity")}</span>
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{(bg.opacity ?? 1).toFixed(2)}</span>
          </div>
          <input type="range" min={0} max={1} step={0.05} value={bg.opacity ?? 1}
            onChange={(e) => patchBg({ opacity: parseFloat(e.target.value) })} style={{ width: "100%" }} />
          <div style={{ color: "var(--color-text-muted)", fontSize: 10 }}>{t("settings.opacityHint")}</div>
        </div>

        <div style={{ ...lastRow, flexDirection: "column" as const, alignItems: "stretch", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={rowLabel}>{t("settings.terminalOpacity")}</span>
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{(settings.terminal_opacity ?? 1).toFixed(2)}</span>
          </div>
          <input type="range" min={0.3} max={1} step={0.05} value={settings.terminal_opacity ?? 1}
            onChange={(e) => updateSettings({ terminal_opacity: parseFloat(e.target.value) })} style={{ width: "100%" }} />
        </div>
      </div>
    </div>
  );

  const renderAdvanced = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Debug / Performance */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.debug", "Debug")}</div>
        <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={settings.show_perf_hud ?? false}
                onChange={(e) => updateSettings({ show_perf_hud: e.target.checked })} style={{ margin: 0 }} />
              <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.showPerfHud", "Show performance HUD")}</span>
            </label>
            <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>
              {t("settings.perfHudHint", "Bottom-right overlay with FPS, frame time, JS heap, and node/wire counts.")}
            </div>
          </div>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={settings.terminal_gpu_renderer ?? false}
                onChange={(e) => updateSettings({ terminal_gpu_renderer: e.target.checked })} style={{ margin: 0 }} />
              <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.terminalGpuRenderer", "Use WebGL terminal renderer")}</span>
            </label>
            <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>
              {t("settings.terminalGpuRendererHint", "Faster but may garble text when canvas zoom or DPR changes. Restart terminals after toggling.")}
            </div>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.integrations")}</div>
        <div style={{ padding: "10px 0" }}>
          <IntegrationsSection />
        </div>
      </div>

      {/* Env overrides */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.envOverrides", "Environment variables")}</div>
        <div style={{ padding: "8px 0" }}>
          <div style={{ color: "var(--color-text-muted)", fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
            {t("settings.envOverridesHint", "Injected into every new terminal. WODOUYAO_* keys are reserved.")}
          </div>
          {(settings.env_overrides ?? []).map((eo, idx) => (
            <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
              <input value={eo.key} onChange={(e) => {
                const next: EnvOverride[] = (settings.env_overrides ?? []).map((x, i) => i === idx ? { ...x, key: e.target.value } : x);
                updateSettings({ env_overrides: next });
              }} placeholder="KEY" spellCheck={false}
                style={{ flex: "0 0 110px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", padding: "4px 8px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
              <input value={eo.value} onChange={(e) => {
                const next: EnvOverride[] = (settings.env_overrides ?? []).map((x, i) => i === idx ? { ...x, value: e.target.value } : x);
                updateSettings({ env_overrides: next });
              }} placeholder="value" spellCheck={false}
                style={{ flex: 1, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", padding: "4px 8px", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
              <button onClick={() => updateSettings({ env_overrides: (settings.env_overrides ?? []).filter((_, i) => i !== idx) })}
                style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: 13, padding: "0 4px" }}>✕</button>
            </div>
          ))}
          <button onClick={() => updateSettings({ env_overrides: [...(settings.env_overrides ?? []), { key: "", value: "" }] })}
            style={{ background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "4px 12px", fontSize: 11, cursor: "pointer", marginTop: 4 }}>
            + {t("settings.envOverrideAdd", "Add variable")}
          </button>
        </div>
      </div>

      {/* Quick Commands */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.quickCommands")}</div>
        <div style={{ padding: "8px 0" }}>
          {settings.quick_commands.map((cmd) => (
            <div key={cmd.id} style={{ background: "var(--color-surface)", borderRadius: 6, padding: 10, marginBottom: 6 }}>
              {editingCmd === cmd.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder={t("settings.label")}
                    style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", padding: "4px 8px", fontSize: 13, outline: "none" }} />
                  <input value={editCommand} onChange={(e) => setEditCommand(e.target.value)} placeholder={t("settings.command")}
                    style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, color: "var(--color-text)", padding: "4px 8px", fontSize: 13, fontFamily: "monospace", outline: "none" }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={saveEditCmd} style={{ background: "var(--color-accent)", color: "var(--color-bg-alt)", border: "none", borderRadius: 4, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>{t("settings.save")}</button>
                    <button onClick={() => setEditingCmd(null)} style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>{t("settings.cancel")}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "var(--color-text)", fontSize: 13 }}>{cmd.label}</div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: 11, fontFamily: "monospace" }}>$ {cmd.command}</div>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => startEditCmd(cmd)} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: 12, padding: "2px 8px" }}>{t("settings.edit")}</button>
                    <button onClick={() => deleteQuickCmd(cmd.id)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: 12, padding: "2px 8px" }}>✕</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={addQuickCmd} style={{ background: "transparent", border: "1px dashed var(--color-border)", borderRadius: 6, color: "var(--color-accent)", cursor: "pointer", padding: "8px 12px", fontSize: 12, width: "100%", marginTop: 2 }}>
            {t("settings.addQuickCommand")}
          </button>
        </div>
      </div>
    </div>
  );

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div onClick={closeDrawer} style={{ position: "fixed", inset: 0, zIndex: 8999, background: "rgba(0,0,0,0.3)" }} />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, width: 360, height: "100vh", zIndex: 9000,
        background: "var(--color-surface)", borderLeft: "1px solid var(--color-border)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
          <span style={{ color: "var(--color-text)", fontWeight: 600, fontSize: 14 }}>{t("settings.title")}</span>
          <button onClick={closeDrawer} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: 18, padding: "2px 6px" }}>
            {"✕"}
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", flexShrink: 0, background: "var(--color-surface)" }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
                  color: active ? "var(--color-accent)" : "var(--color-text-muted)",
                  padding: "10px 4px",
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 24px" }}>
          {activeTab === "general" && renderGeneral()}
          {activeTab === "terminal" && renderTerminal()}
          {activeTab === "appearance" && renderAppearance()}
          {activeTab === "advanced" && renderAdvanced()}
        </div>
      </div>
    </>
  );
}
