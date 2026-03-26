import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, hostsTable, propertiesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "fleming2026";

// GET /admin/hosts — list all hosts (CEO only)
router.get("/admin/hosts", async (req, res): Promise<void> => {
  const { ceoPassword } = req.query as Record<string, string>;
  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

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
  const { ceoPassword, email, hostPassword } = req.body ?? {};

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    res.status(400).json({ error: "Email obbligatoria." });
    return;
  }
  if (!hostPassword?.trim()) {
    res.status(400).json({ error: "Password obbligatoria." });
    return;
  }

  const [existing] = await db
    .select()
    .from(hostsTable)
    .where(eq(hostsTable.email, normalizedEmail))
    .limit(1);

  if (existing) {
    // Update password
    const [updated] = await db
      .update(hostsTable)
      .set({ hostPassword: String(hostPassword).trim() })
      .where(eq(hostsTable.email, normalizedEmail))
      .returning();
    logger.info({ email: normalizedEmail }, "Host password updated by CEO");
    res.json({ success: true, email: updated.email, action: "updated" });
  } else {
    // Create new host
    const [created] = await db
      .insert(hostsTable)
      .values({ email: normalizedEmail, hostPassword: String(hostPassword).trim() })
      .returning();
    logger.info({ email: normalizedEmail }, "Host created by CEO");
    res.status(201).json({ success: true, email: created.email, action: "created" });
  }
});

// DELETE /admin/hosts/:email — delete host (CEO only)
router.delete("/admin/hosts/:email", async (req, res): Promise<void> => {
  const { ceoPassword } = req.body ?? {};
  const email = decodeURIComponent(req.params.email).toLowerCase();

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

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
  const { ceoPassword, email } = req.query as Record<string, string>;
  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }
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
