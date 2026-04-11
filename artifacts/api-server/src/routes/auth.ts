import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";
import { requireCeoSession, getCeoPassword, issueCeoToken } from "../lib/ceo-session";
import { getHostSessionSecret, verifyHostSessionToken, getHostTokenFromRequest } from "../lib/host-session";
import { hashHostPassword, HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT, MIN_HOST_PASSWORD_LENGTH } from "../lib/passwords";
import { authRateLimiter, getClientIp } from "../lib/rateLimiter";
import { supabaseAdmin } from "../lib/supabase";
import { isHostWelcomeEmailConfigured, sendPasswordResetEmail } from "../lib/hostWelcomeMail";

const RESET_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function isPasswordResetTokenExpired(resetRequestedAt: string | null | undefined): boolean {
  if (resetRequestedAt == null || String(resetRequestedAt).trim() === "") return true;
  const t = new Date(resetRequestedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > RESET_TOKEN_TTL_MS;
}

function isInviteTokenExpired(inviteTokenExpiresAt: string | null | undefined): boolean {
  if (inviteTokenExpiresAt == null || String(inviteTokenExpiresAt).trim() === "") return true;
  const t = new Date(inviteTokenExpiresAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() > t;
}

const router: IRouter = Router();

// POST /auth/ceo-login — validate CEO password, issue session token (no env default for password)
router.post("/auth/ceo-login", async (req, res): Promise<void> => {
  try {
    const clientIp = getClientIp(req);
    if (!authRateLimiter.check(clientIp)) {
      const retryAfter = authRateLimiter.retryAfterSeconds(clientIp);
      res.status(429).json({ error: "Troppi tentativi di accesso. Riprova più tardi.", retryAfter });
      return;
    }

    const pwd = getCeoPassword();
    if (!pwd) {
      res.status(503).json({ error: "Server non configurato: impostare CEO_PASSWORD." });
      return;
    }

    const { password } = req.body ?? {};
    if (typeof password !== "string" || String(password) !== pwd) {
      res.status(401).json({ error: "Password non corretta." });
      return;
    }

    const token = issueCeoToken();
    res.json({ token });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /auth/host/me — properties for current host session (Bearer token)
router.get("/auth/host/me", async (req, res): Promise<void> => {
  try {
    const secret = getHostSessionSecret();
    if (!secret) {
      res.status(503).json({
        error: "Server non configurato: impostare HOST_SESSION_SECRET o SESSION_SECRET.",
      });
      return;
    }

    const raw = getHostTokenFromRequest(req);
    if (!raw) {
      res.status(401).json({ error: "Autenticazione richiesta." });
      return;
    }

    const payload = verifyHostSessionToken(raw);
    if (!payload) {
      res.status(401).json({ error: "Sessione non valida o scaduta." });
      return;
    }

    const { data: rows, error } = await supabaseAdmin
      .from("properties")
      .select("id, slug, name, whatsapp_number")
      .eq("email", payload.email)
      .order("name");

    if (error) {
      console.error("[ERRORE CRITICO] GET /auth/host/me:", error);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    const properties = (rows ?? []).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      whatsappNumber: r.whatsapp_number,
    }));

    res.json({ email: payload.email, properties });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// POST /auth/forgot-password — host requests reset by email
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  try {
    const clientIp = getClientIp(req);
    if (!authRateLimiter.check(clientIp)) {
      const retryAfter = authRateLimiter.retryAfterSeconds(clientIp);
      res.status(429).json({ error: "Troppe richieste. Riprova più tardi.", retryAfter });
      return;
    }

    const { email } = req.body ?? {};

    if (!email?.trim()) {
      res.status(400).json({ error: "Inserisci un'email valida." });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // More than one property can share the same owner email — without .limit(1), `.maybeSingle()`
    // makes PostgREST return an error (multiple rows), which surfaced as 500 to the client.
    const { data: property, error: selErr } = await supabaseAdmin
      .from("properties")
      .select("id, slug, name")
      .eq("email", normalizedEmail)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: number; slug: string; name: string }>();

    if (selErr) {
      console.error("[ERRORE CRITICO] forgot-password select:", selErr);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    if (!property) {
      logger.info({ email: normalizedEmail }, "Forgot password: email not found (silent)");
      res.json({ success: true });
      return;
    }

    const token = randomBytes(32).toString("hex");

    const { error: updErr } = await supabaseAdmin
      .from("properties")
      .update({
        reset_token: token,
        reset_requested_at: new Date().toISOString(),
      })
      .eq("id", property.id);

    if (updErr) {
      console.error("[ERRORE CRITICO] forgot-password update:", updErr);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    logger.info({ slug: property.slug, email: normalizedEmail }, "Password reset token generated");

    if (isHostWelcomeEmailConfigured()) {
      try {
        await sendPasswordResetEmail({
          to: normalizedEmail,
          propertyName: property.name?.trim() || "la tua struttura",
          resetToken: token,
        });
      } catch (mailErr) {
        console.error("[ERRORE CRITICO] forgot-password send email:", mailErr);
        logger.error(
          { mailErr, slug: property.slug, email: normalizedEmail },
          "Forgot password — email send failed",
        );
        res.status(500).json({ error: "Impossibile inviare l'email di recupero. Riprova più tardi." });
        return;
      }
    } else {
      logger.warn({ slug: property.slug }, "Forgot password — invio email non configurato (Resend), nessuna email inviata");
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /auth/reset-password/:token — validate token (pre-flight check)
router.get("/auth/reset-password/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ valid: false, error: "Token mancante." });
      return;
    }

    const { data: property, error } = await supabaseAdmin
      .from("properties")
      .select("slug, name, reset_requested_at")
      .eq("reset_token", token)
      .maybeSingle<{ slug: string; name: string; reset_requested_at: string | null }>();

    if (error) {
      console.error("[ERRORE CRITICO] reset-password GET:", error);
      res.status(500).json({ valid: false, error: "Errore interno del server" });
      return;
    }

    if (!property) {
      res.status(404).json({ valid: false, error: "Token non valido o già utilizzato." });
      return;
    }

    if (isPasswordResetTokenExpired(property.reset_requested_at)) {
      console.error("[ERRORE CRITICO] Token reset scaduto", { tokenSuffix: token.slice(-6) });
      res.status(410).json({
        valid: false,
        error: "Token scaduto. Richiedi un nuovo reset.",
      });
      return;
    }

    res.json({ valid: true, propertyName: property.name, slug: property.slug });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ valid: false, error: "Errore interno del server" });
    }
  }
});

// POST /auth/reset-password/:token — consume token + set new password
router.post("/auth/reset-password/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body ?? {};

    if (!token) {
      res.status(400).json({ error: "Token mancante." });
      return;
    }

    if (!newPassword?.trim() || String(newPassword).trim().length < MIN_HOST_PASSWORD_LENGTH) {
      res.status(400).json({ error: `${HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT}.` });
      return;
    }

    const { data: property, error: selErr } = await supabaseAdmin
      .from("properties")
      .select("id, slug, email, reset_requested_at")
      .eq("reset_token", token)
      .maybeSingle<{ id: number; slug: string; email: string | null; reset_requested_at: string | null }>();

    if (selErr) {
      console.error("[ERRORE CRITICO] reset-password POST select:", selErr);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    if (!property) {
      res.status(404).json({ error: "Token non valido o già utilizzato." });
      return;
    }

    if (isPasswordResetTokenExpired(property.reset_requested_at)) {
      console.error("[ERRORE CRITICO] Token reset scaduto", { tokenSuffix: token.slice(-6) });
      res.status(410).json({ error: "Token scaduto. Richiedi un nuovo reset." });
      return;
    }

    const trimmed = String(newPassword).trim();
    const hashed = await hashHostPassword(trimmed);
    const ownerEmail = property.email?.trim().toLowerCase() ?? null;

    if (ownerEmail) {
      const { data: existingHost } = await supabaseAdmin
        .from("hosts")
        .select("email")
        .eq("email", ownerEmail)
        .maybeSingle();

      if (existingHost) {
        const { error: uErr } = await supabaseAdmin
          .from("hosts")
          .update({ host_password: hashed })
          .eq("email", ownerEmail);
        if (uErr) {
          console.error("[ERRORE CRITICO] reset-password update host:", uErr);
          res.status(500).json({ error: "Errore interno del server" });
          return;
        }
      } else {
        const { error: iErr } = await supabaseAdmin
          .from("hosts")
          .insert({ email: ownerEmail, host_password: hashed });
        if (iErr) {
          console.error("[ERRORE CRITICO] reset-password insert host:", iErr);
          res.status(500).json({ error: "Errore interno del server" });
          return;
        }
      }
    }

    const { error: pErr } = await supabaseAdmin
      .from("properties")
      .update({
        host_password: ownerEmail ? null : hashed,
        reset_token: null,
        reset_requested_at: null,
      })
      .eq("id", property.id);

    if (pErr) {
      console.error("[ERRORE CRITICO] reset-password update property:", pErr);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    logger.info({ slug: property.slug }, "Host password reset via token");
    res.json({ success: true, slug: property.slug });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /auth/setup-password/:token — primo setup password (invite da conversione lead)
router.get("/auth/setup-password/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ valid: false, error: "Token mancante." });
      return;
    }

    const { data: property, error } = await supabaseAdmin
      .from("properties")
      .select("slug, name, invite_token_expires_at")
      .eq("invite_token", token)
      .maybeSingle<{ slug: string; name: string; invite_token_expires_at: string | null }>();

    if (error) {
      console.error("[ERRORE CRITICO] setup-password GET:", error);
      res.status(500).json({ valid: false, error: "Errore interno del server" });
      return;
    }

    if (!property) {
      res.status(404).json({ valid: false, error: "Token non valido o già utilizzato." });
      return;
    }

    if (isInviteTokenExpired(property.invite_token_expires_at)) {
      console.error("[ERRORE CRITICO] Token invito scaduto", { tokenSuffix: token.slice(-6) });
      res.status(410).json({
        valid: false,
        error: "Token scaduto. Richiedi un nuovo invito al gestore.",
      });
      return;
    }

    res.json({ valid: true, propertyName: property.name, slug: property.slug });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ valid: false, error: "Errore interno del server" });
    }
  }
});

// POST /auth/setup-password/:token — consuma invite e crea/aggiorna password host
router.post("/auth/setup-password/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body ?? {};

    if (!token) {
      res.status(400).json({ error: "Token mancante." });
      return;
    }

    if (!newPassword?.trim() || String(newPassword).trim().length < MIN_HOST_PASSWORD_LENGTH) {
      res.status(400).json({ error: `${HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT}.` });
      return;
    }

    const { data: property, error: selErr } = await supabaseAdmin
      .from("properties")
      .select("id, slug, email, invite_token_expires_at")
      .eq("invite_token", token)
      .maybeSingle<{
        id: number;
        slug: string;
        email: string | null;
        invite_token_expires_at: string | null;
      }>();

    if (selErr) {
      console.error("[ERRORE CRITICO] setup-password POST select:", selErr);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    if (!property) {
      res.status(404).json({ error: "Token non valido o già utilizzato." });
      return;
    }

    if (isInviteTokenExpired(property.invite_token_expires_at)) {
      console.error("[ERRORE CRITICO] Token invito scaduto", { tokenSuffix: token.slice(-6) });
      res.status(410).json({ error: "Token scaduto. Richiedi un nuovo invito al gestore." });
      return;
    }

    const trimmed = String(newPassword).trim();
    const hashed = await hashHostPassword(trimmed);
    const ownerEmail = property.email?.trim().toLowerCase() ?? null;

    if (ownerEmail) {
      const { data: existingHost } = await supabaseAdmin
        .from("hosts")
        .select("email")
        .eq("email", ownerEmail)
        .maybeSingle();

      if (existingHost) {
        const { error: uErr } = await supabaseAdmin
          .from("hosts")
          .update({ host_password: hashed })
          .eq("email", ownerEmail);
        if (uErr) {
          console.error("[ERRORE CRITICO] setup-password update host:", uErr);
          res.status(500).json({ error: "Errore interno del server" });
          return;
        }
      } else {
        const { error: iErr } = await supabaseAdmin
          .from("hosts")
          .insert({ email: ownerEmail, host_password: hashed });
        if (iErr) {
          console.error("[ERRORE CRITICO] setup-password insert host:", iErr);
          res.status(500).json({ error: "Errore interno del server" });
          return;
        }
      }
    }

    const { error: pErr } = await supabaseAdmin
      .from("properties")
      .update({
        host_password: ownerEmail ? null : hashed,
        invite_token: null,
        invite_token_expires_at: null,
      })
      .eq("id", property.id);

    if (pErr) {
      console.error("[ERRORE CRITICO] setup-password update property:", pErr);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    logger.info({ slug: property.slug }, "Host password impostata via invite token");
    res.json({ success: true, slug: property.slug });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /auth/resets — CEO only — list all pending reset tokens with magic links
router.get("/auth/resets", async (req, res): Promise<void> => {
  console.log("[ROTTA CEO] Ricevuta richiesta:", req.path);
  if (!requireCeoSession(req, res)) return;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from("properties")
      .select("slug, name, email, reset_token, reset_requested_at")
      .not("reset_token", "is", null);

    if (error) {
      console.error("[ERRORE CRITICO] GET /auth/resets:", error);
      logger.error({ error }, "GET /auth/resets");
      res.status(500).json({ error: "Impossibile caricare i reset pendenti." });
      return;
    }

    const pending = (rows ?? []).map((r) => ({
      slug: r.slug,
      name: r.name,
      email: r.email,
      resetToken: r.reset_token,
      resetRequestedAt: r.reset_requested_at,
    }));

    res.json(pending);
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// DELETE /auth/resets/:slug — CEO only — clear a pending reset token
router.delete("/auth/resets/:slug", async (req, res): Promise<void> => {
  console.log("[ROTTA CEO] Ricevuta richiesta:", req.path);
  if (!requireCeoSession(req, res)) return;

  try {
    const { slug } = req.params;

    const { error } = await supabaseAdmin
      .from("properties")
      .update({ reset_token: null, reset_requested_at: null })
      .eq("slug", slug);

    if (error) {
      console.error("[ERRORE CRITICO] DELETE /auth/resets:", error);
      logger.error({ error, slug }, "DELETE /auth/resets");
      res.status(500).json({ error: "Impossibile annullare il reset." });
      return;
    }

    logger.info({ slug }, "Reset token cancelled by CEO");
    res.json({ success: true });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

export default router;
