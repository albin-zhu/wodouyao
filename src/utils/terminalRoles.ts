import type { TerminalRole } from "../types/terminal";

export interface RoleMeta {
  label: string;
  color: string;
  glyph: string;
  hint: string;
}

export const TERMINAL_ROLES: Record<TerminalRole, RoleMeta> = {
  planner: { label: "planner", color: "var(--color-accent-alt)", glyph: "\u25C6", hint: "designs plans / writes notes" },
  generator: { label: "generator", color: "var(--color-success)", glyph: "\u25B2", hint: "writes code" },
  evaluator: { label: "evaluator", color: "var(--color-danger)", glyph: "\u25D0", hint: "runs tests / reviews" },
  researcher: { label: "researcher", color: "var(--color-info)", glyph: "?", hint: "explores / asks questions" },
  shell: { label: "shell", color: "var(--color-text-muted)", glyph: ">", hint: "plain shell" },
};

export const ROLE_ORDER: TerminalRole[] = [
  "planner",
  "generator",
  "evaluator",
  "researcher",
  "shell",
];
