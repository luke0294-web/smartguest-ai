import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

const CEO_TOKEN_SALT = "smartguest-ceo-session-v1";
const CEO_SESSION_TTL_SEC = 8 * 3600;

export function getCeoPassword(): string | undefined {
  const p = process.env.CEO_PASSWORD;
  if (p === undefined || p === "") return undefined;
  return p;
}

function ceoSigningKey(): Buffer {
  const pwd = getCeoPassword();
  if (!pwd) throw new Error("CEO_PASSWORD is not configured");
  return createHmac("sha256", pwd).update(CEO_TOKEN_SALT).digest();
}

export function issueCeoToken(): string {
  const exp = Math.floor(Date.now() / 1000) + CEO_SESSION_TTL_SEC;
  const payloadB64 = Buffer.from(JSON.stringify({ exp, typ: "ceo" as const }), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", ceoSigningKey()).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

export function verifyCeoToken(token: string): boolean {
  try {
    const pwd = getCeoPassword();
    if (!pwd) return false;

    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payloadB64, sigHex] = parts;
    if (!payloadB64 || !sigHex) return false;

    const expectedSig = createHmac("sha256", ceoSigningKey()).update(payloadB64).digest("hex");
    const sigBuf = Buffer.from(sigHex, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expBuf)) return false;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      exp?: number;
      typ?: string;
    };
    if (payload.typ !== "ceo" || typeof payload.exp !== "number") return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export function getCeoTokenFromRequest(req: Request): string | undefined {
  const raw = req.headers["x-ceo-session"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return t || undefined;
  }
  return undefined;
}

/** Returns false after sending error response. */
export function requireCeoSession(req: Request, res: import("express").Response): boolean {
  if (!getCeoPassword()) {
    res.status(503).json({ error: "Server non configurato: impostare CEO_PASSWORD." });
    return false;
  }
  const token = getCeoTokenFromRequest(req);
  if (!token || !verifyCeoToken(token)) {
    res.status(401).json({ error: "Sessione CEO non valida o scaduta." });
    return false;
  }
  return true;
}
