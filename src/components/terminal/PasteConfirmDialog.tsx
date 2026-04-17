import { useEffect } from "react";

interface PasteConfirmDialogProps {
  text: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PasteConfirmDialog({ text, onConfirm, onCancel }: PasteConfirmDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onConfirm, onCancel]);

  const lines = text.split("\n");
  const totalLines = lines.length;
  const previewLines = lines.slice(0, 3);
  const hasMore = totalLines > 3;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(26, 27, 38, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 12,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1f2335",
          border: "1px solid #292e42",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          padding: 14,
          minWidth: 260,
          maxWidth: "100%",
          color: "#c0caf5",
          fontSize: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          Paste {totalLines} lines?
        </div>
        <div style={{ color: "#565f89", fontSize: 11 }}>
          Each line may be executed in the terminal.
        </div>
        <div
          style={{
            background: "#13141b",
            border: "1px solid #292e42",
            borderRadius: 4,
            padding: "6px 8px",
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            fontSize: 11,
            maxHeight: 80,
            overflow: "hidden",
            whiteSpace: "pre",
            color: "#c0caf5",
          }}
        >
          {previewLines.map((l, i) => (
            <div
              key={i}
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {l || "\u00A0"}
            </div>
          ))}
          {hasMore && (
            <div style={{ color: "#565f89" }}>… {totalLines - 3} more</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "1px solid #292e42",
              borderRadius: 4,
              color: "#c0caf5",
              padding: "5px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: "#7aa2f7",
              border: "1px solid #7aa2f7",
              borderRadius: 4,
              color: "#1a1b26",
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Paste
          </button>
        </div>
      </div>
    </div>
  );
}
