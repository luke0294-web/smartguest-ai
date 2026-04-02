import type { Request, Response } from "express";
import { supabaseAdmin } from "./supabase";
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
  const { data: row, error } = await supabaseAdmin
    .from("properties")
    .select("email")
    .eq("slug", slug)
    .maybeSingle<{ email: string | null }>();

  if (error) {
    console.error("[ERRORE CRITICO] requireHostOwnsPropertySlug:", error);
    res.status(500).json({ error: "Errore interno del server" });
    return false;
  }

  if (!row) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return false;
  }

  const owner = row.email?.trim().toLowerCase();
  if (!owner || owner !== session.email.toLowerCase()) {
    res.status(403).json({ error: "Non sei il proprietario di questa struttura." });
    return false;
  }

  return true;
}
