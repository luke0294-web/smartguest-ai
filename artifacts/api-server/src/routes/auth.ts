import { Router, type IRouter } from "express";
import { eq, isNotNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, propertiesTable, hostsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireCeoSession, getCeoPassword, issueCeoToken } from "../lib/ceo-session";
import { getHostSessionSecret, verifyHostSessionToken, getHostTokenFromRequest } from "../lib/host-session";
import { hashHostPassword } from "../lib/passwords";
import { authRateLimiter, getClientIp } from "../lib/rateLimiter";

const router: IRouter = Router();

// POST /auth/ceo-login — validate CEO password, issue session token (no env default for password)
router.post("/auth/ceo-login", async (req, res): Promise<void> => {
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
});

// GET /auth/host/me — properties for current host session (Bearer token)
router.get("/auth/host/me", async (req, res): Promise<void> => {
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

  const properties = await db
    .select({
      id: propertiesTable.id,
      slug: propertiesTable.slug,
      name: propertiesTable.name,
      whatsappNumber: propertiesTable.whatsappNumber,
    })
    .from(propertiesTable)
    .where(eq(propertiesTable.email, payload.email))
    .orderBy(propertiesTable.name);

  res.json({ email: payload.email, properties });
});

// POST /auth/forgot-password — host requests reset by email
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
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

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.email, normalizedEmail))
    .limit(1);

  // Always return success to avoid email enumeration
  if (!property) {
    logger.info({ email: normalizedEmail }, "Forgot password: email not found (silent)");
    res.json({ success: true });
    return;
  }

  const token = randomBytes(32).toString("hex");

  await db
    .update(propertiesTable)
    .set({ resetToken: token, resetRequestedAt: new Date() })
    .where(eq(propertiesTable.id, property.id));

  logger.info({ slug: property.slug, email: normalizedEmail }, "Password reset token generated");
  res.json({ success: true });
});

// GET /auth/reset-password/:token — validate token (pre-flight check)
router.get("/auth/reset-password/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  if (!token) {
    res.status(400).json({ valid: false, error: "Token mancante." });
    return;
  }

  const [property] = await db
    .select({ slug: propertiesTable.slug, name: propertiesTable.name })
    .from(propertiesTable)
    .where(eq(propertiesTable.resetToken, token))
    .limit(1);

  if (!property) {
    res.status(404).json({ valid: false, error: "Token non valido o già utilizzato." });
    return;
  }

  res.json({ valid: true, propertyName: property.name, slug: property.slug });
});

// POST /auth/reset-password/:token — consume token + set new password
router.post("/auth/reset-password/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { newPassword } = req.body ?? {};

  if (!token) {
    res.status(400).json({ error: "Token mancante." });
    return;
  }

  if (!newPassword?.trim() || String(newPassword).trim().length < 4) {
    res.status(400).json({ error: "La nuova password deve essere di almeno 4 caratteri." });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.resetToken, token))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Token non valido o già utilizzato." });
    return;
  }

  const trimmed = String(newPassword).trim();
  const hashed = await hashHostPassword(trimmed);
  const ownerEmail = property.email?.trim().toLowerCase() ?? null;

  if (ownerEmail) {
    const [existingHost] = await db
      .select()
      .from(hostsTable)
      .where(eq(hostsTable.email, ownerEmail))
      .limit(1);

    if (existingHost) {
      await db.update(hostsTable).set({ hostPassword: hashed }).where(eq(hostsTable.email, ownerEmail));
    } else {
      await db.insert(hostsTable).values({ email: ownerEmail, hostPassword: hashed });
    }
  }

  await db
    .update(propertiesTable)
    .set({
      hostPassword: ownerEmail ? null : hashed,
      resetToken: null,
      resetRequestedAt: null,
    })
    .where(eq(propertiesTable.id, property.id));

  logger.info({ slug: property.slug }, "Host password reset via token");
  res.json({ success: true, slug: property.slug });
});

// GET /auth/resets — CEO only — list all pending reset tokens with magic links
router.get("/auth/resets", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const pending = await db
    .select({
      slug: propertiesTable.slug,
      name: propertiesTable.name,
      email: propertiesTable.email,
      resetToken: propertiesTable.resetToken,
      resetRequestedAt: propertiesTable.resetRequestedAt,
    })
    .from(propertiesTable)
    .where(isNotNull(propertiesTable.resetToken));

  res.json(pending);
});

// DELETE /auth/resets/:slug — CEO only — clear a pending reset token
router.delete("/auth/resets/:slug", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const { slug } = req.params;

  await db
    .update(propertiesTable)
    .set({ resetToken: null, resetRequestedAt: null })
    .where(eq(propertiesTable.slug, slug));

  logger.info({ slug }, "Reset token cancelled by CEO");
  res.json({ success: true });
});

export default router;
