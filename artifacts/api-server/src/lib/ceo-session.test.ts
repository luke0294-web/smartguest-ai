import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCeoPassword,
  verifyCeoPassword,
  issueCeoToken,
  verifyCeoToken,
  getCeoTokenFromRequest,
  requireCeoSession,
} from "./ceo-session";
import type { Request, Response } from "express";

const ORIGINAL_ENV = { ...process.env };

function fakeRequest(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

function fakeResponse(): Response & { statusCode?: number; body?: unknown } {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response["json"];
  return res;
}

describe("ceo-session", () => {
  beforeEach(() => {
    process.env.CEO_PASSWORD = "correct-horse-battery-staple";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("getCeoPassword", () => {
    it("reads CEO_PASSWORD when set", () => {
      expect(getCeoPassword()).toBe("correct-horse-battery-staple");
    });

    it("returns undefined when unset", () => {
      delete process.env.CEO_PASSWORD;
      expect(getCeoPassword()).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
      process.env.CEO_PASSWORD = "";
      expect(getCeoPassword()).toBeUndefined();
    });
  });

  describe("verifyCeoPassword", () => {
    it("returns true for a matching password", () => {
      expect(verifyCeoPassword("hunter2", "hunter2")).toBe(true);
    });

    it("returns false for a mismatched password", () => {
      expect(verifyCeoPassword("hunter2", "hunter3")).toBe(false);
    });

    it("does not throw when candidate and expected have different lengths", () => {
      expect(() => verifyCeoPassword("short", "a-much-longer-password-value")).not.toThrow();
      expect(verifyCeoPassword("short", "a-much-longer-password-value")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(verifyCeoPassword("Hunter2", "hunter2")).toBe(false);
    });
  });

  describe("issueCeoToken / verifyCeoToken", () => {
    it("round-trips a freshly issued token", () => {
      const token = issueCeoToken();
      expect(verifyCeoToken(token)).toBe(true);
    });

    it("rejects a token when CEO_PASSWORD changes between issue and verify", () => {
      const token = issueCeoToken();
      process.env.CEO_PASSWORD = "a-totally-different-password";
      expect(verifyCeoToken(token)).toBe(false);
    });

    it("rejects a tampered signature", () => {
      const token = issueCeoToken();
      const [payloadB64] = token.split(".");
      expect(verifyCeoToken(`${payloadB64}.deadbeef`)).toBe(false);
    });

    it("rejects a malformed token", () => {
      expect(verifyCeoToken("not-a-token")).toBe(false);
      expect(verifyCeoToken("a.b.c")).toBe(false);
    });

    it("rejects an expired token", () => {
      vi.useFakeTimers();
      const token = issueCeoToken();
      vi.setSystemTime(Date.now() + 9 * 3600 * 1000); // TTL is 8h
      expect(verifyCeoToken(token)).toBe(false);
      vi.useRealTimers();
    });

    it("returns false when CEO_PASSWORD is not configured", () => {
      const token = issueCeoToken();
      delete process.env.CEO_PASSWORD;
      expect(verifyCeoToken(token)).toBe(false);
    });

    it("throws when issuing a token without a configured password", () => {
      delete process.env.CEO_PASSWORD;
      expect(() => issueCeoToken()).toThrow();
    });
  });

  describe("getCeoTokenFromRequest", () => {
    it("reads the x-ceo-session header", () => {
      const req = fakeRequest({ "x-ceo-session": "token-value" });
      expect(getCeoTokenFromRequest(req)).toBe("token-value");
    });

    it("falls back to Authorization: Bearer", () => {
      const req = fakeRequest({ authorization: "Bearer bearer-token" });
      expect(getCeoTokenFromRequest(req)).toBe("bearer-token");
    });

    it("returns undefined when neither is present", () => {
      expect(getCeoTokenFromRequest(fakeRequest({}))).toBeUndefined();
    });
  });

  describe("requireCeoSession", () => {
    it("returns true and sends nothing for a valid session", () => {
      const token = issueCeoToken();
      const req = fakeRequest({ "x-ceo-session": token });
      const res = fakeResponse();
      expect(requireCeoSession(req, res)).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("responds 503 when CEO_PASSWORD is not configured", () => {
      delete process.env.CEO_PASSWORD;
      const req = fakeRequest({ "x-ceo-session": "irrelevant" });
      const res = fakeResponse();
      expect(requireCeoSession(req, res)).toBe(false);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("responds 401 when no token is present", () => {
      const req = fakeRequest({});
      const res = fakeResponse();
      expect(requireCeoSession(req, res)).toBe(false);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("responds 401 for an invalid token", () => {
      const req = fakeRequest({ "x-ceo-session": "garbage-token" });
      const res = fakeResponse();
      expect(requireCeoSession(req, res)).toBe(false);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
