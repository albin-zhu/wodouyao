import { type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri, subscribeJson, subscribeTerminalBinary } from "./transport";
import { listen } from "@tauri-apps/api/event";

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
  if (isTauri) {
    return listen<TerminalOutputPayload>(
      `terminal-output-${terminalId}`,
      (event) => {
        const bytes = new Uint8Array(event.payload.data);
        callback(bytes);
      }
    );
  }
  // Web mode: per-terminal binary frames are demuxed by id from the
  // single shared `/v1/events` WebSocket.
  return subscribeTerminalBinary(terminalId, callback);
}

export function listenTerminalExit(
  terminalId: string,
  callback: (exitCode: number | null) => void
): Promise<UnlistenFn> {
  return subscribeJson<TerminalExitPayload>(
    `terminal-exit-${terminalId}`,
    (payload) => callback(payload.exit_code),
  );
}
