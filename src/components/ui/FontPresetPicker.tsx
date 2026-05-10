import { useState } from "react";

/**
 * Font picker — replaces a free-form CSS `font-family` input with a curated
 * dropdown of presets, each tuned for one common Chinese-developer setup:
 *
 *   ASCII : `JetBrains Mono` (always available — bundled webfont)
 *   CJK   : whichever installed CJK mono the chain finds first
 *
 * Picking a preset writes the entire CSS chain into `font_family`, so the
 * persisted value is back-compat with anyone who used the old text input.
 * "Custom" reveals the original input for power users.
 */

export interface FontPreset {
  id: string;
  label: string;
  description: string;
  family: string;
  installHint?: string;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: "default",
    label: "默认（中英混合，推荐）",
    description: "JetBrains Mono ASCII + 系统 CJK 等宽字体逐级回退。",
    family:
      "'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', 'SF Mono', 'Cascadia Code', 'Sarasa Term SC', 'Maple Mono CN', 'LXGW WenKai Mono', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Source Han Sans CN', 'Noto Sans Mono CJK SC', monospace",
  },
  {
    id: "sarasa",
    label: "Sarasa Term SC（中文程序员首选）",
    description: "等宽中英对齐（CJK 是 ASCII 的 2x 宽），13px 起就清晰。",
    family:
      "'Sarasa Term SC', 'Sarasa Mono SC', 'JetBrains Mono', monospace",
    installHint: "https://github.com/be5invis/Sarasa-Gothic/releases",
  },
  {
    id: "maple",
    label: "Maple Mono CN（圆润现代）",
    description: "近年流行的中英等宽，圆角风格，连字（ligature）丰富。",
    family: "'Maple Mono CN', 'Maple Mono NF CN', 'Maple Mono', 'JetBrains Mono', monospace",
    installHint: "https://github.com/subframe7536/maple-font/releases",
  },
  {
    id: "lxgw",
    label: "LXGW WenKai Mono（楷体风）",
    description: "霞鹜文楷书法体，适合大字号文档场景，13px 偏糊。",
    family:
      "'LXGW WenKai Mono', 'LXGW WenKai', 'JetBrains Mono', monospace",
    installHint: "https://github.com/lxgw/LxgwWenKai/releases",
  },
  {
    id: "ascii-only",
    label: "JetBrains Mono（仅 ASCII，CJK 走系统）",
    description: "Latin 完全用 bundled JetBrains Mono，中文回退到系统默认。",
    family:
      "'JetBrains Mono', 'PingFang SC', 'Microsoft YaHei', 'Source Han Sans CN', monospace",
  },
  {
    id: "system",
    label: "系统等宽（无依赖）",
    description: "完全用操作系统自带的等宽字体，零依赖。",
    family:
      "ui-monospace, 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Consolas', 'PingFang SC', 'Microsoft YaHei', monospace",
  },
];

const CUSTOM_ID = "__custom__";

function detectPresetId(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  for (const p of FONT_PRESETS) {
    const normalized = p.family.trim().replace(/\s+/g, " ");
    if (normalized === trimmed) return p.id;
  }
  return CUSTOM_ID;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  inputStyle: React.CSSProperties;
}

export default function FontPresetPicker({ value, onChange, inputStyle }: Props) {
  const detected = detectPresetId(value);
  // Latch onto whichever preset matched (or "custom" if none did) so the
  // dropdown's chosen item stays consistent across re-renders.
  const [pickerValue, setPickerValue] = useState(detected);
  const isCustom = pickerValue === CUSTOM_ID || detected === CUSTOM_ID;
  const activePreset = FONT_PRESETS.find((p) => p.id === pickerValue);

  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setPickerValue(id);
    if (id === CUSTOM_ID) {
      // Don't overwrite custom string — let user keep editing.
      return;
    }
    const preset = FONT_PRESETS.find((p) => p.id === id);
    if (preset) onChange(preset.family);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        value={pickerValue === CUSTOM_ID ? CUSTOM_ID : detected}
        onChange={onSelect}
        style={{
          ...inputStyle,
          appearance: "none",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%23565f89'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          paddingRight: 28,
        }}
      >
        {FONT_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value={CUSTOM_ID}>自定义...</option>
      </select>

      {/* Live preview rendered in the chosen font so user can eyeball it */}
      <div
        style={{
          padding: "8px 10px",
          background: "var(--color-bg-alt)",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          fontFamily: value,
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--color-text)",
          whiteSpace: "pre",
          overflow: "auto",
        }}
        title="Preview"
      >
        {`你好，世界 hello world\nconst x = 1 + 2; // 注释 comment\n中英对齐: 中文 ABC 12345`}
      </div>

      <div style={{ color: "var(--color-text-muted)", fontSize: 10, lineHeight: 1.4 }}>
        {activePreset?.description ?? "Custom CSS font-family chain"}
        {activePreset?.installHint && (
          <>
            {" "}
            未安装？下载：
            <a
              href={activePreset.installHint}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-accent)" }}
            >
              {activePreset.installHint.replace(/^https?:\/\//, "")}
            </a>
          </>
        )}
      </div>

      {isCustom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder="'Your Font', 'Fallback', monospace"
          style={inputStyle}
        />
      )}
    </div>
  );
}
