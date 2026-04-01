import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import {
  getHostSessionSecret,
  verifyHostSessionToken,
  getHostTokenFromRequest,
  type HostSessionPayload,
} from "./host-session";

export type { HostSessionPayload };

/**
 * Validates host Bearer / X-Host-Session token. On failure, sends JSON error and returns null.
 * Same usage pattern as requireCeoSession (not Express next()-style middleware).
 */
export function requireHostSession(req: Request, res: Response): HostSessionPayload | null {
  if (!getHostSessionSecret()) {
    res.status(503).json({
      error: "Server non configurato: impostare HOST_SESSION_SECRET o SESSION_SECRET.",
    });
    return null;
  }

  const raw = getHostTokenFromRequest(req);
  if (!raw) {
    res.status(401).json({ error: "Autenticazione richiesta." });
    return null;
  }

  const payload = verifyHostSessionToken(raw);
  if (!payload) {
    res.status(401).json({ error: "Sessione non valida o scaduta." });
    return null;
  }

  return payload;
}

/** Ensures the authenticated host owns the property identified by slug (properties.email matches session). */
export async function requireHostOwnsPropertySlug(
  res: Response,
  session: HostSessionPayload,
  slug: string,
): Promise<boolean> {
  const [property] = await db
    .select({ email: propertiesTable.email })
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return false;
  }

  const owner = property.email?.trim().toLowerCase();
  if (!owner || owner !== session.email.toLowerCase()) {
    res.status(403).json({ error: "Non sei il proprietario di questa struttura." });
    return false;
  }

  return true;
}
