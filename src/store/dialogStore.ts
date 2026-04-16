import { create } from "zustand";
import type { SpawnOptions } from "../hooks/useTerminal";

interface DialogStore {
  terminalCreateOpen: boolean;
  terminalCreateDefaults: Partial<SpawnOptions> | null;
  openTerminalCreate: (defaults?: Partial<SpawnOptions>) => void;
  closeTerminalCreate: () => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  terminalCreateOpen: false,
  terminalCreateDefaults: null,
  openTerminalCreate: (defaults) =>
    set({ terminalCreateOpen: true, terminalCreateDefaults: defaults ?? null }),
  closeTerminalCreate: () =>
    set({ terminalCreateOpen: false, terminalCreateDefaults: null }),
}));
