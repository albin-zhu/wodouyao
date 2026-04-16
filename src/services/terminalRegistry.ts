import type { Terminal } from "@xterm/xterm";

/**
 * Global registry of xterm Terminal instances, keyed by terminal ID.
 * This allows cross-terminal operations like reading buffer content
 * and writing input to any terminal from anywhere in the app.
 */
const registry = new Map<string, Terminal>();

export function registerXterm(id: string, term: Terminal) {
  registry.set(id, term);
}

export function unregisterXterm(id: string) {
  registry.delete(id);
}

export function getXterm(id: string): Terminal | undefined {
  return registry.get(id);
}

/**
 * Read the current visible content of a terminal's buffer.
 * Returns all non-empty lines from the terminal viewport.
 */
export function readTerminalBuffer(id: string): string {
  const term = registry.get(id);
  if (!term) return "";

  const buffer = term.buffer.active;
  const lines: string[] = [];

  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(true));
    }
  }

  // Trim trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}

/**
 * Read only the visible viewport content of a terminal.
 */
export function readTerminalViewport(id: string): string {
  const term = registry.get(id);
  if (!term) return "";

  const buffer = term.buffer.active;
  const lines: string[] = [];
  const viewportStart = buffer.viewportY;

  for (let i = viewportStart; i < viewportStart + term.rows; i++) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(true));
    }
  }

  return lines.join("\n");
}

/**
 * Write text directly to a terminal's PTY input (simulates user typing).
 * Uses the Tauri writeTerminal command to send to the backend PTY.
 */
export { writeTerminal as writeToTerminalPty } from "../services/tauriCommands";
