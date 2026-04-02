const DEMO_SESSION_ID_KEY = "demo-session-id";

export const AI_ROUTE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/api\/ai\//,
  /^\/api\/properties\/[^/]+\/chat(?:$|\/|\?)/,
];

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable session id for AI-guarded requests in the current browser session. */
export function getOrCreateDemoSessionId(): string {
  try {
    const existing = sessionStorage.getItem(DEMO_SESSION_ID_KEY);
    if (existing && existing.trim()) return existing.trim();
    const generated = createSessionId();
    sessionStorage.setItem(DEMO_SESSION_ID_KEY, generated);
    return generated;
  } catch {
    return createSessionId();
  }
}

function normalizePath(url: string): string {
  if (url.startsWith("/")) return url;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function isAiRoute(url: string): boolean {
  const path = normalizePath(url);
  return AI_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

