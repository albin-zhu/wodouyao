import { create } from "zustand";
import type { Skill } from "../types/skill";
import { skillList, skillSave, skillDelete } from "../services/tauriCommands";
import { useWorkspaceStore } from "./workspaceStore";

interface SkillStore {
  skills: Skill[];
  loading: boolean;
  drawerOpen: boolean;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  loadSkills: () => Promise<void>;
  saveSkill: (skill: Skill, scope: "user" | "project", force?: boolean) => Promise<void>;
  deleteSkill: (name: string, scope: "user" | "project") => Promise<void>;
  getSkill: (name: string) => Skill | undefined;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  loading: false,
  drawerOpen: false,

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),

  loadSkills: async () => {
    set({ loading: true });
    try {
      const cwd = useWorkspaceStore.getState().currentWorkspaceCwd ?? undefined;
      const skills = await skillList(cwd);
      set({ skills, loading: false });
    } catch (e) {
      set({ loading: false });
      console.error("[skillStore] load failed:", e);
    }
  },

  saveSkill: async (skill, scope, force = false) => {
    const cwd = useWorkspaceStore.getState().currentWorkspaceCwd ?? ".";
    await skillSave(skill, scope, cwd, force);
    await get().loadSkills();
  },

  deleteSkill: async (name, scope) => {
    const cwd = useWorkspaceStore.getState().currentWorkspaceCwd ?? ".";
    await skillDelete(name, scope, cwd);
    set({ skills: get().skills.filter((s) => s.name !== name) });
  },

  getSkill: (name) => get().skills.find((s) => s.name === name),
}));
