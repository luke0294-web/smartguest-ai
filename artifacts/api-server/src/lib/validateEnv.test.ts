import { describe, it, expect } from "vitest";
import { weakSecretWarnings } from "./validateEnv";

describe("weakSecretWarnings", () => {
  it("flags a short CEO password and a short session secret", () => {
    const warnings = weakSecretWarnings({ CEO_PASSWORD: "fleming2026", SESSION_SECRET: "short" } as NodeJS.ProcessEnv);
    expect(warnings).toHaveLength(2);
  });

  it("is silent for long random secrets", () => {
    const warnings = weakSecretWarnings({
      CEO_PASSWORD: "x".repeat(24),
      HOST_SESSION_SECRET: "y".repeat(48),
    } as NodeJS.ProcessEnv);
    expect(warnings).toEqual([]);
  });

  it("checks SESSION_SECRET when HOST_SESSION_SECRET is blank", () => {
    const warnings = weakSecretWarnings({
      CEO_PASSWORD: "x".repeat(24),
      HOST_SESSION_SECRET: "   ",
      SESSION_SECRET: "tiny",
    } as NodeJS.ProcessEnv);
    expect(warnings).toHaveLength(1);
  });
});
