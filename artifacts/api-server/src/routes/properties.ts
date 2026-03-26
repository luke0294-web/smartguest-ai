import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import {
  CreatePropertyBody,
  UpdatePropertyBody,
  UpdatePropertyParams,
  GetPropertyParams,
  GetPropertyResponse,
  UpdatePropertyResponse,
  DeletePropertyParams,
  DeletePropertyBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "fleming2026";

// GET /properties — list all (CEO only)
router.get("/properties", async (req, res): Promise<void> => {
  const ceoPassword = req.query["ceoPassword"];
  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta. Accesso negato." });
    return;
  }

  const rows = await db
    .select()
    .from(propertiesTable)
    .orderBy(propertiesTable.createdAt);

  // Return full rows to CEO (includes hostPassword) — not parsed through the public schema
  res.json(rows);
});

// POST /properties — create (CEO only)
router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ceoPassword, slug, name, content, whatsappNumber } = parsed.data;

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

  // Check slug uniqueness
  const existing = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: `Lo slug '${slug}' è già in uso. Scegli un altro nome.` });
    return;
  }

  const [created] = await db
    .insert(propertiesTable)
    .values({ slug, name, content: content ?? "", whatsappNumber: whatsappNumber ?? null })
    .returning();

  logger.info({ slug, name }, "Property created");
  res.status(201).json(GetPropertyResponse.parse(created));
});

// GET /properties/:slug — get one (public)
router.get("/properties/:slug", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, params.data.slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: `Proprietà '${params.data.slug}' non trovata.` });
    return;
  }

  res.json(GetPropertyResponse.parse(property));
});

// PUT /properties/:slug — update (CEO only)
router.put("/properties/:slug", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdatePropertyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { ceoPassword, name, content, whatsappNumber } = body.data;

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

  const updateData: Partial<{ name: string; content: string; whatsappNumber: string | null }> = {};
  if (name !== undefined) updateData.name = name;
  if (content !== undefined) updateData.content = content;
  if (whatsappNumber !== undefined) updateData.whatsappNumber = whatsappNumber;

  const [updated] = await db
    .update(propertiesTable)
    .set(updateData)
    .where(eq(propertiesTable.slug, params.data.slug))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  logger.info({ slug: params.data.slug }, "Property updated");
  res.json(UpdatePropertyResponse.parse(updated));
});

// PUT /properties/:slug/full-edit — inline CEO edit: name, slug, hostPassword (CEO only)
router.put("/properties/:slug/full-edit", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const { ceoPassword, name, newSlug, hostPassword, email } = req.body ?? {};

  if (ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

  const [current] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  const updates: Partial<{ name: string; slug: string; hostPassword: string | null; email: string | null }> = {};

  if (name !== undefined && String(name).trim()) {
    updates.name = String(name).trim();
  }

  if (newSlug !== undefined) {
    const trimmed = String(newSlug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (trimmed && trimmed !== slug) {
      // Check uniqueness
      const [conflict] = await db
        .select({ id: propertiesTable.id })
        .from(propertiesTable)
        .where(eq(propertiesTable.slug, trimmed))
        .limit(1);
      if (conflict) {
        res.status(409).json({ error: `Lo slug "${trimmed}" è già usato da un altro appartamento.` });
        return;
      }
      updates.slug = trimmed;
    }
  }

  if (hostPassword !== undefined) {
    const trimmed = String(hostPassword).trim();
    updates.hostPassword = trimmed || null;
  }

  if (email !== undefined) {
    const trimmed = String(email).trim().toLowerCase();
    updates.email = trimmed || null;
  }

  if (Object.keys(updates).length === 0) {
    res.json(current);
    return;
  }

  const [updated] = await db
    .update(propertiesTable)
    .set(updates)
    .where(eq(propertiesTable.slug, slug))
    .returning();

  logger.info({ slug, updates: Object.keys(updates) }, "Property fully edited by CEO");
  res.json(updated);
});

// DELETE /properties/:slug — delete (CEO only)
router.delete("/properties/:slug", async (req, res): Promise<void> => {
  const params = DeletePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = DeletePropertyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.ceoPassword !== CEO_PASSWORD) {
    res.status(401).json({ error: "Password CEO non corretta." });
    return;
  }

  const [deleted] = await db
    .delete(propertiesTable)
    .where(eq(propertiesTable.slug, params.data.slug))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  logger.info({ slug: params.data.slug }, "Property deleted");
  res.sendStatus(204);
});

export default router;
