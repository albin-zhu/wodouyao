import type { TerminalRole } from "../types/terminal";

export interface RoleMeta {
  label: string;
  color: string;
  glyph: string;
  hint: string;
}

export const TERMINAL_ROLES: Record<TerminalRole, RoleMeta> = {
  planner: { label: "planner", color: "#bb9af7", glyph: "\u25C6", hint: "designs plans / writes notes" },
  generator: { label: "generator", color: "#9ece6a", glyph: "\u25B2", hint: "writes code" },
  evaluator: { label: "evaluator", color: "#f7768e", glyph: "\u25D0", hint: "runs tests / reviews" },
  researcher: { label: "researcher", color: "#7dcfff", glyph: "?", hint: "explores / asks questions" },
  shell: { label: "shell", color: "#565f89", glyph: ">", hint: "plain shell" },
};

export const ROLE_ORDER: TerminalRole[] = [
  "planner",
  "generator",
  "evaluator",
  "researcher",
  "shell",
];
