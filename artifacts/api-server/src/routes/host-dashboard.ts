import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, propertiesTable, hostsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const CEO_PASSWORD = process.env.CEO_PASSWORD ?? "fleming2026";

// ── Helper: authenticate host by email + password, return host record ───────
async function authenticateHost(email: string, password: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !password) return null;

  const [host] = await db
    .select()
    .from(hostsTable)
    .where(eq(hostsTable.email, normalized))
    .limit(1);

  if (!host || host.hostPassword !== String(password).trim()) return null;
  return host;
}

// POST /api/auth/host-login — email+password → list of owned properties ─────
router.post("/auth/host-login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  const host = await authenticateHost(email, password);
  if (!host) {
    res.status(401).json({ error: "Email o password non corretti." });
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
    .where(eq(propertiesTable.email, host.email))
    .orderBy(propertiesTable.name);

  logger.info({ email: host.email, count: properties.length }, "Host login successful");
  res.json({ email: host.email, properties });
});

// GET /api/host/:slug — get property info (host email+password auth) ─────────
router.get("/host/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const email = req.query["email"] as string | undefined;
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

  // Authenticate via hosts table (new system)
  if (email && hostPassword) {
    const host = await authenticateHost(email, hostPassword);
    if (!host) {
      res.status(401).json({ error: "Credenziali non valide." });
      return;
    }
    if (property.email?.toLowerCase() !== host.email) {
      res.status(403).json({ error: "Non sei il proprietario di questa struttura." });
      return;
    }
    const { hostPassword: _hidden, resetToken: _rt, resetRequestedAt: _rra, ...safe } = property;
    res.json(safe);
    return;
  }

  // Legacy fallback: per-property password (backward compat for old sessions)
  if (hostPassword && property.hostPassword) {
    if (hostPassword !== property.hostPassword) {
      res.status(401).json({ error: "Password non corretta." });
      return;
    }
    const { hostPassword: _hidden, resetToken: _rt, resetRequestedAt: _rra, ...safe } = property;
    res.json(safe);
    return;
  }

  res.status(401).json({ error: "Autenticazione richiesta." });
});

// PUT /api/host/:slug — update property (host email+password auth) ────────────
router.put("/host/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const { email, hostPassword, name, content, whatsappNumber } = req.body ?? {};

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  // Try new hosts-based auth first
  if (email) {
    const host = await authenticateHost(email, hostPassword);
    if (!host) {
      res.status(401).json({ error: "Credenziali non valide." });
      return;
    }
    if (property.email?.toLowerCase() !== host.email) {
      res.status(403).json({ error: "Non sei il proprietario di questa struttura." });
      return;
    }
  } else {
    // Legacy fallback
    if (!property.hostPassword || hostPassword !== property.hostPassword) {
      res.status(401).json({ error: "Password non corretta." });
      return;
    }
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

  const { hostPassword: _hidden, resetToken: _rt, resetRequestedAt: _rra, ...safe } = updated;
  res.json(safe);
});

// PUT /properties/:slug/host-password — set/reset host password (CEO only) ───
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

  // Find the property to get its owner email
  const [property] = await db
    .select({ slug: propertiesTable.slug, email: propertiesTable.email })
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  // Update hosts table if email is assigned
  if (property.email) {
    const [existingHost] = await db
      .select()
      .from(hostsTable)
      .where(eq(hostsTable.email, property.email))
      .limit(1);

    if (existingHost) {
      await db
        .update(hostsTable)
        .set({ hostPassword: String(hostPassword).trim() })
        .where(eq(hostsTable.email, property.email));
    } else {
      await db
        .insert(hostsTable)
        .values({ email: property.email, hostPassword: String(hostPassword).trim() });
    }
    logger.info({ slug, email: property.email }, "Host password updated by CEO via hosts table");
  } else {
    // Fallback: update properties.hostPassword for legacy compat
    await db
      .update(propertiesTable)
      .set({ hostPassword: String(hostPassword).trim() })
      .where(eq(propertiesTable.slug, slug));
    logger.info({ slug }, "Host password updated by CEO on property (no owner email set)");
  }

  res.json({ success: true, slug, hostPasswordSet: true });
});

export default router;
