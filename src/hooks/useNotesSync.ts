import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNoteStore } from "../store/noteStore";
import { notesList } from "../services/tauriCommands";

export function useNotesSync() {
  useEffect(() => {
    const sync = () => {
      notesList()
        .then((notes) => useNoteStore.getState().syncFromRust(notes))
        .catch(() => {});
    };
    const unlistenPromise = listen("notes-updated", sync);
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);
}
