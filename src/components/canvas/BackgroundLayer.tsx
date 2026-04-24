import { convertFileSrc } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../store/settingsStore";
import ShaderCanvas from "./ShaderCanvas";

// Solid app background color. Reads the live --color-bg-rgb CSS variable
// so it updates when the user switches dark/light theme. Behind it is
// the (possibly transparent) Tauri webview, so when the user dials
// opacity below 1 the desktop shows through.
export default function BackgroundLayer() {
  const bg = useSettingsStore((s) => s.settings?.background);
  if (!bg) return null;

  const opacity = Math.max(0, Math.min(1, bg.opacity ?? 1));

  const fill: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  };

  let content: React.ReactNode = null;
  switch (bg.kind) {
    case "none":
      break;
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
          style={{ ...fill, border: "none", background: "transparent" }}
        />
      ) : null;
      break;
    case "shader":
      content = bg.shader ? (
        <ShaderCanvas name={bg.shader} style={fill} />
      ) : null;
      break;
  }

  return (
    <>
      {/* Base tinted layer — always rendered. Its alpha is the user's
          opacity slider, so dragging to 0 makes the whole window see-through
          (the Tauri window is transparent: true). */}
      <div
        style={{
          ...fill,
          background: `rgba(var(--color-bg-rgb), ${opacity})`,
        }}
      />
      {/* Shader/image/video content. The slider is applied as a CSS alpha
          on the whole content layer — colors stay at full strength but the
          canvas as a whole becomes see-through to the (transparent) Tauri
          window when the user dials opacity down. */}
      {content && <div style={{ ...fill, opacity }}>{content}</div>}
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
