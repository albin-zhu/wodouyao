import type { TerminalRole } from "../../types/terminal";
import { TERMINAL_ROLES, ROLE_ORDER } from "../../utils/terminalRoles";

interface RolePickerProps {
  value?: TerminalRole;
  onChange: (role: TerminalRole | undefined) => void;
  /** When true, render compact (smaller padding) for use inside dialogs. */
  compact?: boolean;
  /** Allow clearing the role (only shown when compact=false). */
  allowNone?: boolean;
}

export default function RolePicker({ value, onChange, compact = false, allowNone = true }: RolePickerProps) {
  const padding = compact ? "3px 8px" : "4px 10px";
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {ROLE_ORDER.map((role) => {
        const meta = TERMINAL_ROLES[role];
        const active = value === role;
        return (
          <button
            key={role}
            onClick={() => onChange(active && allowNone ? undefined : role)}
            title={meta.hint}
            style={{
              background: active ? `${meta.color}33` : "transparent",
              color: active ? meta.color : "var(--color-text-muted)",
              border: `1px solid ${active ? meta.color : "var(--color-border-strong)"}`,
              borderRadius: 6,
              padding,
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>{meta.glyph}</span>
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
