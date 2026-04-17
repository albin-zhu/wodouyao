import { useEffect, useRef } from "react";
import type { ParticlePreset } from "../../types/settings";

interface Props {
  preset: ParticlePreset;
  style?: React.CSSProperties;
}

type Renderer = (
  ctx: CanvasRenderingContext2D,
  state: ParticleState,
  w: number,
  h: number,
  t: number
) => void;

type ParticleState = {
  drops?: { y: number; speed: number }[];
  chars?: string;
  stars?: { x: number; y: number; size: number; speed: number; brightness: number }[];
  t?: number;
  particles?: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[];
};

export default function ParticleCanvas({ preset, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let disposed = false;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(() => {
      resize();
      state = init(preset, canvas);
    });
    ro.observe(canvas);

    let state = init(preset, canvas);
    const renderer = rendererFor(preset);

    const loop = (t: number) => {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      renderer(ctx, state, rect.width, rect.height, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [preset]);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", ...style }} />;
}

function init(preset: ParticlePreset, canvas: HTMLCanvasElement): ParticleState {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  switch (preset) {
    case "matrix": {
      const colWidth = 14;
      const cols = Math.max(1, Math.floor(w / colWidth));
      return {
        drops: Array.from({ length: cols }, () => ({
          y: Math.random() * -h,
          speed: 1.5 + Math.random() * 3,
        })),
        chars:
          "\u30a2\u30a4\u30a6\u30a8\u30aa\u30ab\u30ad\u30af\u30b1\u30b3\u30b5\u30b7\u30b9\u30bb\u30bd\u30bf\u30c1\u30c4\u30c6\u30c80123456789ABCDEF",
      };
    }
    case "starfield": {
      const layers = [0.3, 0.6, 1.0];
      const perLayer = 70;
      return {
        stars: layers.flatMap((speed) =>
          Array.from({ length: perLayer }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            size: 0.5 + speed * 1.2,
            speed,
            brightness: 0.25 + speed * 0.6,
          }))
        ),
      };
    }
    case "wave":
      return { t: 0 };
    case "dust":
      return {
        particles: Array.from({ length: 140 }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          size: 0.5 + Math.random() * 1.4,
          alpha: 0.2 + Math.random() * 0.35,
        })),
      };
  }
}

function rendererFor(preset: ParticlePreset): Renderer {
  switch (preset) {
    case "matrix":
      return renderMatrix;
    case "starfield":
      return renderStarfield;
    case "wave":
      return renderWave;
    case "dust":
      return renderDust;
  }
}

function renderMatrix(ctx: CanvasRenderingContext2D, state: ParticleState, w: number, h: number) {
  ctx.fillStyle = "rgba(10, 12, 18, 0.08)";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "14px ui-monospace, 'SF Mono', Menlo, monospace";
  ctx.textBaseline = "top";
  const colWidth = 14;
  const drops = state.drops ?? [];
  const chars = state.chars ?? "";
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    const ch = chars.charAt(Math.floor(Math.random() * chars.length));
    // Head glyph bright, trail dimmer via fill alpha
    ctx.fillStyle = "#9bff9b";
    ctx.fillText(ch, i * colWidth, d.y);
    ctx.fillStyle = "rgba(0, 200, 80, 0.75)";
    ctx.fillText(ch, i * colWidth, d.y - 14);
    d.y += d.speed;
    if (d.y > h + 40) {
      d.y = Math.random() * -200;
      d.speed = 1.5 + Math.random() * 3;
    }
  }
}

function renderStarfield(ctx: CanvasRenderingContext2D, state: ParticleState, w: number, h: number) {
  ctx.fillStyle = "#0a0b10";
  ctx.fillRect(0, 0, w, h);
  const stars = state.stars ?? [];
  for (const s of stars) {
    ctx.fillStyle = `rgba(200, 210, 255, ${s.brightness})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
    s.x += s.speed * 0.12;
    s.y += s.speed * 0.05;
    if (s.x > w) s.x = 0;
    if (s.y > h) s.y = 0;
  }
}

function renderWave(ctx: CanvasRenderingContext2D, state: ParticleState, w: number, h: number) {
  ctx.fillStyle = "#0c0e1c";
  ctx.fillRect(0, 0, w, h);
  state.t = (state.t ?? 0) + 0.02;
  const t = state.t;

  ctx.strokeStyle = "rgba(122, 162, 247, 0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(187, 154, 247, 0.35)";
  ctx.lineWidth = 1;
  const spacing = 28;
  for (let y = -spacing; y < h + spacing; y += spacing) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const wave = Math.sin(x / 90 + t + y / 140) * 10;
      const py = y + wave;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
}

function renderDust(ctx: CanvasRenderingContext2D, state: ParticleState, w: number, h: number) {
  ctx.fillStyle = "#13141b";
  ctx.fillRect(0, 0, w, h);
  const particles = state.particles ?? [];
  for (const p of particles) {
    ctx.fillStyle = `rgba(192, 202, 245, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = w;
    if (p.x > w) p.x = 0;
    if (p.y < 0) p.y = h;
    if (p.y > h) p.y = 0;
  }
}
