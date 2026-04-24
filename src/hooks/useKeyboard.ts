import { useEffect } from "react";
import { useCommandStore } from "../store/commandStore";
import { useCanvasStore } from "../store/canvasStore";
import { toggleSpanAllMonitors } from "../utils/spanMonitors";

export function useKeyboard() {
  const togglePalette = useCommandStore((s) => s.togglePalette);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        togglePalette();
      }
      // Zen mode: hide all UI chrome (toolbar + canvas controls).
      // F11 on Windows/Linux, Cmd+F11 on macOS (plain F11 is taken by
      // macOS for Show Desktop).
      if (e.key === "F11") {
        const isMac = navigator.platform.toLowerCase().includes("mac");
        if ((isMac && e.metaKey) || (!isMac && !e.metaKey && !e.ctrlKey)) {
          e.preventDefault();
          useCanvasStore.getState().toggleZenMode();
        }
      }
      // Span-all-monitors: Cmd+Shift+Enter (mac) / Ctrl+Shift+Enter.
      if (e.key === "Enter" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSpanAllMonitors();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette]);
}
