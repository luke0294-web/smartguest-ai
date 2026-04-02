import type { Request, Response } from "express";
import { getClientIp } from "./rateLimiter";

const AI_MAX_MESSAGES_PER_SESSION = 12;
const AI_COUNTER_TTL_MS = 60 * 60 * 1000;

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

function readBearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return undefined;
  const token = auth.slice(7).trim();
  return token || undefined;
}

function readXApiKey(req: Request): string | undefined {
  const raw = req.headers["x-api-key"];
  if (typeof raw !== "string") return undefined;
  const token = raw.trim();
  return token || undefined;
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

export function requireAiInternalApiKey(req: Request, res: Response): boolean {
  const expected = process.env.AI_INTERNAL_API_KEY?.trim();
  if (!expected) {
    res.status(500).json({ error: "Server misconfigured: AI key missing." });
    return false;
  }

  const provided = readBearerToken(req) ?? readXApiKey(req);
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function enforceAiMessageLimit(req: Request, res: Response): boolean {
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

