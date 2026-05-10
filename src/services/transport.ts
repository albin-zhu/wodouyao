/**
 * Runtime-aware transport layer.
 *
 * In Tauri (desktop) builds the SPA reaches the Rust core through
 * `invoke()` / `listen()`. In a browser served by `wodouyao-server`
 * the same call sites use `fetch()` against `POST /v1/cmd/{name}`
 * and a single shared WebSocket against `GET /v1/events`.
 *
 * Detection is runtime: `__TAURI_INTERNALS__` on `window` means we're
 * in the WebView, otherwise we're in a plain browser.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const apiBase = isTauri
  ? ""
  : typeof window !== "undefined"
    ? window.location.origin
    : "";

// ─── Bearer token (web mode only) ─────────────────────────────────────

const TOKEN_KEY = "wodouyao-token";
let cachedToken: string | null = null;

export function getToken(): string {
  if (isTauri) return "";
  if (cachedToken !== null && cachedToken !== "") return cachedToken;

  // Hash takes precedence — landing URL from server stdout is
  // `http://host:port/#token=…`. We deliberately do NOT strip the hash:
  // the user typically bookmarks this URL, and the bookmark must keep
  // the token so re-opening from a fresh browser still authenticates.
  if (typeof window !== "undefined" && window.location.hash) {
    const m = window.location.hash.match(/[#&]token=([^&]+)/);
    if (m) {
      cachedToken = decodeURIComponent(m[1]);
      try {
        localStorage.setItem(TOKEN_KEY, cachedToken);
      } catch {
        /* localStorage unavailable, fine — keep the in-memory cache */
      }
      return cachedToken;
    }
  }

  // Fallback: previously-stashed token in localStorage. Persists across
  // browser restarts so a user who bookmarks the bare host URL (without
  // the hash) still gets in.
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      cachedToken = stored;
      return stored;
    }
  } catch {
    /* ignore */
  }

  cachedToken = "";
  return "";
}

// ─── Command call ─────────────────────────────────────────────────────

export async function call<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauri) return invoke<T>(cmd, args);

  const r = await fetch(`${apiBase}/v1/cmd/${cmd}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args ?? {}),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${cmd} ${r.status}: ${body}`);
  }
  // Some endpoints return an empty body (void); JSON.parse("") throws.
  const text = await r.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ─── Event subscription ───────────────────────────────────────────────

type JsonHandler = (payload: unknown) => void;
type BinaryHandler = (bytes: Uint8Array) => void;

const jsonSubs = new Map<string, Set<JsonHandler>>();
const binaryByTerminal = new Map<string, Set<BinaryHandler>>();

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/v1/events?token=${encodeURIComponent(getToken())}`;
}

function dispatchBinary(buf: ArrayBuffer) {
  const view = new Uint8Array(buf);
  if (view.length < 1) return;
  const idLen = view[0];
  if (view.length < 1 + idLen) return;
  const id = new TextDecoder().decode(view.subarray(1, 1 + idLen));
  const data = view.subarray(1 + idLen);
  const handlers = binaryByTerminal.get(id);
  if (handlers) for (const h of handlers) h(data);
}

function dispatchJson(text: string) {
  let env: { event?: string; payload?: unknown } | undefined;
  try {
    env = JSON.parse(text);
  } catch {
    return;
  }
  if (!env || typeof env.event !== "string") return;
  const handlers = jsonSubs.get(env.event);
  if (handlers) for (const h of handlers) h(env.payload);
}

function ensureWS() {
  if (isTauri) return;
  if (typeof window === "undefined") return;
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  ws = new WebSocket(wsUrl());
  ws.binaryType = "arraybuffer";
  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      dispatchJson(ev.data);
    } else if (ev.data instanceof ArrayBuffer) {
      dispatchBinary(ev.data);
    }
  };
  ws.onclose = () => {
    ws = null;
    if (reconnectTimer != null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      ensureWS();
    }, 1000);
  };
  ws.onerror = () => {
    /* onclose follows; let it handle reconnect */
  };
}

export function subscribeJson<T = unknown>(
  event: string,
  cb: (payload: T) => void,
): Promise<UnlistenFn> {
  if (isTauri) {
    return listen<T>(event, (e) => cb(e.payload));
  }
  ensureWS();
  let set = jsonSubs.get(event);
  if (!set) {
    set = new Set();
    jsonSubs.set(event, set);
  }
  const handler: JsonHandler = (p) => cb(p as T);
  set.add(handler);
  return Promise.resolve(() => {
    set!.delete(handler);
    if (set!.size === 0) jsonSubs.delete(event);
  });
}

/**
 * Open a URL in an external browser. Tauri shells out via the
 * `open_url` command; web mode just calls `window.open`.
 */
export function openUrl(url: string): void {
  if (isTauri) {
    invoke<void>("open_url", { url }).catch(() => {});
  } else if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function subscribeTerminalBinary(
  terminalId: string,
  cb: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  if (isTauri) {
    // Caller should use the existing per-terminal Tauri listen.
    throw new Error(
      "subscribeTerminalBinary called under Tauri; use listenTerminalOutput",
    );
  }
  ensureWS();
  let set = binaryByTerminal.get(terminalId);
  if (!set) {
    set = new Set();
    binaryByTerminal.set(terminalId, set);
  }
  set.add(cb);
  return Promise.resolve(() => {
    set!.delete(cb);
    if (set!.size === 0) binaryByTerminal.delete(terminalId);
  });
}
