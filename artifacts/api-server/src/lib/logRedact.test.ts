import { describe, it, expect } from "vitest";
import { maskEmail, redactUrlForLogs } from "./logRedact";

describe("redactUrlForLogs", () => {
  it.each([
    ["/api/auth/reset-password/abc123def", "/api/auth/reset-password/[redacted]"],
    ["/api/auth/setup-password/abc123def", "/api/auth/setup-password/[redacted]"],
    ["/reset-password/tok?x=1", "/reset-password/[redacted]"],
  ])("hides the token in %s", (input, expected) => {
    expect(redactUrlForLogs(input)).toBe(expected);
  });

  it("leaves other paths alone and drops the query string", () => {
    expect(redactUrlForLogs("/api/properties/casa-roma/chat?debug=1")).toBe("/api/properties/casa-roma/chat");
    expect(redactUrlForLogs(undefined)).toBeUndefined();
  });
});

describe("maskEmail", () => {
  it("keeps the domain and first two characters only", () => {
    expect(maskEmail("mario.rossi@gmail.com")).toBe("ma***@gmail.com");
    expect(maskEmail("a@b.it")).toBe("a***@b.it");
  });

  it("never echoes malformed input", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });
});
