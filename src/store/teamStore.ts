import { create } from "zustand";
import type { Team } from "../types/team";
import {
  teamsList,
  teamsDissolve,
} from "../services/tauriCommands";

interface TeamStore {
  teams: Map<string, Team>;
  drawerOpen: boolean;
  hydrate: () => Promise<void>;
  getTeamForTerminal: (term_id: string) => Team | undefined;
  dissolve: (team_id: string) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  teams: new Map(),
  drawerOpen: false,

  hydrate: async () => {
    try {
      const list = await teamsList();
      const next = new Map<string, Team>();
      for (const t of list) next.set(t.id, t);
      set({ teams: next });
    } catch (e) {
      console.error("Failed to hydrate teams:", e);
    }
  },

  getTeamForTerminal: (term_id: string) => {
    for (const team of get().teams.values()) {
      if (team.members.some((m) => m.term_id === term_id)) return team;
    }
    return undefined;
  },

  dissolve: async (team_id: string) => {
    try {
      await teamsDissolve(team_id);
      await get().hydrate();
    } catch (e) {
      console.error("Failed to dissolve team:", e);
    }
  },

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
