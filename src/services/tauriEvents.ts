import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TerminalOutputPayload {
  id: string;
  data: number[];
}

export interface TerminalExitPayload {
  id: string;
  exit_code: number | null;
}

export function listenTerminalOutput(
  terminalId: string,
  callback: (data: Uint8Array) => void
): Promise<UnlistenFn> {
  return listen<TerminalOutputPayload>(
    `terminal-output-${terminalId}`,
    (event) => {
      const bytes = new Uint8Array(event.payload.data);
      callback(bytes);
    }
  );
}

export function listenTerminalExit(
  terminalId: string,
  callback: (exitCode: number | null) => void
): Promise<UnlistenFn> {
  return listen<TerminalExitPayload>(
    `terminal-exit-${terminalId}`,
    (event) => {
      callback(event.payload.exit_code);
    }
  );
}
