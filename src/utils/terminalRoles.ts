import type { TerminalRole } from "../types/terminal";
import type { Role } from "../types/role";

export interface RoleMeta {
  label: string;
  color: string;
  glyph: string;
  hint: string;
}

/** Live snapshot of all roles, keyed by lowercase id. Populated at app
 *  boot from `roles_list` IPC; until then it's empty and pickers will
 *  briefly show no options. Mutated in place by `applyRolesSnapshot` so
 *  existing call sites that read `BUILTIN_ROLES[role]` continue to work
 *  without subscribing to the role store. */
export const BUILTIN_ROLES: Record<string, RoleMeta> = {};

/** Picker order — keys in ascending `order` field, ties broken by key. */
export const ROLE_ORDER: TerminalRole[] = [];

/** Backwards-compat alias kept for existing imports. */
export const TERMINAL_ROLES = BUILTIN_ROLES;

/** Called by `roleStore.hydrate()` to publish the latest backend list into
 *  this module's mutable maps. Idempotent. */
export function applyRolesSnapshot(roles: Role[]): void {
  // Wipe and refill so deletions on disk propagate.
  for (const k of Object.keys(BUILTIN_ROLES)) delete BUILTIN_ROLES[k];
  ROLE_ORDER.length = 0;

  const sorted = [...roles].sort(
    (a, b) => a.order - b.order || a.key.localeCompare(b.key)
  );
  for (const r of sorted) {
    const key = r.key.toLowerCase();
    BUILTIN_ROLES[key] = {
      label: r.name || key,
      color: r.color || "var(--color-text-muted)",
      glyph: r.glyph || "",
      hint: r.hint || "",
    };
    ROLE_ORDER.push(key);
  }
}

/** Merge built-in + user-defined roles. User entries win on key collision. */
export function resolveRoles(
  custom: RoleMeta[] | undefined,
  customKeys?: string[]
): Record<string, RoleMeta> {
  if (!custom || custom.length === 0) return BUILTIN_ROLES;
  const out: Record<string, RoleMeta> = { ...BUILTIN_ROLES };
  custom.forEach((meta, i) => {
    const key = customKeys?.[i] ?? meta.label.toLowerCase().replace(/\s+/g, "-");
    out[key] = meta;
  });
  return out;
}
