import { useEffect, useRef } from "react";
import { useToastStore } from "../../store/toastStore";
import type { ToastType } from "../../store/toastStore";

const TYPE_COLOR: Record<ToastType, string> = {
  success: "var(--color-success)",
  error:   "var(--color-danger)",
  info:    "var(--color-accent)",
  warning: "var(--color-warning)",
};

const TYPE_ICON: Record<ToastType, string> = {
  success: "✓",
  error:   "✕",
  info:    "●",
  warning: "⚠",
};

function ToastItem({ id, message, type }: { id: string; message: string; type: ToastType }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const ref = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.animate(
      [{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "translateX(0)" }],
      { duration: 180, easing: "ease-out", fill: "forwards" }
    );
  }, []);

  const color = TYPE_COLOR[type];

  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "9px 12px",
        maxWidth: 340,
        minWidth: 200,
        boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
        cursor: "default",
        pointerEvents: "auto",
      }}
    >
      <span style={{ color, fontSize: 13, flexShrink: 0, lineHeight: 1 }}>
        {TYPE_ICON[type]}
      </span>
      <span style={{ color: "var(--color-text)", fontSize: 12, lineHeight: 1.4, flex: 1 }}>
        {message}
      </span>
      <button
        onClick={() => dismiss(id)}
        style={{
          background: "none",
          border: "none",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          fontSize: 14,
          padding: 0,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        alignItems: "flex-end",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
