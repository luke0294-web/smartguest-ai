import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";

const ORIGINAL_ENV = { ...process.env };

// requireHostSession does: supabaseAdmin.from("hosts").select(...).eq(...).maybeSingle()
// requireHostOwnsPropertySlug does: supabaseAdmin.from("properties").select(...).eq(...).maybeSingle()
// Both chains end in maybeSingle(); the mock below lets each test control what
// that call resolves to, keyed by which table .from() was called with.
const maybeSingleResults = new Map<string, { data: unknown; error: unknown }>();

function chain(table: string) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => maybeSingleResults.get(table) ?? { data: null, error: null },
      }),
    }),
  };
}

vi.mock("./supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => chain(table),
  },
}));

const { requireHostSession, requireHostOwnsPropertySlug } = await import("./host-auth");
const { issueHostSessionToken } = await import("./host-session");

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

describe("host-auth", () => {
  beforeEach(() => {
    process.env.HOST_SESSION_SECRET = "test-secret-value";
    maybeSingleResults.clear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("requireHostSession", () => {
    it("returns the session payload for a valid token whose signature matches the DB password hash", async () => {
      const host = { id: 1, email: "host@example.com", passwordHash: "hash-v1" };
      const token = issueHostSessionToken(host);
      maybeSingleResults.set("hosts", { data: { host_password: "hash-v1" }, error: null });

      const req = fakeRequest({ "x-host-session": token });
      const res = fakeResponse();
      const payload = await requireHostSession(req, res);

      expect(payload).not.toBeNull();
      expect(payload?.hostId).toBe(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects (401) when the DB password hash no longer matches the one the token was signed with — the M3 property", async () => {
      const host = { id: 1, email: "host@example.com", passwordHash: "old-hash" };
      const token = issueHostSessionToken(host);
      // Simulates a password reset: the DB now holds a new hash.
      maybeSingleResults.set("hosts", { data: { host_password: "new-hash-after-reset" }, error: null });

      const req = fakeRequest({ "x-host-session": token });
      const res = fakeResponse();
      const payload = await requireHostSession(req, res);

      expect(payload).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("responds 503 when HOST_SESSION_SECRET is not configured", async () => {
      delete process.env.HOST_SESSION_SECRET;
      delete process.env.SESSION_SECRET;
      const req = fakeRequest({ "x-host-session": "irrelevant" });
      const res = fakeResponse();
      const payload = await requireHostSession(req, res);
      expect(payload).toBeNull();
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("responds 401 when no token is present", async () => {
      const req = fakeRequest({});
      const res = fakeResponse();
      const payload = await requireHostSession(req, res);
      expect(payload).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("responds 401 for a malformed token (no extractable hostId)", async () => {
      const req = fakeRequest({ "x-host-session": "garbage" });
      const res = fakeResponse();
      const payload = await requireHostSession(req, res);
      expect(payload).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("responds 401 when the host id from the token has no matching row", async () => {
      const token = issueHostSessionToken({ id: 999, email: "ghost@example.com", passwordHash: "x" });
      maybeSingleResults.set("hosts", { data: null, error: null });

      const req = fakeRequest({ "x-host-session": token });
      const res = fakeResponse();
      const payload = await requireHostSession(req, res);
      expect(payload).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("responds 401 (not 500) when the DB lookup itself errors — fails closed", async () => {
      const token = issueHostSessionToken({ id: 1, email: "host@example.com", passwordHash: "hash-v1" });
      maybeSingleResults.set("hosts", { data: null, error: { message: "connection reset" } });

      const req = fakeRequest({ "x-host-session": token });
      const res = fakeResponse();
      const payload = await requireHostSession(req, res);
      expect(payload).toBeNull();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("requireHostOwnsPropertySlug", () => {
    const session = { hostId: 1, email: "host@example.com", exp: 9999999999 };

    it("returns true when the session email matches the property owner (case-insensitive)", async () => {
      maybeSingleResults.set("properties", { data: { email: "Host@Example.com" }, error: null });
      const res = fakeResponse();
      const ok = await requireHostOwnsPropertySlug(res, session, "my-slug");
      expect(ok).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("responds 404 when the property does not exist", async () => {
      maybeSingleResults.set("properties", { data: null, error: null });
      const res = fakeResponse();
      const ok = await requireHostOwnsPropertySlug(res, session, "missing-slug");
      expect(ok).toBe(false);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("responds 403 when the session email does not match the owner", async () => {
      maybeSingleResults.set("properties", { data: { email: "someone-else@example.com" }, error: null });
      const res = fakeResponse();
      const ok = await requireHostOwnsPropertySlug(res, session, "not-mine");
      expect(ok).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("responds 403 when the property has no owner email at all", async () => {
      maybeSingleResults.set("properties", { data: { email: null }, error: null });
      const res = fakeResponse();
      const ok = await requireHostOwnsPropertySlug(res, session, "orphan-property");
      expect(ok).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("responds 500 when the DB lookup errors", async () => {
      maybeSingleResults.set("properties", { data: null, error: { message: "boom" } });
      const res = fakeResponse();
      const ok = await requireHostOwnsPropertySlug(res, session, "slug");
      expect(ok).toBe(false);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
