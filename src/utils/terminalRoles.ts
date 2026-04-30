import type { TerminalRole } from "../types/terminal";

export interface RoleMeta {
  label: string;
  color: string;
  glyph: string;
  hint: string;
}

/** Built-in roles. Users can extend / override via settings.custom_roles \u2014
 *  see resolveRoles() / useResolvedRoles for the merged view. Keep keys
 *  lowercase so `wodouyao task next --role X` matches case-insensitively. */
export const BUILTIN_ROLES: Record<string, RoleMeta> = {
  // Original wodouyao set \u2014 generic agent archetypes
  planner:    { label: "planner",    color: "var(--color-accent-alt)", glyph: "\u25C6", hint: "designs plans / writes notes" },
  generator:  { label: "generator",  color: "var(--color-success)",    glyph: "\u25B2", hint: "writes code" },
  evaluator:  { label: "evaluator",  color: "var(--color-danger)",     glyph: "\u25D0", hint: "runs tests / reviews" },
  researcher: { label: "researcher", color: "var(--color-info)",       glyph: "?",      hint: "explores / asks questions" },
  shell:      { label: "shell",      color: "var(--color-text-muted)", glyph: ">",      hint: "plain shell" },
  // Workflow-oriented set \u2014 task-master style team roles
  pm:         { label: "PM",         color: "var(--color-warning)",    glyph: "\u2605", hint: "coordinates work, parses PRDs, watches for stuck tasks" },
  architect:  { label: "architect",  color: "var(--color-accent)",     glyph: "\u25EF", hint: "system design, picks patterns" },
  backend:    { label: "backend",    color: "var(--color-info)",       glyph: "\u25A0", hint: "server / API / database" },
  frontend:   { label: "frontend",   color: "var(--color-accent-alt)", glyph: "\u25CB", hint: "UI / UX / client" },
  qa:         { label: "QA",         color: "var(--color-danger)",     glyph: "\u2713", hint: "tests, validates acceptance criteria" },
  devops:     { label: "devops",     color: "var(--color-success)",    glyph: "\u2699", hint: "build, deploy, infra" },
  designer:   { label: "designer",   color: "var(--color-warning-alt)",glyph: "\u270E", hint: "visual design, mocks" },
};

/** Default ordering for pickers. Workflow roles first (most useful for new
 *  users), generic archetypes after. */
export const ROLE_ORDER: TerminalRole[] = [
  "pm", "architect", "backend", "frontend", "qa", "devops", "designer",
  "planner", "generator", "evaluator", "researcher", "shell",
];

/** Backwards-compat alias. Old code reads TERMINAL_ROLES directly without
 *  custom-roles support; new code should use resolveRoles(custom). */
export const TERMINAL_ROLES = BUILTIN_ROLES;

/** Merge built-in + user-defined roles. User entries win on key collision so
 *  the user can re-skin a built-in (e.g. recolor "backend"). */
export function resolveRoles(custom: RoleMeta[] | undefined, customKeys?: string[]): Record<string, RoleMeta> {
  if (!custom || custom.length === 0) return BUILTIN_ROLES;
  const out: Record<string, RoleMeta> = { ...BUILTIN_ROLES };
  custom.forEach((meta, i) => {
    const key = customKeys?.[i] ?? meta.label.toLowerCase().replace(/\s+/g, "-");
    out[key] = meta;
  });
  return out;
}
