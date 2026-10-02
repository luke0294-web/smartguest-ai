import { describe, it, expect, vi } from "vitest";
import { CreateDemoProspectBody } from "@workspace/api-zod";

// demoProspects.ts imports the Supabase client, which needs env vars; these tests never touch the DB.
vi.mock("./supabase", () => ({ supabaseAdmin: {} }));
import { buildDemoProspectSlugCandidate, isPersonalizedDemoSlug } from "./demoProspects";

describe("CreateDemoProspectBody limits", () => {
  const valid = { propertyName: "Suite 83 Roma", manualContent: "Trastevere, colazione da Checco." };

  it("accepts a normal request", () => {
    expect(CreateDemoProspectBody.safeParse(valid).success).toBe(true);
  });

  it("rejects a property name longer than 200 characters", () => {
    const r = CreateDemoProspectBody.safeParse({ ...valid, propertyName: "a".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("rejects house info longer than 20,000 characters", () => {
    const r = CreateDemoProspectBody.safeParse({ ...valid, manualContent: "a".repeat(20001) });
    expect(r.success).toBe(false);
  });

  it("rejects a suggested question longer than 500 characters", () => {
    const r = CreateDemoProspectBody.safeParse({ ...valid, suggestedQuestion: "a".repeat(501) });
    expect(r.success).toBe(false);
  });
});

describe("personalized demo slugs", () => {
  it("always start with the reserved demo- prefix", () => {
    const slug = buildDemoProspectSlugCandidate("Casa del Glicine!");
    expect(slug.startsWith("demo-casa-del-glicine-")).toBe(true);
    expect(isPersonalizedDemoSlug(slug)).toBe(true);
  });

  it("does not treat the plain demo slug as personalized", () => {
    expect(isPersonalizedDemoSlug("demo")).toBe(false);
  });

  it("falls back to a safe base when the name has no usable characters", () => {
    expect(buildDemoProspectSlugCandidate("!!!").startsWith("demo-casa-")).toBe(true);
  });
});
