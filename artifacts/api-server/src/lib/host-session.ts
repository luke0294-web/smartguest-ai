import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

const HOST_TOKEN_SALT = "heycico-host-session-v1";
const HOST_SESSION_TTL_SEC = 8 * 3600;

/** Prefer HOST_SESSION_SECRET; SESSION_SECRET is accepted so one server secret can suffice. */
export function getHostSessionSecret(): string | undefined {
  // Trim each before choosing: a whitespace-only HOST_SESSION_SECRET used to
  // win over a valid SESSION_SECRET, then trim to "" and break every login.
  const s = process.env.HOST_SESSION_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  return s || undefined;
}

/**
 * Signing key includes the host's current bcrypt password hash, not just the
 * server-wide secret — same design as the CEO session (keyed off
 * CEO_PASSWORD itself). This means any password reset changes the key and
 * immediately invalidates every token signed under the old password,
 * without needing a separate token-version column.
 */
function hostSigningKey(passwordHash: string): Buffer {
  const secret = getHostSessionSecret();
  if (!secret) throw new Error("HOST_SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`${HOST_TOKEN_SALT}:${passwordHash}`).digest();
}

export interface HostSessionPayload {
  hostId: number;
  email: string;
  exp: number;
}

export function issueHostSessionToken(host: { id: number; email: string; passwordHash: string }): string {
  const exp = Math.floor(Date.now() / 1000) + HOST_SESSION_TTL_SEC;
  const payload: HostSessionPayload = { hostId: host.id, email: host.email, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", hostSigningKey(host.passwordHash)).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

/**
 * Reads the `hostId` out of a token's payload without verifying its
 * signature yet — used only to know which host's current password hash to
 * fetch before calling `verifyHostSessionToken`. Never trust the returned
 * id for anything but that lookup.
 */
export function peekHostSessionHostId(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64] = parts;
  if (!payloadB64) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      hostId?: unknown;
    };
    return typeof payload.hostId === "number" ? payload.hostId : null;
  } catch {
    return null;
  }
}

export function verifyHostSessionToken(token: string, passwordHash: string): HostSessionPayload | null {
  try {
    if (!getHostSessionSecret()) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigHex] = parts;
    if (!payloadB64 || !sigHex) return null;

    const expectedSig = createHmac("sha256", hostSigningKey(passwordHash)).update(payloadB64).digest("hex");
    const sigBuf = Buffer.from(sigHex, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as HostSessionPayload;
    if (
      typeof payload.hostId !== "number" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getHostTokenFromRequest(req: Request): string | undefined {
  const raw = req.headers["x-host-session"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return t || undefined;
  }
  return undefined;
}
