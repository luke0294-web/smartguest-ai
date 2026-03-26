import { Router, type IRouter } from "express";
import { db, leadsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "fleming2026";

// POST /leads — create a lead (public)
router.post("/leads", async (req, res): Promise<void> => {
  const { hostName, email, propertyName } = req.body ?? {};

  if (!hostName?.trim() || !email?.trim() || !propertyName?.trim()) {
    res.status(400).json({ error: "Dati non validi. Controlla nome, email e struttura." });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Email non valida." });
    return;
  }

  const [lead] = await db
    .insert(leadsTable)
    .values({ hostName: hostName.trim(), email: email.trim(), propertyName: propertyName.trim() })
    .returning();

  logger.info({ email, propertyName }, "New lead registered");
  res.status(201).json(lead);
});

// GET /leads?ceoPassword=... — list all leads (CEO only)
router.get("/leads", async (req, res): Promise<void> => {
  if (req.query["ceoPassword"] !== CEO_PASSWORD) {
    res.status(401).json({ error: "Accesso negato." });
    return;
  }

  const leads = await db
    .select()
    .from(leadsTable)
    .orderBy(desc(leadsTable.createdAt));

  res.json(leads);
});

export default router;
