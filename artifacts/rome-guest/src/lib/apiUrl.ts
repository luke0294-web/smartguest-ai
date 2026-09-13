import { getOrCreateDemoSessionId } from "@workspace/api-client-react";

if (import.meta.env.PROD && !import.meta.env.VITE_API_ORIGIN) {
  throw new Error("Missing VITE_API_ORIGIN in production");
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
