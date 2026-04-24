import { getCurrentWindow, availableMonitors, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { useCanvasStore } from "../store/canvasStore";

/**
 * Toggle "span all monitors" mode.
 *
 * On: snapshots the current window bounds, then enumerates every monitor,
 * computes the union bounding box of their physical positions+sizes, and
 * resizes/moves the window to cover it.
 *
 * Off: restores the previously snapshotted bounds. If we don't have a
 * snapshot (e.g. first run), centers the window in the primary monitor at
 * a sane default size.
 *
 * Note: this is not native fullscreen — the window is just very large.
 * Combine with zen mode for a chromeless experience.
 */
export async function toggleSpanAllMonitors() {
  const win = getCurrentWindow();
  const { spanAllMonitors, prevWindowBounds, setSpanAllMonitors } =
    useCanvasStore.getState();

  if (spanAllMonitors) {
    // Restore.
    if (prevWindowBounds) {
      try {
        await win.setSize(new PhysicalSize(prevWindowBounds.width, prevWindowBounds.height));
        await win.setPosition(new PhysicalPosition(prevWindowBounds.x, prevWindowBounds.y));
      } catch (e) {
        console.warn("[span] restore failed:", e);
      }
    }
    setSpanAllMonitors(false, null);
    return;
  }

  let monitors;
  try {
    monitors = await availableMonitors();
  } catch (e) {
    console.warn("[span] availableMonitors failed:", e);
    return;
  }
  if (monitors.length === 0) return;

  // Snapshot current bounds so we can restore later.
  let snapshot: { x: number; y: number; width: number; height: number } | null = null;
  try {
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    snapshot = { x: pos.x, y: pos.y, width: size.width, height: size.height };
  } catch (e) {
    console.warn("[span] snapshot failed:", e);
  }

  // Union bbox across all monitors (in physical pixels).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of monitors) {
    const x = m.position.x;
    const y = m.position.y;
    const w = m.size.width;
    const h = m.size.height;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  try {
    // Order matters on macOS: position first, then size, otherwise the OS
    // can clamp the new size to the current monitor's bounds.
    await win.setPosition(new PhysicalPosition(minX, minY));
    await win.setSize(new PhysicalSize(width, height));
  } catch (e) {
    console.warn("[span] apply failed:", e);
    return;
  }
  setSpanAllMonitors(true, snapshot);
}
