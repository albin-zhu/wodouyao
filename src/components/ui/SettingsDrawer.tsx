import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../store/settingsStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import type {
  BackgroundKind,
  BackgroundSettings,
  EnvOverride,
  QuickCommand,
} from "../../types/settings";
import IntegrationsSection from "./IntegrationsSection";

export default function SettingsDrawer() {
  const { t, i18n } = useTranslation();
  const { settings, drawerOpen, closeDrawer, updateSettings } =
    useSettingsStore();
  const workspaceCwd = useWorkspaceStore((s) => s.currentWorkspaceCwd);
  const setWorkspaceCwd = useWorkspaceStore((s) => s.setWorkspaceCwd);
  const [editingCmd, setEditingCmd] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCommand, setEditCommand] = useState("");
  const [cwdInput, setCwdInput] = useState("");
  const [shaderList, setShaderList] = useState<string[]>([]);

  const refreshShaders = useCallback(() => {
    invoke<string[]>("shaders_list")
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

  const handleFontSize = (size: number) => {
    if (size >= 8 && size <= 32) {
      updateSettings({ font_size: size });
    }
  };

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
    const next: QuickCommand = {
      id,
      label: "New Command",
      command: "",
      icon_label: "?",
    };
    updateSettings({ quick_commands: [...settings.quick_commands, next] });
    setEditingCmd(id);
    setEditLabel(next.label);
    setEditCommand(next.command);
  };

  const deleteQuickCmd = (id: string) => {
    const next = settings.quick_commands.filter((c) => c.id !== id);
    updateSettings({ quick_commands: next });
    if (editingCmd === id) setEditingCmd(null);
  };

  const bg: BackgroundSettings = settings.background ?? {
    kind: "none",
    opacity: 1,
  };
  const patchBg = (patch: Partial<BackgroundSettings>) => {
    updateSettings({ background: { ...bg, ...patch } });
  };

  const sectionStyle: React.CSSProperties = {
    padding: "16px 0",
    borderBottom: "1px solid var(--color-border)",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--color-accent)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8999,
          background: "rgba(0,0,0,0.3)",
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 320,
          height: "100vh",
          zIndex: 9000,
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "var(--color-text)", fontWeight: 600, fontSize: 14 }}>
            {t("settings.title")}
          </span>
          <button
            onClick={closeDrawer}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 18,
              padding: "2px 6px",
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* Content */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}
        >
          {/* Language */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.language")}</div>
            <select
              value={settings.language ?? "en"}
              onChange={(e) => {
                updateSettings({ language: e.target.value });
                i18n.changeLanguage(e.target.value);
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                color: "var(--color-text)",
                fontSize: 13,
                outline: "none",
              }}
            >
              <option value="en">English</option>
              <option value="zh">{"\u4E2D\u6587"}</option>
            </select>
          </div>

          {/* Theme */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.theme")}</div>
            <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
              {(["system", "dark", "light"] as const).map((v) => {
                const active = (settings.theme ?? "system") === v;
                const label =
                  v === "system"
                    ? t("settings.themeSystem")
                    : v === "dark"
                    ? t("settings.themeDark")
                    : t("settings.themeLight");
                return (
                  <button
                    key={v}
                    onClick={() => updateSettings({ theme: v })}
                    style={{
                      flex: 1,
                      background: active ? "var(--color-accent)" : "var(--color-bg)",
                      color: active ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                      border: "none",
                      padding: "8px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      borderRight: v !== "light" ? "1px solid var(--color-border)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Workspace Directory */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.workspaceDir")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={cwdInput}
                onChange={(e) => setCwdInput(e.target.value)}
                onBlur={() => setWorkspaceCwd(cwdInput || null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setWorkspaceCwd(cwdInput || null);
                }}
                placeholder={t("settings.workspaceDirPlaceholder")}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  color: "var(--color-text)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <button
                onClick={async () => {
                  const selected = await openDialog({ directory: true, multiple: false }).catch(() => null);
                  if (typeof selected === "string") {
                    setCwdInput(selected);
                    setWorkspaceCwd(selected);
                  }
                }}
                title={t("settings.browseFolder")}
                style={{
                  background: "var(--color-surface-alt)",
                  border: "none",
                  color: "var(--color-text)",
                  borderRadius: 6,
                  padding: "0 10px",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {"\uD83D\uDCC2"}
              </button>
              {cwdInput && (
                <button
                  onClick={() => {
                    setCwdInput("");
                    setWorkspaceCwd(null);
                  }}
                  title={t("settings.clear")}
                  style={{
                    background: "var(--color-surface-alt)",
                    border: "none",
                    color: "var(--color-text-muted)",
                    borderRadius: 6,
                    padding: "0 10px",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  {"\u2715"}
                </button>
              )}
            </div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 4 }}>
              {t("settings.workspaceDirHint")}
            </div>
          </div>

          {/* Font Size */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.fontSize")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => handleFontSize(settings.font_size - 1)}
                style={{
                  background: "var(--color-surface-alt)",
                  border: "none",
                  color: "var(--color-text)",
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                -
              </button>
              <span
                style={{
                  color: "var(--color-text)",
                  fontSize: 14,
                  minWidth: 30,
                  textAlign: "center",
                }}
              >
                {settings.font_size}
              </span>
              <button
                onClick={() => handleFontSize(settings.font_size + 1)}
                style={{
                  background: "var(--color-surface-alt)",
                  border: "none",
                  color: "var(--color-text)",
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* New Terminal flow */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.newTerminal")}</div>
            <div
              style={{
                display: "flex",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: 2,
                gap: 2,
              }}
            >
              {[
                { value: false, label: t("settings.showDialog") },
                { value: true, label: t("settings.useLastPrefs") },
              ].map((opt) => {
                const active = (settings.skip_create_dialog ?? false) === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    onClick={() =>
                      updateSettings({ skip_create_dialog: opt.value })
                    }
                    style={{
                      flex: 1,
                      background: active ? "var(--color-accent)" : "transparent",
                      color: active ? "var(--color-bg-alt)" : "var(--color-text)",
                      border: "none",
                      borderRadius: 4,
                      padding: "6px 8px",
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 6 }}>
              {t("settings.shiftClickHint")}
            </div>
          </div>

          {/* Wire to empty canvas */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.wireToEmpty")}</div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              <input
                type="checkbox"
                checked={settings.wire_empty_spawn_enabled ?? true}
                onChange={(e) =>
                  updateSettings({ wire_empty_spawn_enabled: e.target.checked })
                }
                style={{ margin: 0 }}
              />
              <span style={{ color: "var(--color-text)", fontSize: 13 }}>
                {t("settings.autoSpawnTerminal")}
              </span>
            </label>
            {(settings.wire_empty_spawn_enabled ?? true) && (
              <input
                value={settings.wire_empty_spawn_command ?? "claude"}
                onChange={(e) =>
                  updateSettings({ wire_empty_spawn_command: e.target.value })
                }
                placeholder="claude"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  color: "var(--color-text)",
                  fontSize: 12,
                  fontFamily: "monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
            <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 6 }}>
              {t("settings.wireToEmptyHint")}
            </div>
          </div>

          {/* Background */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.background")}</div>
            <select
              value={bg.kind}
              onChange={(e) =>
                patchBg({ kind: e.target.value as BackgroundKind })
              }
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                color: "var(--color-text)",
                fontSize: 13,
                outline: "none",
                marginBottom: 8,
              }}
            >
              <option value="none">{t("settings.bgNone")}</option>
              <option value="image">{t("settings.bgImage")}</option>
              <option value="video">{t("settings.bgVideo")}</option>
              <option value="url">{t("settings.bgUrl")}</option>
              <option value="shader">{t("settings.bgShader")}</option>
            </select>

            {(bg.kind === "image" || bg.kind === "video" || bg.kind === "url") && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  value={bg.source ?? ""}
                  onChange={(e) => patchBg({ source: e.target.value || null })}
                  placeholder={
                    bg.kind === "url"
                      ? t("settings.bgUrlPlaceholder")
                      : t("settings.bgFilePlaceholder")
                  }
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    color: "var(--color-text)",
                    fontSize: 12,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                {(bg.kind === "image" || bg.kind === "video") && (
                  <button
                    onClick={async () => {
                      const filters = bg.kind === "image"
                        ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"] }]
                        : [{ name: "Videos", extensions: ["mp4", "webm", "mov", "mkv", "avi"] }];
                      const selected = await openDialog({ multiple: false, filters }).catch(() => null);
                      if (typeof selected === "string") patchBg({ source: selected });
                    }}
                    title={t("settings.browseFile")}
                    style={{
                      background: "var(--color-surface-alt)",
                      border: "none",
                      color: "var(--color-text)",
                      borderRadius: 6,
                      padding: "0 10px",
                      cursor: "pointer",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {"\uD83D\uDCC2"}
                  </button>
                )}
              </div>
            )}

            {bg.kind === "shader" && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <select
                    value={bg.shader ?? ""}
                    onChange={(e) => patchBg({ shader: e.target.value || null })}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      color: "var(--color-text)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  >
                    {shaderList.length === 0 ? (
                      <option value="">{t("settings.bgShaderNone")}</option>
                    ) : (
                      <>
                        {!bg.shader && <option value="">—</option>}
                        {shaderList.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <button
                    onClick={refreshShaders}
                    title={t("settings.bgShaderRefresh")}
                    style={{
                      background: "var(--color-surface-alt)",
                      border: "none",
                      color: "var(--color-text)",
                      borderRadius: 6,
                      padding: "0 10px",
                      cursor: "pointer",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {"\u21bb"}
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {t("settings.bgShaderHint")}
                </div>
              </>
            )}

            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 4 }}>
                {t("settings.opacity")}: {(bg.opacity ?? 1).toFixed(2)}
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bg.opacity ?? 1}
                onChange={(e) =>
                  patchBg({ opacity: parseFloat(e.target.value) })
                }
                style={{ width: "100%" }}
              />
              <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
                {t("settings.opacityHint")}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginBottom: 4 }}>
                {t("settings.terminalOpacity")}: {(settings.terminal_opacity ?? 1).toFixed(2)}
              </div>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.05}
                value={settings.terminal_opacity ?? 1}
                onChange={(e) =>
                  updateSettings({ terminal_opacity: parseFloat(e.target.value) })
                }
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                id="wd-hdpi"
                checked={settings.is_hdpi ?? true}
                onChange={(e) => updateSettings({ is_hdpi: e.target.checked })}
                style={{ cursor: "pointer" }}
              />
              <label htmlFor="wd-hdpi" style={{ color: "var(--color-text)", fontSize: 12, cursor: "pointer" }}>
                {t("settings.isHdpi")}
              </label>
            </div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
              {t("settings.isHdpiHint")}
            </div>
          </div>

          {/* Integrations */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.integrations")}</div>
            <IntegrationsSection />
          </div>

          {/* Environment variables injected into every new terminal */}
          <div style={sectionStyle}>
            <div style={labelStyle}>
              {t("settings.envOverrides", "Terminal environment variables")}
            </div>
            <div
              style={{
                color: "var(--color-text-muted)",
                fontSize: 11,
                lineHeight: 1.5,
                marginBottom: 8,
              }}
            >
              {t(
                "settings.envOverridesHint",
                "Injected into every new terminal. WODOUYAO_* keys are reserved."
              )}
            </div>
            {(settings.env_overrides ?? []).map((eo, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 4,
                  alignItems: "center",
                }}
              >
                <input
                  value={eo.key}
                  onChange={(e) => {
                    const next: EnvOverride[] = (
                      settings.env_overrides ?? []
                    ).map((x, i) => (i === idx ? { ...x, key: e.target.value } : x));
                    updateSettings({ env_overrides: next });
                  }}
                  placeholder="KEY"
                  spellCheck={false}
                  style={{
                    flex: "0 0 180px",
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    color: "var(--color-text)",
                    padding: "4px 8px",
                    fontSize: 12,
                    fontFamily:
                      "'SF Mono', 'Menlo', 'Monaco', monospace",
                    outline: "none",
                  }}
                />
                <input
                  value={eo.value}
                  onChange={(e) => {
                    const next: EnvOverride[] = (
                      settings.env_overrides ?? []
                    ).map((x, i) =>
                      i === idx ? { ...x, value: e.target.value } : x
                    );
                    updateSettings({ env_overrides: next });
                  }}
                  placeholder="value"
                  spellCheck={false}
                  style={{
                    flex: 1,
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    color: "var(--color-text)",
                    padding: "4px 8px",
                    fontSize: 12,
                    fontFamily:
                      "'SF Mono', 'Menlo', 'Monaco', monospace",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => {
                    const next = (settings.env_overrides ?? []).filter(
                      (_, i) => i !== idx
                    );
                    updateSettings({ env_overrides: next });
                  }}
                  title={t("settings.envOverrideRemove", "Remove")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-danger)",
                    cursor: "pointer",
                    fontSize: 13,
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                >
                  {"\u2715"}
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const next = [
                  ...(settings.env_overrides ?? []),
                  { key: "", value: "" },
                ];
                updateSettings({ env_overrides: next });
              }}
              style={{
                background: "var(--color-surface-alt)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: 4,
                padding: "4px 12px",
                fontSize: 11,
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              {"+ "}
              {t("settings.envOverrideAdd", "Add variable")}
            </button>
          </div>

          {/* Quick Commands */}
          <div style={sectionStyle}>
            <div style={labelStyle}>{t("settings.quickCommands")}</div>
            {settings.quick_commands.map((cmd) => (
              <div
                key={cmd.id}
                style={{
                  background: "var(--color-bg)",
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                {editingCmd === cmd.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder={t("settings.label")}
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 4,
                        color: "var(--color-text)",
                        padding: "4px 8px",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                    <input
                      value={editCommand}
                      onChange={(e) => setEditCommand(e.target.value)}
                      placeholder={t("settings.command")}
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 4,
                        color: "var(--color-text)",
                        padding: "4px 8px",
                        fontSize: 13,
                        fontFamily: "monospace",
                        outline: "none",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={saveEditCmd}
                        style={{
                          background: "var(--color-accent)",
                          color: "var(--color-bg-alt)",
                          border: "none",
                          borderRadius: 4,
                          padding: "4px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {t("settings.save")}
                      </button>
                      <button
                        onClick={() => setEditingCmd(null)}
                        style={{
                          background: "var(--color-surface-alt)",
                          color: "var(--color-text)",
                          border: "none",
                          borderRadius: 4,
                          padding: "4px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {t("settings.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ color: "var(--color-text)", fontSize: 13 }}>
                        {cmd.label}
                      </div>
                      <div
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: 11,
                          fontFamily: "monospace",
                        }}
                      >
                        $ {cmd.command}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button
                        onClick={() => startEditCmd(cmd)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--color-text-muted)",
                          cursor: "pointer",
                          fontSize: 12,
                          padding: "2px 8px",
                        }}
                      >
                        {t("settings.edit")}
                      </button>
                      <button
                        onClick={() => deleteQuickCmd(cmd.id)}
                        title={t("settings.delete")}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--color-danger)",
                          cursor: "pointer",
                          fontSize: 12,
                          padding: "2px 8px",
                        }}
                      >
                        {"\u2715"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={addQuickCmd}
              style={{
                background: "var(--color-bg)",
                border: "1px dashed var(--color-border)",
                borderRadius: 6,
                color: "var(--color-accent)",
                cursor: "pointer",
                padding: "8px 12px",
                fontSize: 12,
                width: "100%",
                marginTop: 4,
              }}
            >
              {t("settings.addQuickCommand")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
