import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RateLimiter, isRateLimitingEnabled } from "./rateLimiter";

const ORIGINAL_ENV = { ...process.env };

describe("rateLimiter", () => {
  beforeEach(() => {
    process.env.ENABLE_RATE_LIMITING = "true";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  describe("isRateLimitingEnabled", () => {
    it("is true when ENABLE_RATE_LIMITING=true regardless of NODE_ENV", () => {
      process.env.NODE_ENV = "development";
      expect(isRateLimitingEnabled()).toBe(true);
    });

    it("is false when ENABLE_RATE_LIMITING=false even in production", () => {
      process.env.ENABLE_RATE_LIMITING = "false";
      process.env.NODE_ENV = "production";
      expect(isRateLimitingEnabled()).toBe(false);
    });

    it("falls back to NODE_ENV when ENABLE_RATE_LIMITING is unset", () => {
      delete process.env.ENABLE_RATE_LIMITING;
      process.env.NODE_ENV = "production";
      expect(isRateLimitingEnabled()).toBe(true);
      process.env.NODE_ENV = "development";
      expect(isRateLimitingEnabled()).toBe(false);
    });
  });

  describe("RateLimiter.check", () => {
    it("allows requests up to the limit", () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip1")).toBe(true);
    });

    it("rejects the request that exceeds the limit", () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip1")).toBe(false);
    });

    it("tracks separate keys independently", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip2")).toBe(true);
      expect(limiter.check("ip1")).toBe(false);
      expect(limiter.check("ip2")).toBe(false);
    });

    it("allows requests again once the window slides past old timestamps", () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip1")).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(limiter.check("ip1")).toBe(true);
    });

    it("always allows requests when rate limiting is disabled", () => {
      process.env.ENABLE_RATE_LIMITING = "false";
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip1")).toBe(true);
      expect(limiter.check("ip1")).toBe(true);
    });
  });

  describe("RateLimiter.retryAfterSeconds", () => {
    it("returns 0 for a key with no recorded requests", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
      expect(limiter.retryAfterSeconds("never-seen")).toBe(0);
    });

    it("returns a positive value bounded by the window size right after hitting the limit", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });
      limiter.check("ip1");
      const retryAfter = limiter.retryAfterSeconds("ip1");
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it("counts down as the window elapses", () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 10_000 });
      limiter.check("ip1");
      const first = limiter.retryAfterSeconds("ip1");
      vi.advanceTimersByTime(5000);
      const second = limiter.retryAfterSeconds("ip1");
      expect(second).toBeLessThan(first);
    });
  });
});
