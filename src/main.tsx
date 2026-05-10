import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import App from "./App";
import "./styles/global.css";

// Bundled webfont: guarantees JetBrains Mono renders sharp for ASCII even on
// machines that don't have it installed locally. CJK glyphs still fall through
// to whichever local CJK mono the user has — the FontPresetPicker stitches a
// chain that prefers Sarasa Term SC / Maple Mono CN / PingFang SC.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
