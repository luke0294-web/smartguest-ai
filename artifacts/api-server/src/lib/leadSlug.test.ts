import { describe, it, expect } from "vitest";
import { isReservedPropertySlug } from "@workspace/api-zod";
import { leadSlugBase, leadSlugCandidate } from "./leadSlug";

describe("leadSlug", () => {
  it("slugifies a normal property name", () => {
    expect(leadSlugBase("Casa Roma")).toBe("casa-roma");
    expect(leadSlugBase("  B&B Trastevere 94 ")).toBe("bb-trastevere-94");
  });

  it("falls back to a default for names with no usable characters", () => {
    expect(leadSlugBase("!!!")).toBe("proprieta");
  });

  it.each(["Demo", "demo", "Demo Casa Roma", "Dashboard"])(
    "never returns a reserved base for %j (would loop forever)",
    (name) => {
      const base = leadSlugBase(name);
      expect(isReservedPropertySlug(base)).toBe(false);
      expect(isReservedPropertySlug(leadSlugCandidate(base))).toBe(false);
    },
  );

  it("adds a 4-char random suffix so guest links can't be guessed from the name", () => {
    const candidate = leadSlugCandidate("casa-roma");
    expect(candidate).toMatch(/^casa-roma-[a-z0-9]{4}$/);
  });

  it("caps very long names", () => {
    const base = leadSlugBase("a".repeat(500));
    expect(base.length).toBeLessThanOrEqual(50);
  });
});
