import { Router, type IRouter } from "express";
import { db, leadsTable, hostsTable, propertiesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import { hashHostPassword } from "../lib/passwords";

const router: IRouter = Router();
const VALID_STATUSES = ["Nuovo", "Contattato", "In Trattativa", "Chiuso", "Non Interessato"] as const;

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

router.get("/leads", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
  res.json(leads);
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID non valido." });
    return;
  }

  const [deleted] = await db.delete(leadsTable).where(eq(leadsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Lead non trovato." });
    return;
  }

  logger.info({ id }, "Lead deleted by CEO");
  res.json({ success: true, id });
});

router.put("/leads/:id/status", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const { status } = req.body ?? {};

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID non valido." });
    return;
  }

  if (typeof status !== "string" || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    res.status(400).json({ error: `Stato non valido. Usa: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  const [updated] = await db.update(leadsTable).set({ status }).where(eq(leadsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Lead non trovato." });
    return;
  }

  logger.info({ id, status }, "Lead status updated by CEO");
  res.json(updated);
});

router.post("/leads/:id/convert", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID non valido." });
    return;
  }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead non trovato." });
    return;
  }

  const DEFAULT_PASSWORD = "Benvenuto2026!";
  const normalizedEmail = lead.email.trim().toLowerCase();
  const hashed = await hashHostPassword(DEFAULT_PASSWORD);

  const [existingHost] = await db.select().from(hostsTable).where(eq(hostsTable.email, normalizedEmail)).limit(1);
  const hostCreated = !existingHost;
  if (hostCreated) {
    await db.insert(hostsTable).values({ email: normalizedEmail, hostPassword: hashed });
  }

  const baseSlug = lead.propertyName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "proprieta";

  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const [existing] = await db.select().from(propertiesTable).where(eq(propertiesTable.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${counter++}`;
  }

  await db.insert(propertiesTable).values({
    slug,
    name: lead.propertyName.trim(),
    content: "",
    email: normalizedEmail,
    hostPassword: null,
  });

  await db.update(leadsTable).set({ status: "Chiuso" }).where(eq(leadsTable.id, id));

  logger.info({ id, email: normalizedEmail, slug, hostCreated }, "Lead converted to host+property");
  res.status(201).json({ success: true, email: normalizedEmail, slug, hostCreated, password: DEFAULT_PASSWORD });
});

export default router;
