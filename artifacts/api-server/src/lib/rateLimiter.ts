/**
 * In-memory IP-based rate limiter.
 * Tracks request timestamps per key (IP) inside a sliding window.
 * Designed to be GC-friendly: stale entries are pruned lazily.
 */

import { isProductionSecurityEnabled } from "./validateEnv";

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
  return isProductionSecurityEnabled();
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

  /**
   * True if `key` is currently at its limit — WITHOUT recording a request.
   * Pair with `check()` to count only some events (e.g. failed logins).
   */
  isLimited(key: string): boolean {
    if (!isRateLimitingEnabled()) return false;
    const cutoff = Date.now() - this.windowMs;
    const entry = this.store.get(key);
    if (!entry) return false;
    return entry.timestamps.filter((t) => t > cutoff).length >= this.maxRequests;
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

/** Document text extraction doesn't call OpenAI, but still parses arbitrary uploaded files server-side — capped to limit CPU abuse. */
export const aiDocumentRateLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
});

/** Strict limit for auth and public lead intake endpoints (per IP). */
export const authRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

/**
 * Public property read (guest page, GET /properties/:slug). Generous for real
 * guests and the CEO QR modal, but stops bulk slug guessing — slugs are often
 * derived from the property name and the response is the full house manual.
 */
export const publicPropertyRateLimiter = new RateLimiter({
  maxRequests: 300,
  windowMs: 60 * 60 * 1000,
});

/** CEO login: per IP, stricter than the shared auth limiter. */
export const ceoLoginRateLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
});

/**
 * CEO login: failed attempts across ALL IPs. There is a single CEO password,
 * so a distributed guess (many IPs, few tries each) would slip under any
 * per-IP limit. Above this, CEO login pauses for everyone until the window
 * moves on — a deliberate trade-off: brief lockout over a guessable panel.
 */
export const ceoLoginGlobalFailureLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
});
