import { create } from "zustand";
import type { AppSettings } from "../types/settings";
import { getSettings, updateSettings as updateSettingsApi } from "../services/tauriCommands";

interface SettingsStore {
  settings: AppSettings | null;
  drawerOpen: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  drawerOpen: false,

  loadSettings: async () => {
    try {
      const settings = await getSettings();
      set({ settings });
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  updateSettings: async (patch) => {
    const current = get().settings;
    if (!current) return;
    const updated = { ...current, ...patch };
    set({ settings: updated });
    try {
      await updateSettingsApi(updated);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  },

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
