import { useTranslation } from "react-i18next";
import type { TerminalOptions } from "../../types/settings";

interface Props {
  opts: TerminalOptions;
  onPatch: (patch: Partial<TerminalOptions>) => void;
}

// ── shared primitives ─────────────────────────────────────────────────────

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
  textTransform: "uppercase",
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

const sliderRow: React.CSSProperties = {
  padding: "8px 0",
  borderBottom: "1px solid var(--color-border)",
};

const lastSliderRow: React.CSSProperties = {
  padding: "8px 0",
};

const rowLabel: React.CSSProperties = {
  color: "var(--color-text)",
  fontSize: 12,
  flexShrink: 0,
};

const rowValue: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: 11,
};

const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  padding: "8px 0",
  borderBottom: "1px solid var(--color-border)",
};

const lastCheckRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  padding: "8px 0",
};

const stepperBtn: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  borderRadius: 4,
  width: 26,
  height: 26,
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
};

const smallSelect: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 5,
  color: "var(--color-text)",
  fontSize: 12,
  padding: "4px 6px",
  outline: "none",
};

const smallInput: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 5,
  color: "var(--color-text)",
  fontSize: 12,
  padding: "4px 8px",
  outline: "none",
  textAlign: "right" as const,
};

// ── component ─────────────────────────────────────────────────────────────

