import { Router, type IRouter } from "express";
import { eq, isNotNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, propertiesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "fleming2026";

// POST /auth/forgot-password — host requests reset by email
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
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

  // Update password and invalidate token (single use)
  await db
    .update(propertiesTable)
    .set({
      hostPassword: String(newPassword).trim(),
      resetToken: null,
      resetRequestedAt: null,
    })
    .where(eq(propertiesTable.id, property.id));

  logger.info({ slug: property.slug }, "Host password reset via token");
  res.json({ success: true, slug: property.slug });
});

// GET /auth/resets — CEO only — list all pending reset tokens with magic links
router.get("/auth/resets", async (req, res): Promise<void> => {
  const { ceoPassword } = req.query as Record<string, string>;

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

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
  const { slug } = req.params;
  const { ceoPassword } = req.body ?? {};

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

  await db
    .update(propertiesTable)
    .set({ resetToken: null, resetRequestedAt: null })
    .where(eq(propertiesTable.slug, slug));

  logger.info({ slug }, "Reset token cancelled by CEO");
  res.json({ success: true });
});

export default router;
