import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hashToken } from "./tokens";

describe("hashToken", () => {
  it("produces a deterministic sha256 hex digest", () => {
    const expected = createHash("sha256").update("my-token", "utf8").digest("hex");
    expect(hashToken("my-token")).toBe(expected);
  });

  it("is deterministic across calls", () => {
    expect(hashToken("same-input")).toBe(hashToken("same-input"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("is case-sensitive", () => {
    expect(hashToken("Token")).not.toBe(hashToken("token"));
  });

  it("handles an empty string", () => {
    expect(hashToken("")).toBe(createHash("sha256").update("", "utf8").digest("hex"));
  });

  it("produces a 64-character hex string", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
