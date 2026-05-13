import { create } from "zustand";
import { rolesList } from "../services/tauriCommands";
import type { Role } from "../types/role";
import { applyRolesSnapshot } from "../utils/terminalRoles";

interface RoleStore {
  roles: Role[];
  byKey: Map<string, Role>;
  loaded: boolean;
  hydrate: () => Promise<void>;
}

export const useRoleStore = create<RoleStore>((set) => ({
  roles: [],
  byKey: new Map(),
  loaded: false,
  hydrate: async () => {
    try {
      const list = await rolesList();
      const map = new Map<string, Role>();
      for (const r of list) map.set(r.key.toLowerCase(), r);
      // Mirror into terminalRoles.ts module-level snapshots so the rest of
      // the codebase that reads BUILTIN_ROLES / ROLE_ORDER as constants
      // gets the live values without every component subscribing.
      applyRolesSnapshot(list);
      set({ roles: list, byKey: map, loaded: true });
    } catch (e) {
      console.error("roleStore.hydrate failed:", e);
    }
  },
}));
