import { Router, type IRouter } from "express";
import { db, leadsTable, hostsTable, propertiesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "fleming2026";

const VALID_STATUSES = ["Nuovo", "Contattato", "In Trattativa", "Chiuso", "Non Interessato"] as const;

function simulateWelcomeEmail(email: string, hostName: string): void {
  const smtpUser = process.env.SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? "";
  if (smtpUser && smtpPass) {
    logger.info({ email, hostName }, "Would send welcome email via SMTP (not yet configured)");
  } else {
    logger.info({ email, hostName }, "Email di benvenuto simulata");
    console.log(`[SMTP SIMULATION] Email di benvenuto simulata per ${email} (${hostName})`);
  }
}

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

  // Simulate sending welcome email (no SMTP configured yet)
  simulateWelcomeEmail(email.trim(), hostName.trim());

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

// DELETE /leads/:id — delete a lead (CEO only)
router.delete("/leads/:id", async (req, res): Promise<void> => {
  const { ceoPassword } = req.body ?? {};

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Accesso negato." });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID non valido." });
    return;
  }

  const [deleted] = await db
    .delete(leadsTable)
    .where(eq(leadsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Lead non trovato." });
    return;
  }

  logger.info({ id }, "Lead deleted by CEO");
  res.json({ success: true, id });
});

// PUT /leads/:id/status — update lead status (CEO only)
router.put("/leads/:id/status", async (req, res): Promise<void> => {
  const { ceoPassword, status } = req.body ?? {};

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Accesso negato." });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID non valido." });
    return;
  }

  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Stato non valido. Usa: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  const [updated] = await db
    .update(leadsTable)
    .set({ status })
    .where(eq(leadsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Lead non trovato." });
    return;
  }

  logger.info({ id, status }, "Lead status updated by CEO");
  res.json(updated);
});

// POST /leads/:id/convert — approve lead and create host + property (CEO only)
router.post("/leads/:id/convert", async (req, res): Promise<void> => {
  const { ceoPassword } = req.body ?? {};

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Accesso negato." });
    return;
  }

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

  // Create host if not already existing
  const [existingHost] = await db.select().from(hostsTable).where(eq(hostsTable.email, normalizedEmail)).limit(1);
  const hostCreated = !existingHost;
  if (hostCreated) {
    await db.insert(hostsTable).values({ email: normalizedEmail, hostPassword: DEFAULT_PASSWORD });
  }

  // Generate slug from property name
  const baseSlug = lead.propertyName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "proprieta";

  // Ensure unique slug
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const [existing] = await db.select().from(propertiesTable).where(eq(propertiesTable.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${counter++}`;
  }

  // Create property linked to host
  await db.insert(propertiesTable).values({
    slug,
    name: lead.propertyName.trim(),
    content: "",
    email: normalizedEmail,
    hostPassword: DEFAULT_PASSWORD,
  });

  // Update lead status to Chiuso
  await db.update(leadsTable).set({ status: "Chiuso" }).where(eq(leadsTable.id, id));

  logger.info({ id, email: normalizedEmail, slug, hostCreated }, "Lead converted to host+property");

  res.status(201).json({
    success: true,
    email: normalizedEmail,
    slug,
    hostCreated,
    password: DEFAULT_PASSWORD,
  });
});

export default router;
