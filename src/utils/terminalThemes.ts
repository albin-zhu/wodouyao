import type { ITheme } from "@xterm/xterm";
import type { TerminalTheme } from "../types/terminal";

export const TERMINAL_THEMES: Record<TerminalTheme, ITheme> = {
  tokyonight: {
    background: "#1a1b26",
    foreground: "#a9b1d6",
    cursor: "#c0caf5",
    selectionBackground: "#33467c",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
    brightBlack: "#414868",
    brightRed: "#f7768e",
    brightGreen: "#9ece6a",
    brightYellow: "#e0af68",
    brightBlue: "#7aa2f7",
    brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff",
    brightWhite: "#c0caf5",
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    selectionBackground: "#44475a",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  nord: {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#d8dee9",
    selectionBackground: "#434c5e",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  monokai: {
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    selectionBackground: "#49483e",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
    brightBlack: "#75715e",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#f4bf75",
    brightBlue: "#66d9ef",
    brightMagenta: "#ae81ff",
    brightCyan: "#a1efe4",
    brightWhite: "#f9f8f5",
  },
  solarized: {
    background: "#002b36",
    foreground: "#839496",
    cursor: "#839496",
    selectionBackground: "#073642",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
};

export const ACCENT_COLORS = [
  { name: "Blue", hex: "#7aa2f7" },
  { name: "Red", hex: "#f7768e" },
  { name: "Green", hex: "#9ece6a" },
  { name: "Yellow", hex: "#e0af68" },
  { name: "Purple", hex: "#bb9af7" },
  { name: "Cyan", hex: "#7dcfff" },
  { name: "Orange", hex: "#ff9e64" },
  { name: "Pink", hex: "#ff007c" },
];

export const DEFAULT_COLOR = "#7aa2f7";
export const DEFAULT_THEME: TerminalTheme = "tokyonight";

/** Pick a random hex from the accent palette. Used on terminal spawn so
 *  the left border / title badge differentiates side-by-side terminals
 *  (otherwise every new one is the same Tokyo-night blue).
 *  `avoid` takes a list of already-used hex values; we try to pick one not
 *  in that list so adjacent terminals look distinct. Falls back to a true
 *  random if every color is already used. */
export function randomAccent(avoid?: string[]): string {
  if (!avoid || avoid.length === 0) {
    return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)].hex;
  }
  const pool = ACCENT_COLORS.filter((c) => !avoid.includes(c.hex));
  if (pool.length === 0) {
    return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)].hex;
  }
  return pool[Math.floor(Math.random() * pool.length)].hex;
}

// Light-mode counterparts. Well-known official palettes where they exist
// (Tokyo Night Light, Solarized Light); otherwise sensible inversions.
// Darker ANSI colors so text stays legible on the pale backgrounds.
export const TERMINAL_THEMES_LIGHT: Record<TerminalTheme, ITheme> = {
  tokyonight: {
    background: "#d5d6db",
    foreground: "#343b58",
    cursor: "#343b58",
    selectionBackground: "#b6b9c7",
    black: "#4c505e",
    red: "#8c4351",
    green: "#485e30",
    yellow: "#8f5e15",
    blue: "#34548a",
    magenta: "#5a4a78",
    cyan: "#0f4b6e",
    white: "#343b58",
    brightBlack: "#6c6e75",
    brightRed: "#8c4351",
    brightGreen: "#485e30",
    brightYellow: "#8f5e15",
    brightBlue: "#34548a",
    brightMagenta: "#5a4a78",
    brightCyan: "#0f4b6e",
    brightWhite: "#343b58",
  },
  dracula: {
    background: "#f8f8f2",
    foreground: "#282a36",
    cursor: "#282a36",
    selectionBackground: "#bfbfbf",
    black: "#000000",
    red: "#cc4433",
    green: "#388e3c",
    yellow: "#b58900",
    blue: "#4527a0",
    magenta: "#c2185b",
    cyan: "#00838f",
    white: "#282a36",
    brightBlack: "#44475a",
    brightRed: "#d14",
    brightGreen: "#4caf50",
    brightYellow: "#c8a415",
    brightBlue: "#5e35b1",
    brightMagenta: "#d81b60",
    brightCyan: "#00acc1",
    brightWhite: "#1a1b1f",
  },
  nord: {
    background: "#eceff4",
    foreground: "#2e3440",
    cursor: "#2e3440",
    selectionBackground: "#d8dee9",
    black: "#3b4252",
    red: "#bf616a",
    green: "#587539",
    yellow: "#a17410",
    blue: "#5e81ac",
    magenta: "#b48ead",
    cyan: "#2e8d9a",
    white: "#2e3440",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#587539",
    brightYellow: "#a17410",
    brightBlue: "#5e81ac",
    brightMagenta: "#b48ead",
    brightCyan: "#2e8d9a",
    brightWhite: "#2e3440",
  },
  monokai: {
    background: "#fafafa",
    foreground: "#272822",
    cursor: "#272822",
    selectionBackground: "#c2c1b6",
    black: "#000000",
    red: "#d81b60",
    green: "#558b2f",
    yellow: "#a6760f",
    blue: "#1565c0",
    magenta: "#6a1b9a",
    cyan: "#00838f",
    white: "#272822",
    brightBlack: "#75715e",
    brightRed: "#e91e63",
    brightGreen: "#689f38",
    brightYellow: "#bf8f17",
    brightBlue: "#1976d2",
    brightMagenta: "#7b1fa2",
    brightCyan: "#0097a7",
    brightWhite: "#1a1a1a",
  },
  solarized: {
    background: "#fdf6e3",
    foreground: "#657b83",
    cursor: "#586e75",
    selectionBackground: "#eee8d5",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#002b36",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
};

/**
 * Pick the right xterm theme map based on the current resolved theme
 * attribute (`html[data-theme]`). Resolving by DOM attribute avoids
 * threading the theme through every hook.
 */
export function getXtermThemeMap(): Record<TerminalTheme, ITheme> {
  const t = typeof document !== "undefined"
    ? document.documentElement.dataset.theme
    : null;
  return t === "light" ? TERMINAL_THEMES_LIGHT : TERMINAL_THEMES;
}
