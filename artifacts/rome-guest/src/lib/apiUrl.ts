import { getOrCreateDemoSessionId } from "@workspace/api-client-react";

if (import.meta.env.PROD && !import.meta.env.VITE_API_ORIGIN) {
  throw new Error("Missing VITE_API_ORIGIN in production");
}

/**
 * Builds the URL for API calls.
 *
 * Default: same host as the SPA + `import.meta.env.BASE_URL` (Vite dev server proxies `/api` to the backend).
 *
 * For mobile/LAN testing without the proxy, set in `.env`:
 *   VITE_API_ORIGIN=http://YOUR_PC_LAN_IP:BACKEND_PORT
 * (e.g. `http://192.168.1.10:8080`). The API server must allow your dev origin (see CORS in `app.ts` for development).
 */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim().replace(/\/$/, "") ?? "";
  if (origin) return `${origin}${normalized}`;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}${normalized}`;
}

/**
 * Shared headers for backend AI emergency lock.
 * Do not log or expose the key value.
 */
export function getAiSecurityHeaders(): Record<string, string> {
  return {
    "x-session-id": getOrCreateDemoSessionId(),
  };
}
