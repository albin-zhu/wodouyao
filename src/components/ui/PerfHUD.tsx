import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useWireStore } from "../../store/wireStore";

interface PerfStats {
  fps: number;
  /** 95th percentile frame time over the rolling window (ms). */
  frameP95: number;
  /** Worst frame in the window — useful for spotting hitches. */
  frameMax: number;
  jsHeapMB: number | null;
}

const WINDOW_FRAMES = 60;

/**
 * Lightweight FPS / frame-time / heap HUD pinned to the bottom-right.
 * Driven by requestAnimationFrame so it measures real composited frames,
 * not just React renders. Mounting/unmounting is controlled by
 * `settings.show_perf_hud`. Costs ~1 rAF/frame and one re-render every
 * 500ms, which is negligible compared to the canvas + terminal rendering.
 */
export default function PerfHUD() {
  const enabled = useSettingsStore((s) => s.settings?.show_perf_hud ?? false);
  const [stats, setStats] = useState<PerfStats>({
    fps: 0,
    frameP95: 0,
    frameMax: 0,
    jsHeapMB: null,
  });

  const terminalCount = useTerminalStore((s) => s.terminals.size);
  const wireCount = useWireStore((s) => s.wires.size);

  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef<number>(0);
  const lastDisplayRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    lastTimeRef.current = performance.now();
    lastDisplayRef.current = lastTimeRef.current;
    frameTimesRef.current = [];

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const buf = frameTimesRef.current;
      buf.push(delta);
      if (buf.length > WINDOW_FRAMES) buf.shift();

      // Throttle React updates to ~2/sec; raw frame-time data still
      // accumulates every frame.
      if (now - lastDisplayRef.current > 500 && buf.length > 0) {
        lastDisplayRef.current = now;

        const sorted = [...buf].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
        const max = sorted[sorted.length - 1] ?? 0;
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        const fps = avg > 0 ? 1000 / avg : 0;

        // Non-standard but Chromium-only API; null elsewhere.
        const mem = (performance as unknown as {
          memory?: { usedJSHeapSize: number };
        }).memory;
        const heap = mem ? mem.usedJSHeapSize / (1024 * 1024) : null;

        setStats({ fps, frameP95: p95, frameMax: max, jsHeapMB: heap });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);

  if (!enabled) return null;

  // Color-code FPS so glances are meaningful: green ≥55, yellow 30-55, red <30.
  const fpsColor =
    stats.fps >= 55
      ? "var(--color-success)"
      : stats.fps >= 30
      ? "var(--color-warning)"
      : "var(--color-danger)";

  return (
    <div
      style={{
        position: "fixed",
        right: 10,
        bottom: 10,
        zIndex: 9998,
        background: "rgba(0, 0, 0, 0.65)",
        color: "var(--color-text)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "6px 10px",
        fontFamily: "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', monospace",
        fontSize: 11,
        lineHeight: 1.5,
        pointerEvents: "none",
        userSelect: "none",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        minWidth: 130,
      }}
    >
      <div>
        <span style={{ color: "var(--color-text-muted)" }}>FPS </span>
        <span style={{ color: fpsColor, fontWeight: 600 }}>
          {stats.fps.toFixed(0)}
        </span>
      </div>
      <div>
        <span style={{ color: "var(--color-text-muted)" }}>frame </span>
        <span>
          {stats.frameP95.toFixed(1)}/{stats.frameMax.toFixed(1)}
          <span style={{ color: "var(--color-text-muted)" }}> ms</span>
        </span>
      </div>
      {stats.jsHeapMB != null && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>heap </span>
          <span>{stats.jsHeapMB.toFixed(0)}<span style={{ color: "var(--color-text-muted)" }}> MB</span></span>
        </div>
      )}
      <div>
        <span style={{ color: "var(--color-text-muted)" }}>nodes </span>
        <span>{terminalCount}</span>
        <span style={{ color: "var(--color-text-muted)" }}> · wires </span>
        <span>{wireCount}</span>
      </div>
    </div>
  );
}
