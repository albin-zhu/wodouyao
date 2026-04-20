import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../store/settingsStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import type {
  BackgroundKind,
  BackgroundSettings,
  EnvOverride,
  ParticlePreset,
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

  useEffect(() => {
    if (drawerOpen) {
      setCwdInput(workspaceCwd ?? "");
    }
  }, [drawerOpen, workspaceCwd]);

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
    borderBottom: "1px solid #292e42",
  };

  const labelStyle: React.CSSProperties = {
    color: "#7aa2f7",
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
          background: "#1f2335",
          borderLeft: "1px solid #292e42",
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
            borderBottom: "1px solid #292e42",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#c0caf5", fontWeight: 600, fontSize: 14 }}>
            {t("settings.title")}
          </span>
          <button
            onClick={closeDrawer}
            style={{
              background: "none",
              border: "none",
              color: "#565f89",
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
                background: "#13141b",
                border: "1px solid #292e42",
                borderRadius: 6,
                color: "#c0caf5",
                fontSize: 13,
                outline: "none",
              }}
            >
              <option value="en">English</option>
              <option value="zh">{"\u4E2D\u6587"}</option>
            </select>
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
                  background: "#13141b",
                  border: "1px solid #292e42",
                  borderRadius: 6,
                  color: "#c0caf5",
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
                  background: "#292e42",
                  border: "none",
                  color: "#c0caf5",
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
                    background: "#292e42",
                    border: "none",
                    color: "#565f89",
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
            <div style={{ color: "#565f89", fontSize: 11, marginTop: 4 }}>
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
                  background: "#292e42",
                  border: "none",
                  color: "#c0caf5",
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
                  color: "#c0caf5",
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
                  background: "#292e42",
                  border: "none",
                  color: "#c0caf5",
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
                background: "#13141b",
                border: "1px solid #292e42",
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
                      background: active ? "#7aa2f7" : "transparent",
                      color: active ? "#1a1b26" : "#c0caf5",
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
            <div style={{ color: "#565f89", fontSize: 11, marginTop: 6 }}>
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
              <span style={{ color: "#c0caf5", fontSize: 13 }}>
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
                  background: "#13141b",
                  border: "1px solid #292e42",
                  borderRadius: 6,
                  color: "#c0caf5",
                  fontSize: 12,
                  fontFamily: "monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
            <div style={{ color: "#565f89", fontSize: 11, marginTop: 6 }}>
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
                background: "#13141b",
                border: "1px solid #292e42",
                borderRadius: 6,
                color: "#c0caf5",
                fontSize: 13,
                outline: "none",
                marginBottom: 8,
              }}
            >
              <option value="none">{t("settings.bgNone")}</option>
              <option value="image">{t("settings.bgImage")}</option>
              <option value="video">{t("settings.bgVideo")}</option>
              <option value="url">{t("settings.bgUrl")}</option>
              <option value="particles">{t("settings.bgParticles")}</option>
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
                    background: "#13141b",
                    border: "1px solid #292e42",
                    borderRadius: 6,
                    color: "#c0caf5",
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
                      background: "#292e42",
                      border: "none",
                      color: "#c0caf5",
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

            {bg.kind === "particles" && (
              <select
                value={bg.particle ?? "matrix"}
                onChange={(e) =>
                  patchBg({ particle: e.target.value as ParticlePreset })
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#13141b",
                  border: "1px solid #292e42",
                  borderRadius: 6,
                  color: "#c0caf5",
                  fontSize: 13,
                  outline: "none",
                  marginBottom: 8,
                }}
              >
                <option value="matrix">{t("settings.particleMatrix")}</option>
                <option value="starfield">{t("settings.particleStarfield")}</option>
                <option value="wave">{t("settings.particleWave")}</option>
                <option value="dust">{t("settings.particleDust")}</option>
              </select>
            )}

            {bg.kind !== "none" && (
              <div>
                <div style={{ color: "#565f89", fontSize: 11, marginBottom: 4 }}>
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
              </div>
            )}
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
                color: "#565f89",
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
                    background: "#13141b",
                    border: "1px solid #292e42",
                    borderRadius: 4,
                    color: "#c0caf5",
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
                    background: "#13141b",
                    border: "1px solid #292e42",
                    borderRadius: 4,
                    color: "#c0caf5",
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
                    color: "#f7768e",
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
                background: "#292e42",
                color: "#c0caf5",
                border: "1px solid #3b4261",
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
                  background: "#13141b",
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
                        background: "#1f2335",
                        border: "1px solid #292e42",
                        borderRadius: 4,
                        color: "#c0caf5",
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
                        background: "#1f2335",
                        border: "1px solid #292e42",
                        borderRadius: 4,
                        color: "#c0caf5",
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
                          background: "#7aa2f7",
                          color: "#1a1b26",
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
                          background: "#292e42",
                          color: "#c0caf5",
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
                      <div style={{ color: "#c0caf5", fontSize: 13 }}>
                        {cmd.label}
                      </div>
                      <div
                        style={{
                          color: "#565f89",
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
                          color: "#565f89",
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
                          color: "#f7768e",
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
                background: "#13141b",
                border: "1px dashed #292e42",
                borderRadius: 6,
                color: "#7aa2f7",
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
