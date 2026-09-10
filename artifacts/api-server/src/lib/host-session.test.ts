import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  getHostSessionSecret,
  issueHostSessionToken,
  verifyHostSessionToken,
  peekHostSessionHostId,
  getHostTokenFromRequest,
} from "./host-session";
import type { Request } from "express";

const ORIGINAL_ENV = { ...process.env };

function fakeRequest(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

describe("host-session", () => {
  beforeEach(() => {
    process.env.HOST_SESSION_SECRET = "test-secret-value";
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("getHostSessionSecret", () => {
    it("reads HOST_SESSION_SECRET when set", () => {
      expect(getHostSessionSecret()).toBe("test-secret-value");
    });

    it("falls back to SESSION_SECRET when HOST_SESSION_SECRET is unset", () => {
      delete process.env.HOST_SESSION_SECRET;
      process.env.SESSION_SECRET = "fallback-secret";
      expect(getHostSessionSecret()).toBe("fallback-secret");
    });

    it("returns undefined when neither is set", () => {
      delete process.env.HOST_SESSION_SECRET;
      delete process.env.SESSION_SECRET;
      expect(getHostSessionSecret()).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
      process.env.HOST_SESSION_SECRET = "";
      delete process.env.SESSION_SECRET;
      expect(getHostSessionSecret()).toBeUndefined();
    });

    it("trims surrounding whitespace", () => {
      process.env.HOST_SESSION_SECRET = "  padded-secret  ";
      expect(getHostSessionSecret()).toBe("padded-secret");
    });
  });

  describe("issueHostSessionToken / verifyHostSessionToken", () => {
    const host = { id: 42, email: "host@example.com", passwordHash: "$2b$10$fakehashabc" };

    it("round-trips a valid token", () => {
      const token = issueHostSessionToken(host);
      const payload = verifyHostSessionToken(token, host.passwordHash);
      expect(payload).not.toBeNull();
      expect(payload?.hostId).toBe(host.id);
      expect(payload?.email).toBe(host.email);
    });

    it("rejects a token verified against a DIFFERENT password hash (M3: reset password invalidates sessions)", () => {
      const token = issueHostSessionToken(host);
      const payload = verifyHostSessionToken(token, "$2b$10$adifferenthash999");
      expect(payload).toBeNull();
    });

    it("rejects a token when the signing secret changes between issue and verify", () => {
      const token = issueHostSessionToken(host);
      process.env.HOST_SESSION_SECRET = "a-completely-different-secret";
      const payload = verifyHostSessionToken(token, host.passwordHash);
      expect(payload).toBeNull();
    });

    it("rejects a tampered payload (bit-flipped base64 segment)", () => {
      const token = issueHostSessionToken(host);
      const [payloadB64, sig] = token.split(".");
      const tamperedPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      tamperedPayload.hostId = 999;
      const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload), "utf8").toString("base64url");
      const tamperedToken = `${tamperedB64}.${sig}`;
      expect(verifyHostSessionToken(tamperedToken, host.passwordHash)).toBeNull();
    });

    it("rejects a malformed token (wrong number of segments)", () => {
      expect(verifyHostSessionToken("not-a-real-token", host.passwordHash)).toBeNull();
      expect(verifyHostSessionToken("a.b.c", host.passwordHash)).toBeNull();
    });

    it("rejects an expired token", () => {
      const token = issueHostSessionToken(host);
      const [payloadB64, sig] = token.split(".");
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      payload.exp = Math.floor(Date.now() / 1000) - 10;
      const expiredB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
      // Re-sign with the correct key so only expiry (not signature) is being tested.
      const secret = process.env.HOST_SESSION_SECRET!;
      const key = createHmac("sha256", secret).update(`heycico-host-session-v1:${host.passwordHash}`).digest();
      const expiredSig = createHmac("sha256", key).update(expiredB64).digest("hex");
      const expiredToken = `${expiredB64}.${expiredSig}`;
      expect(verifyHostSessionToken(expiredToken, host.passwordHash)).toBeNull();
      void sig;
    });

    it("returns null when the signing secret is not configured", () => {
      const token = issueHostSessionToken(host);
      delete process.env.HOST_SESSION_SECRET;
      delete process.env.SESSION_SECRET;
      expect(verifyHostSessionToken(token, host.passwordHash)).toBeNull();
    });

    it("throws when issuing a token without a configured secret", () => {
      delete process.env.HOST_SESSION_SECRET;
      delete process.env.SESSION_SECRET;
      expect(() => issueHostSessionToken(host)).toThrow();
    });
  });

  describe("peekHostSessionHostId", () => {
    it("extracts the hostId without verifying the signature", () => {
      const token = issueHostSessionToken({ id: 7, email: "a@b.com", passwordHash: "x" });
      expect(peekHostSessionHostId(token)).toBe(7);
    });

    it("still extracts hostId even with a garbage signature (by design — signature is checked separately)", () => {
      const token = issueHostSessionToken({ id: 7, email: "a@b.com", passwordHash: "x" });
      const [payloadB64] = token.split(".");
      expect(peekHostSessionHostId(`${payloadB64}.garbage`)).toBe(7);
    });

    it("returns null for a malformed token", () => {
      expect(peekHostSessionHostId("garbage")).toBeNull();
      expect(peekHostSessionHostId("a.b.c")).toBeNull();
    });

    it("returns null when the payload has no numeric hostId", () => {
      const badPayload = Buffer.from(JSON.stringify({ hostId: "not-a-number" }), "utf8").toString("base64url");
      expect(peekHostSessionHostId(`${badPayload}.sig`)).toBeNull();
    });
  });

  describe("getHostTokenFromRequest", () => {
    it("reads the x-host-session header", () => {
      const req = fakeRequest({ "x-host-session": "token-from-header" });
      expect(getHostTokenFromRequest(req)).toBe("token-from-header");
    });

    it("falls back to Authorization: Bearer", () => {
      const req = fakeRequest({ authorization: "Bearer token-from-bearer" });
      expect(getHostTokenFromRequest(req)).toBe("token-from-bearer");
    });

    it("prefers x-host-session over Authorization when both are present", () => {
      const req = fakeRequest({
        "x-host-session": "from-header",
        authorization: "Bearer from-bearer",
      });
      expect(getHostTokenFromRequest(req)).toBe("from-header");
    });

    it("returns undefined when neither is present", () => {
      expect(getHostTokenFromRequest(fakeRequest({}))).toBeUndefined();
    });

    it("returns undefined for a non-Bearer Authorization header", () => {
      const req = fakeRequest({ authorization: "Basic dXNlcjpwYXNz" });
      expect(getHostTokenFromRequest(req)).toBeUndefined();
    });

    it("returns undefined for a blank x-host-session header", () => {
      const req = fakeRequest({ "x-host-session": "   " });
      expect(getHostTokenFromRequest(req)).toBeUndefined();
    });
  });
});
