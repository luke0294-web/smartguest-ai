import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

const HOST_TOKEN_SALT = "smartguest-host-session-v1";
const HOST_SESSION_TTL_SEC = 8 * 3600;

/** Prefer HOST_SESSION_SECRET; SESSION_SECRET is accepted so one server secret can suffice. */
export function getHostSessionSecret(): string | undefined {
  const s = process.env.HOST_SESSION_SECRET || process.env.SESSION_SECRET;
  if (s === undefined || s === "") return undefined;
  return s.trim();
}

function hostSigningKey(): Buffer {
  const secret = getHostSessionSecret();
  if (!secret) throw new Error("HOST_SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(HOST_TOKEN_SALT).digest();
}

export interface HostSessionPayload {
  hostId: number;
  email: string;
  exp: number;
}

export function issueHostSessionToken(host: { id: number; email: string }): string {
  const exp = Math.floor(Date.now() / 1000) + HOST_SESSION_TTL_SEC;
  const payload: HostSessionPayload = { hostId: host.id, email: host.email, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", hostSigningKey()).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

export function verifyHostSessionToken(token: string): HostSessionPayload | null {
  try {
    if (!getHostSessionSecret()) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigHex] = parts;
    if (!payloadB64 || !sigHex) return null;

    const expectedSig = createHmac("sha256", hostSigningKey()).update(payloadB64).digest("hex");
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
