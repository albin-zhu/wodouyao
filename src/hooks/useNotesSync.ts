import { useEffect } from "react";
import { useNoteStore } from "../store/noteStore";
import { notesList } from "../services/tauriCommands";
import { subscribeJson } from "../services/transport";

export function useNotesSync() {
  useEffect(() => {
    const sync = () => {
      notesList()
        .then((notes) => useNoteStore.getState().syncFromRust(notes))
        .catch(() => {});
    };
    const unlistenPromise = subscribeJson("notes-updated", sync);
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);
}
