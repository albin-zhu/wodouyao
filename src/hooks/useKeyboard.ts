import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCommandStore } from "../store/commandStore";

export function useKeyboard() {
  const togglePalette = useCommandStore((s) => s.togglePalette);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        togglePalette();
      }
      if (e.key === "F11") {
        e.preventDefault();
        const win = getCurrentWindow();
        win.isFullscreen().then((full) => win.setFullscreen(!full)).catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette]);
}
