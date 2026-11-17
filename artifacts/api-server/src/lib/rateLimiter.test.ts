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

describe("clientIpKey", () => {
  it("keeps IPv4 (and IPv4-mapped IPv6) as is", async () => {
    const { clientIpKey } = await import("./rateLimiter");
    expect(clientIpKey("203.0.113.7")).toBe("203.0.113.7");
    expect(clientIpKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("groups IPv6 by /64 so one client can't rotate addresses for fresh buckets", async () => {
    const { clientIpKey } = await import("./rateLimiter");
    const a = clientIpKey("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = clientIpKey("2001:0db8:abcd:0012::9");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(clientIpKey("2001:db8:abcd:13::1")).not.toBe(a);
    expect(clientIpKey("::1")).toBe("0:0:0:0::/64");
  });

  it("handles a missing address", async () => {
    const { clientIpKey } = await import("./rateLimiter");
    expect(clientIpKey(undefined)).toBe("unknown");
  });
});