export default function TerminalOptionsSection({ opts, onPatch }: Props) {
  const { t } = useTranslation();

  const cursorStyleLabels: Record<string, string> = {
    block: t("settings.term.cursorStyleBlock"),
    underline: t("settings.term.cursorStyleUnder"),
    bar: t("settings.term.cursorStyleBar"),
  };

  const inactiveStyleLabels: Record<string, string> = {
    outline: t("settings.term.cursorInactiveOutline"),
    block: t("settings.term.cursorInactiveBlock"),
    bar: t("settings.term.cursorInactiveBar"),
    underline: t("settings.term.cursorInactiveUnderline"),
    none: t("settings.term.cursorInactiveNone"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Font ── */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.term.font")}</div>

        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.term.fontSize")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => opts.font_size > 8 && onPatch({ font_size: opts.font_size - 1 })} style={stepperBtn}>−</button>
            <span style={{ ...rowValue, minWidth: 24, textAlign: "center", color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>
              {opts.font_size}
            </span>
            <button onClick={() => opts.font_size < 32 && onPatch({ font_size: opts.font_size + 1 })} style={stepperBtn}>+</button>
          </div>
        </div>

        <div style={{ ...sliderRow, display: "flex", flexDirection: "column" as const }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={rowLabel}>{t("settings.term.lineHeight")}</span>
            <span style={rowValue}>{opts.line_height.toFixed(2)}</span>
          </div>
          <input type="range" min={0.8} max={2} step={0.05} value={opts.line_height}
            onChange={(e) => onPatch({ line_height: parseFloat(e.target.value) })}
            style={{ width: "100%" }} />
        </div>

        <div style={{ ...lastSliderRow, display: "flex", flexDirection: "column" as const }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={rowLabel}>{t("settings.term.letterSpacing")}</span>
            <span style={rowValue}>{opts.letter_spacing} px</span>
          </div>
          <input type="range" min={-2} max={10} step={0.5} value={opts.letter_spacing}
            onChange={(e) => onPatch({ letter_spacing: parseFloat(e.target.value) })}
            style={{ width: "100%" }} />
        </div>
      </div>

      {/* Font family — own card for the wide input */}
      <div style={{ ...card, marginBottom: 8 }}>
        <div style={cardHeader}>{t("settings.term.fontFamily")}</div>
        <div style={{ padding: "10px 0" }}>
          <input
            value={opts.font_family}
            onChange={(e) => onPatch({ font_family: e.target.value })}
            spellCheck={false}
            style={{
              width: "100%",
              padding: "7px 10px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              color: "var(--color-text)",
              fontSize: 11,
              fontFamily: "'SF Mono','Menlo','Monaco',monospace",
              outline: "none",
              boxSizing: "border-box" as const,
            }}
          />
          <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 5, lineHeight: 1.4 }}>
            {t("settings.term.fontFamilyHint")}
          </div>
        </div>
      </div>

      {/* ── Cursor ── */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.term.cursor")}</div>

        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.term.cursorStyle")}</span>
          <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 5, overflow: "hidden" }}>
            {(["block", "underline", "bar"] as const).map((s, i) => {
              const active = opts.cursor_style === s;
              return (
                <button key={s} onClick={() => onPatch({ cursor_style: s })} style={{
                  background: active ? "var(--color-accent)" : "var(--color-surface)",
                  color: active ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                  border: "none",
                  borderRight: i < 2 ? "1px solid var(--color-border)" : "none",
                  padding: "5px 11px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                }}>
                  {cursorStyleLabels[s]}
                </button>
              );
            })}
          </div>
        </div>

        {opts.cursor_style === "bar" && (
          <div style={settingRow}>
            <span style={rowLabel}>{t("settings.term.cursorBarWidth")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => opts.cursor_width > 1 && onPatch({ cursor_width: opts.cursor_width - 1 })} style={stepperBtn}>−</button>
              <span style={{ ...rowValue, minWidth: 36, textAlign: "center", color: "var(--color-text)" }}>{opts.cursor_width} px</span>
              <button onClick={() => opts.cursor_width < 10 && onPatch({ cursor_width: opts.cursor_width + 1 })} style={stepperBtn}>+</button>
            </div>
          </div>
        )}

        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.term.cursorInactiveStyle")}</span>
          <select value={opts.cursor_inactive_style}
            onChange={(e) => onPatch({ cursor_inactive_style: e.target.value as TerminalOptions["cursor_inactive_style"] })}
            style={smallSelect}>
            {(["outline", "block", "bar", "underline", "none"] as const).map((v) => (
              <option key={v} value={v}>{inactiveStyleLabels[v]}</option>
            ))}
          </select>
        </div>

        <label style={lastCheckRow}>
          <input type="checkbox" checked={opts.cursor_blink}
            onChange={(e) => onPatch({ cursor_blink: e.target.checked })} style={{ margin: 0 }} />
          <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.term.cursorBlink")}</span>
        </label>
      </div>

      {/* ── Scrollback ── */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.term.scrollback")}</div>

        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.term.scrollbackLines")}</span>
          <input type="number" min={100} max={100000} step={1000} value={opts.scrollback}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 100 && v <= 100000) onPatch({ scrollback: v }); }}
            style={{ ...smallInput, width: 76 }} />
        </div>

        <div style={{ ...sliderRow, display: "flex", flexDirection: "column" as const }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={rowLabel}>{t("settings.term.scrollSpeed")}</span>
            <span style={rowValue}>{opts.scroll_sensitivity}×</span>
          </div>
          <input type="range" min={0.5} max={10} step={0.5} value={opts.scroll_sensitivity}
            onChange={(e) => onPatch({ scroll_sensitivity: parseFloat(e.target.value) })}
            style={{ width: "100%" }} />
        </div>

        <div style={settingRow}>
          <span style={rowLabel}>{t("settings.term.fastScrollKey")}</span>
          <select value={opts.fast_scroll_modifier}
            onChange={(e) => onPatch({ fast_scroll_modifier: e.target.value as TerminalOptions["fast_scroll_modifier"] })}
            style={smallSelect}>
            {(["alt", "ctrl", "shift", "none"] as const).map((v) => (
              <option key={v} value={v}>
                {v === "none" ? t("settings.term.fastScrollDisabled") : v.charAt(0).toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {opts.fast_scroll_modifier !== "none" && (
          <div style={{ ...sliderRow, display: "flex", flexDirection: "column" as const }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ ...rowLabel, color: "var(--color-text-muted)" }}>{t("settings.term.fastSpeed")}</span>
              <span style={rowValue}>{opts.fast_scroll_sensitivity}×</span>
            </div>
            <input type="range" min={1} max={20} step={1} value={opts.fast_scroll_sensitivity}
              onChange={(e) => onPatch({ fast_scroll_sensitivity: parseFloat(e.target.value) })}
              style={{ width: "100%" }} />
          </div>
        )}

        <div style={{ ...lastSliderRow, display: "flex", flexDirection: "column" as const }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={rowLabel}>{t("settings.term.smoothScroll")}</span>
            <span style={rowValue}>
              {opts.smooth_scroll_duration === 0
                ? t("settings.term.smoothScrollOff")
                : `${opts.smooth_scroll_duration} ms`}
            </span>
          </div>
          <input type="range" min={0} max={500} step={10} value={opts.smooth_scroll_duration}
            onChange={(e) => onPatch({ smooth_scroll_duration: parseInt(e.target.value, 10) })}
            style={{ width: "100%" }} />
        </div>
      </div>

      {/* ── Rendering ── */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.term.rendering")}</div>

        <label style={checkRow}>
          <input type="checkbox" checked={opts.custom_glyphs}
            onChange={(e) => onPatch({ custom_glyphs: e.target.checked })} style={{ margin: 0 }} />
          <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.term.customGlyphs")}</span>
        </label>

        <label style={checkRow}>
          <input type="checkbox" checked={opts.draw_bold_text_in_bright_colors}
            onChange={(e) => onPatch({ draw_bold_text_in_bright_colors: e.target.checked })} style={{ margin: 0 }} />
          <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.term.boldBrightColors")}</span>
        </label>

        <div style={{ ...lastSliderRow, display: "flex", flexDirection: "column" as const }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={rowLabel}>{t("settings.term.minContrastRatio")}</span>
            <span style={rowValue}>{opts.minimum_contrast_ratio.toFixed(1)}</span>
          </div>
          <input type="range" min={1} max={21} step={0.5} value={opts.minimum_contrast_ratio}
            onChange={(e) => onPatch({ minimum_contrast_ratio: parseFloat(e.target.value) })}
            style={{ width: "100%" }} />
          <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 4 }}>
            {t("settings.term.contrastHint")}
          </div>
        </div>
      </div>

      {/* ── Behavior ── */}
      <div style={card}>
        <div style={cardHeader}>{t("settings.term.behavior")}</div>

        <label style={checkRow}>
          <input type="checkbox" checked={opts.mac_option_is_meta}
            onChange={(e) => onPatch({ mac_option_is_meta: e.target.checked })} style={{ margin: 0 }} />
          <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.term.macOptionMeta")}</span>
        </label>

        <label style={lastCheckRow}>
          <input type="checkbox" checked={opts.right_click_selects_word}
            onChange={(e) => onPatch({ right_click_selects_word: e.target.checked })} style={{ margin: 0 }} />
          <span style={{ color: "var(--color-text)", fontSize: 12 }}>{t("settings.term.rightClickSelectsWord")}</span>
        </label>
      </div>

    </div>
  );
}
