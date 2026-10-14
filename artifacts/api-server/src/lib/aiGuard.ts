import type { Request, Response } from "express";
import { DEMO_SLUG } from "./demoProperty";
import { isProductionSecurityEnabled } from "./validateEnv";
import { clientIpKey } from "./rateLimiter";

const AI_MAX_MESSAGES_PER_SESSION = 12;
/**
 * Session ids are chosen by the client, so a fresh id per request would reset
 * the per-session cap: every demo message also counts against the IP.
 * 3× the session cap leaves room for a few tabs/devices behind one network.
 */
const AI_MAX_DEMO_MESSAGES_PER_IP = AI_MAX_MESSAGES_PER_SESSION * 3;

/**
 * Same shape the frontend generates (crypto.randomUUID() or "demo-<base36>-<base36>").
 * Anything else is ignored: an unvalidated id became a Map key held for an hour,
 * so multi-MB ids let anyone exhaust server memory with a few hundred requests.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const AI_COUNTER_TTL_MS = 60 * 60 * 1000;

/** Non-demo: max 60 chat POSTs per rolling minute per x-session-id. */
const PROD_MAX_PER_MINUTE = 60;
const PROD_WINDOW_MS = 60_000;
const prodRateTimestampsBySession = new Map<string, number[]>();

/** Periodic full cleanup so keys with no recent activity don't accumulate forever. */
function pruneProdRateTimestamps(): void {
  const cutoff = Date.now() - PROD_WINDOW_MS;
  for (const [key, timestamps] of prodRateTimestampsBySession) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) {
      prodRateTimestampsBySession.delete(key);
    } else {
      prodRateTimestampsBySession.set(key, recent);
    }
  }
}
setInterval(pruneProdRateTimestamps, 10 * 60 * 1000).unref();

const aiMessageCountByKey = new Map<string, number>();
const aiCounterCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAiCounterCleanup(key: string): void {
  const prev = aiCounterCleanupTimers.get(key);
  if (prev !== undefined) clearTimeout(prev);
  const t = setTimeout(() => {
    aiMessageCountByKey.delete(key);
    aiCounterCleanupTimers.delete(key);
  }, AI_COUNTER_TTL_MS);
  (t as NodeJS.Timeout).unref?.();
  aiCounterCleanupTimers.set(key, t);
}

function readSessionIdFromBody(req: Request): string | undefined {
  const bodyUnknown: unknown = req.body;
  if (!bodyUnknown || typeof bodyUnknown !== "object") return undefined;
  const candidate = (bodyUnknown as Record<string, unknown>)["sessionId"];
  if (typeof candidate !== "string") return undefined;
  const normalized = candidate.trim();
  return SESSION_ID_PATTERN.test(normalized) ? normalized : undefined;
}

function readSessionIdFromHeaders(req: Request): string | undefined {
  const raw = req.headers["x-session-id"];
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim();
  return SESSION_ID_PATTERN.test(normalized) ? normalized : undefined;
}

/** Production chat limit: x-session-id header (falls back to per-IP keying when absent). */
function readXSessionIdForProdLimit(req: Request): string | undefined {
  return readSessionIdFromHeaders(req);
}

/**
 * Slug for demo message limit: route param first, then body (multipart JSON body may lack slug).
 * If missing → not treated as demo (limit bypassed).
 */
function readSlugForAiLimit(req: Request): string | undefined {
  const fromParams = req.params?.slug;
  if (typeof fromParams === "string") {
    const t = fromParams.trim();
    if (t) return t;
  }
  const bodyUnknown: unknown = req.body;
  if (bodyUnknown && typeof bodyUnknown === "object" && "slug" in bodyUnknown) {
    const s = (bodyUnknown as Record<string, unknown>)["slug"];
    if (typeof s === "string") {
      const t = s.trim();
      if (t) return t;
    }
  }
  return undefined;
}

/**
 * Key strategy (priority):
 * 1) sessionId from request body
 * 2) x-session-id header
 * 3) IP fallback
 */
function getAiCounterKey(req: Request): string {
  const sessionId = readSessionIdFromBody(req) ?? readSessionIdFromHeaders(req);
  // Per demo (slug): one browser session is shared by /demo and every
  // personalized /demo/demo-… link, so trying the generic demo used to eat
  // the prospect's own demo before they even opened it.
  if (sessionId) return `session:${sessionId}:${readSlugForAiLimit(req) ?? ""}`;
  return `ip:${clientIpKey(req.ip)}`;
}

/**
 * Demo: 12 messages per hour per session key (body / x-session-id / IP fallback).
 * Production (non-demo): 60 requests per rolling minute per x-session-id header,
 * falling back to per-IP when the header is missing (fail closed, not open).
 */
export function enforceAiMessageLimit(req: Request, res: Response): boolean {
  if (!isProductionSecurityEnabled()) return true;

  const slug = readSlugForAiLimit(req);

  if (slug === DEMO_SLUG) {
    const key = getAiCounterKey(req);
    const used = aiMessageCountByKey.get(key) ?? 0;

    const ipKey = `demo-ip:${clientIpKey(req.ip)}`;
    const ipNext = (aiMessageCountByKey.get(ipKey) ?? 0) + 1;
    if (ipNext > AI_MAX_DEMO_MESSAGES_PER_IP) {
      // Checked before recording the session key, so an over-limit IP can't
      // keep adding new keys to the map. Distinct error from the per-session
      // cap: this one is temporary and shared by a whole network, so the
      // frontend must NOT lock the visitor's tab for good.
      res.status(429).json({
        error: "Demo IP limit reached",
        reply:
          "Da questa rete sono già stati provati molti messaggi demo nell'ultima ora. Riprova più tardi! 🙏",
      });
      return false;
    }
    aiMessageCountByKey.set(ipKey, ipNext);
    scheduleAiCounterCleanup(ipKey);

    const next = used + 1;
    aiMessageCountByKey.set(key, next);
    scheduleAiCounterCleanup(key);

    if (next > AI_MAX_MESSAGES_PER_SESSION) {
      res.status(429).json({ error: "Demo limit reached" });
      return false;
    }
    return true;
  }

  const sessionId = readXSessionIdForProdLimit(req);
  const key = sessionId ? `prod:${sessionId}` : `prod-ip:${clientIpKey(req.ip)}`;

  const now = Date.now();
  const timestamps = prodRateTimestampsBySession.get(key) ?? [];
  const recent = timestamps.filter((t) => now - t < PROD_WINDOW_MS);

  if (recent.length >= PROD_MAX_PER_MINUTE) {
    res.status(429).json({ error: "Troppe richieste. Riprova tra poco." });
    return false;
  }

  prodRateTimestampsBySession.set(key, [...recent, now]);
  return true;
}
