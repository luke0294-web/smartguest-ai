/**
 * In-memory IP-based rate limiter.
 * Tracks request timestamps per key (IP) inside a sliding window.
 * Designed to be GC-friendly: stale entries are pruned lazily.
 */

interface RateLimitEntry {
  timestamps: number[];
}

export interface RateLimiterOptions {
  /** Max allowed requests inside the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

/** When false, all in-memory limiters allow every request (local dev only). */
export function isRateLimitingEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;

    // Periodic full cleanup every 10 minutes to avoid unbounded memory growth
    setInterval(() => this.prune(), 10 * 60 * 1000).unref();
  }

  /**
   * Record a request for a key and check if it exceeds the limit.
   * @returns `true` if the request is allowed, `false` if rate-limited.
   */
  check(key: string): boolean {
    if (!isRateLimitingEnabled()) return true;

    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Prune timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      return false; // Rate limited
    }

    entry.timestamps.push(now);
    return true; // Allowed
  }

  /** Returns seconds until the oldest request in the window expires */
  retryAfterSeconds(key: string): number {
    const entry = this.store.get(key);
    if (!entry || entry.timestamps.length === 0) return 0;
    const oldest = Math.min(...entry.timestamps);
    const msUntilExpiry = oldest + this.windowMs - Date.now();
    return Math.max(0, Math.ceil(msUntilExpiry / 1000));
  }

  /** Remove all entries whose windows have fully expired */
  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// ── Singleton: 100 requests / hour for the guest chat endpoint ─────────────────
export const chatRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
});

/** Strict limit for OpenAI-backed upload endpoints (per IP, per route). */
export const aiTranscribeRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

export const aiVisionRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

/** Strict limit for auth and public lead intake endpoints (per IP). */
export const authRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

/**
 * Extracts the real client IP from an Express request,
 * honouring X-Forwarded-For when behind a proxy (Replit's edge).
 */
export function getClientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    const ip = first?.trim();
    if (ip) return ip;
  }
  return req.ip ?? "unknown";
}
