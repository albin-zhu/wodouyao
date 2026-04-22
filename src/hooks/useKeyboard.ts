import { useEffect } from "react";
import { useCommandStore } from "../store/commandStore";
import { useCanvasStore } from "../store/canvasStore";

export function useKeyboard() {
  const togglePalette = useCommandStore((s) => s.togglePalette);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        togglePalette();
      }
      // Zen mode: hide all UI chrome (toolbar + canvas controls).
      // F11 on Windows/Linux, Cmd+F11 on macOS (plain F11 is taken by macOS
      // for Show Desktop). Cmd/Ctrl+Shift+F11 → toggle click-through (the
      // escape hatch when the desktop swallows your clicks).
      if (e.key === "F11") {
        const isMac = navigator.platform.toLowerCase().includes("mac");
        const modKey = isMac ? e.metaKey : e.ctrlKey;
        if (e.shiftKey && modKey) {
          e.preventDefault();
          useCanvasStore.getState().toggleClickThrough();
          return;
        }
        if ((isMac && e.metaKey) || (!isMac && !e.metaKey && !e.ctrlKey)) {
          e.preventDefault();
          useCanvasStore.getState().toggleZenMode();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette]);
}
