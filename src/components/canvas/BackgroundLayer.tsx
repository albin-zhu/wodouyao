import { convertFileSrc } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../store/settingsStore";
import ShaderCanvas from "./ShaderCanvas";

export default function BackgroundLayer() {
  const bg = useSettingsStore((s) => s.settings?.background);
  if (!bg || bg.kind === "none") return null;

  const fill: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: 0,
  };

  let content: React.ReactNode = null;
  switch (bg.kind) {
    case "image":
      content = bg.source ? (
        <img
          src={resolveSrc(bg.source)}
          alt=""
          draggable={false}
          style={{ ...fill, objectFit: "cover" }}
        />
      ) : null;
      break;
    case "video":
      content = bg.source ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          src={resolveSrc(bg.source)}
          style={{ ...fill, objectFit: "cover" }}
        />
      ) : null;
      break;
    case "url":
      content = bg.source ? (
        <iframe
          src={bg.source}
          sandbox="allow-scripts allow-same-origin"
          title="background"
          style={{ ...fill, border: "none", background: "#13141b" }}
        />
      ) : null;
      break;
    case "shader":
      content = bg.shader ? <ShaderCanvas name={bg.shader} style={fill} /> : null;
      break;
  }

  const dim = 1 - Math.max(0, Math.min(1, bg.opacity ?? 1));

  return (
    <>
      {content}
      {dim > 0 && (
        <div
          style={{
            ...fill,
            background: `rgba(10, 12, 18, ${dim})`,
            zIndex: 1,
          }}
        />
      )}
    </>
  );
}

function resolveSrc(src: string): string {
  if (/^(https?|data|blob):/i.test(src)) return src;
  try {
    return convertFileSrc(src);
  } catch {
    return src;
  }
}
