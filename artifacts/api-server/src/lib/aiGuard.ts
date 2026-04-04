import type { Request, Response } from "express";
import { DEMO_SLUG } from "./demoProperty";
import { getClientIp } from "./rateLimiter";

const AI_MAX_MESSAGES_PER_SESSION = 12;
const AI_COUNTER_TTL_MS = 60 * 60 * 1000;

/** Non-demo: max 60 chat POSTs per rolling minute per x-session-id. */
const PROD_MAX_PER_MINUTE = 60;
const PROD_WINDOW_MS = 60_000;
const prodRateTimestampsBySession = new Map<string, number[]>();

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
  return normalized || undefined;
}

function readSessionIdFromHeaders(req: Request): string | undefined {
  const raw = req.headers["x-session-id"];
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim();
  return normalized || undefined;
}

/** Production chat limit: header only (no body / IP fallback). */
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
  if (sessionId) return `session:${sessionId}`;
  return `ip:${getClientIp(req)}`;
}

/**
 * Demo: 12 messages per hour per session key (body / x-session-id / IP fallback).
 * Production (non-demo): 60 requests per rolling minute per x-session-id header only; no header → no limit.
 */
export function enforceAiMessageLimit(req: Request, res: Response): boolean {
  const slug = readSlugForAiLimit(req);

  if (slug === DEMO_SLUG) {
    const key = getAiCounterKey(req);
    const used = aiMessageCountByKey.get(key) ?? 0;
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
  if (!sessionId) {
    return true;
  }

  const now = Date.now();
  const key = `prod:${sessionId}`;
  const timestamps = prodRateTimestampsBySession.get(key) ?? [];
  const recent = timestamps.filter((t) => now - t < PROD_WINDOW_MS);

  if (recent.length >= PROD_MAX_PER_MINUTE) {
    res.status(429).json({ error: "Troppe richieste. Riprova tra poco." });
    return false;
  }

  prodRateTimestampsBySession.set(key, [...recent, now]);
  return true;
}
