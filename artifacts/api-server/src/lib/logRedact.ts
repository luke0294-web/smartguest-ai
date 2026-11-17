/**
 * Reset/invite tokens travel in the URL path (`/auth/reset-password/<token>`):
 * they must never reach Render's logs, or anyone with log access could set a
 * host's password with an unused token — defeating the hashing at rest.
 * Query strings are dropped too.
 */
export function redactUrlForLogs(url: string | undefined): string | undefined {
  return url
    ?.split("?")[0]
    .replace(/\/(reset-password|setup-password)\/[^/]+/g, "/$1/[redacted]");
}

/**
 * Keeps logs useful for support ("which host?") without storing full
 * addresses: "mario.rossi@gmail.com" → "ma***@gmail.com".
 */
export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at <= 0) return value ? "***" : "";
  return `${value.slice(0, Math.min(2, at))}***${value.slice(at)}`;
}
