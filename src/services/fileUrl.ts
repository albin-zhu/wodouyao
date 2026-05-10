/**
 * Turn a local-filesystem path into a URL the browser can render in an
 * `<img>` / `<video>` tag.
 *
 * - Tauri: uses `convertFileSrc` so the WebView serves the file via the
 *   `asset://` protocol with the bundle's CSP whitelist.
 * - Web: hits `wodouyao-server`'s `GET /v1/file/raw?path=…&token=…`
 *   endpoint. The token rides in the query string because `<img src>` and
 *   `<video src>` can't carry Authorization headers; the same headless-
 *   server bearer token gates this route.
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauri, apiBase, getToken } from "./transport";

export function fileUrl(path: string): string {
  if (isTauri) return convertFileSrc(path);
  const params = new URLSearchParams({ path, token: getToken() });
  return `${apiBase}/v1/file/raw?${params.toString()}`;
}
