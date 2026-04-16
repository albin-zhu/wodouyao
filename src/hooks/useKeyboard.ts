import { useEffect } from "react";
import { useCommandStore } from "../store/commandStore";

export function useKeyboard() {
  const togglePalette = useCommandStore((s) => s.togglePalette);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePalette]);
}
