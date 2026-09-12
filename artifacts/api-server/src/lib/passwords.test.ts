import { describe, it, expect } from "vitest";
import { hashHostPassword, verifyHostPassword, MIN_HOST_PASSWORD_LENGTH } from "./passwords";

describe("passwords", () => {
  describe("hashHostPassword / verifyHostPassword (bcrypt path)", () => {
    it("round-trips a freshly hashed password", async () => {
      const hash = await hashHostPassword("hunter2hunter2");
      expect(await verifyHostPassword(hash, "hunter2hunter2")).toBe(true);
    });

    it("rejects a wrong password against a bcrypt hash", async () => {
      const hash = await hashHostPassword("correct-password");
      expect(await verifyHostPassword(hash, "wrong-password")).toBe(false);
    });

    it("trims whitespace before hashing and verifying", async () => {
      const hash = await hashHostPassword("  padded-pw  ");
      expect(await verifyHostPassword(hash, "padded-pw")).toBe(true);
    });

    it("produces a real bcrypt hash (identifiable prefix)", async () => {
      const hash = await hashHostPassword("whatever12");
      expect(hash).toMatch(/^\$2[aby]\$/);
    });

    it("produces a different hash each time (bcrypt salting)", async () => {
      const h1 = await hashHostPassword("same-password");
      const h2 = await hashHostPassword("same-password");
      expect(h1).not.toBe(h2);
    });
  });

  describe("verifyHostPassword (legacy plaintext fallback)", () => {
    it("matches a legacy plaintext value via constant-time comparison", async () => {
      expect(await verifyHostPassword("legacy-plaintext-pw", "legacy-plaintext-pw")).toBe(true);
    });

    it("rejects a mismatched legacy plaintext value", async () => {
      expect(await verifyHostPassword("legacy-plaintext-pw", "something-else")).toBe(false);
    });

    it("does not throw when candidate and stored differ in length", async () => {
      await expect(verifyHostPassword("short", "a-much-longer-string-value")).resolves.toBe(false);
    });
  });

  describe("verifyHostPassword edge cases", () => {
    it("returns false for an empty stored value", async () => {
      expect(await verifyHostPassword("", "anything")).toBe(false);
    });

    it("returns false for an empty candidate password", async () => {
      const hash = await hashHostPassword("real-password");
      expect(await verifyHostPassword(hash, "")).toBe(false);
    });

    it("returns false when both are empty", async () => {
      expect(await verifyHostPassword("", "")).toBe(false);
    });
  });

  describe("MIN_HOST_PASSWORD_LENGTH", () => {
    it("is 8", () => {
      expect(MIN_HOST_PASSWORD_LENGTH).toBe(8);
    });
  });
});
