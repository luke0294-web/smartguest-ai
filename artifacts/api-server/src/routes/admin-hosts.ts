import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, hostsTable, propertiesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import { hashHostPassword } from "../lib/passwords";

const router: IRouter = Router();

// GET /admin/hosts — list all hosts (CEO only)
router.get("/admin/hosts", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const hosts = await db
    .select({
      id: hostsTable.id,
      email: hostsTable.email,
      createdAt: hostsTable.createdAt,
    })
    .from(hostsTable)
    .orderBy(hostsTable.email);

  res.json(hosts);
});

// POST /admin/hosts — create or update host (CEO only)
router.post("/admin/hosts", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const { email, hostPassword } = req.body ?? {};

  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    res.status(400).json({ error: "Email obbligatoria." });
    return;
  }
  if (!hostPassword?.trim()) {
    res.status(400).json({ error: "Password obbligatoria." });
    return;
  }

  const hashed = await hashHostPassword(String(hostPassword).trim());

  const [existing] = await db
    .select()
    .from(hostsTable)
    .where(eq(hostsTable.email, normalizedEmail))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(hostsTable)
      .set({ hostPassword: hashed })
      .where(eq(hostsTable.email, normalizedEmail))
      .returning();
    logger.info({ email: normalizedEmail }, "Host password updated by CEO");
    res.json({ success: true, email: updated.email, action: "updated" });
  } else {
    const [created] = await db
      .insert(hostsTable)
      .values({ email: normalizedEmail, hostPassword: hashed })
      .returning();
    logger.info({ email: normalizedEmail }, "Host created by CEO");
    res.status(201).json({ success: true, email: created.email, action: "created" });
  }
});

// DELETE /admin/hosts/:email — delete host (CEO only)
router.delete("/admin/hosts/:email", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const email = decodeURIComponent(req.params.email).toLowerCase();

  const [deleted] = await db
    .delete(hostsTable)
    .where(eq(hostsTable.email, email))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Host non trovato." });
    return;
  }

  logger.info({ email }, "Host deleted by CEO");
  res.sendStatus(204);
});

// GET /admin/properties-by-email — properties for a given owner email (CEO only)
router.get("/admin/properties-by-email", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const { email } = req.query as Record<string, string>;
  if (!email) {
    res.status(400).json({ error: "Email richiesta." });
    return;
  }
  const props = await db
    .select({ id: propertiesTable.id, slug: propertiesTable.slug, name: propertiesTable.name })
    .from(propertiesTable)
    .where(eq(propertiesTable.email, email.trim().toLowerCase()));
  res.json(props);
});

export default router;
