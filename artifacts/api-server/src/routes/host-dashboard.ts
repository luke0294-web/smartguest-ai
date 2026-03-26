import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "fleming2026";

// GET /host/:slug — get property info (host auth)
router.get("/host/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const hostPassword = req.query["hostPassword"] as string | undefined;

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  if (!property.hostPassword) {
    res.status(401).json({ error: "Nessuna password host impostata. Contatta il CEO." });
    return;
  }

  if (hostPassword !== property.hostPassword) {
    res.status(401).json({ error: "Password non corretta." });
    return;
  }

  // Return without exposing hostPassword
  const { hostPassword: _hidden, ...safe } = property;
  res.json(safe);
});

// PUT /host/:slug — update property (host auth — only name, content, whatsappNumber)
router.put("/host/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const { hostPassword, name, content, whatsappNumber } = req.body ?? {};

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  if (!property.hostPassword || hostPassword !== property.hostPassword) {
    res.status(401).json({ error: "Password non corretta." });
    return;
  }

  const updates: Partial<{ name: string; content: string; whatsappNumber: string | null }> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (content !== undefined) updates.content = String(content);
  if (whatsappNumber !== undefined) updates.whatsappNumber = String(whatsappNumber).trim() || null;

  const [updated] = await db
    .update(propertiesTable)
    .set(updates)
    .where(eq(propertiesTable.slug, slug))
    .returning();

  logger.info({ slug }, "Host updated property");

  const { hostPassword: _hidden, ...safe } = updated;
  res.json(safe);
});

// PUT /properties/:slug/host-password — set/reset host password (CEO only)
router.put("/properties/:slug/host-password", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const { ceoPassword, hostPassword } = req.body ?? {};

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

  if (!hostPassword?.trim()) {
    res.status(400).json({ error: "La password host non può essere vuota." });
    return;
  }

  const [updated] = await db
    .update(propertiesTable)
    .set({ hostPassword: String(hostPassword).trim() })
    .where(eq(propertiesTable.slug, slug))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  logger.info({ slug }, "Host password updated by CEO");
  res.json({ success: true, slug, hostPasswordSet: true });
});

export default router;
