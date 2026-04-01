import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, propertiesTable, hostsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import {
  getHostSessionSecret,
  issueHostSessionToken,
  verifyHostSessionToken,
  getHostTokenFromRequest,
} from "../lib/host-session";
import { hashHostPassword, verifyHostPassword } from "../lib/passwords";

const router: IRouter = Router();

async function authenticateHost(email: string, password: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !password) return null;

  const [host] = await db
    .select()
    .from(hostsTable)
    .where(eq(hostsTable.email, normalized))
    .limit(1);

  if (!host) return null;
  const ok = await verifyHostPassword(host.hostPassword, password);
  if (!ok) return null;

  const legacyPlain =
    !host.hostPassword.startsWith("$2a$") &&
    !host.hostPassword.startsWith("$2b$") &&
    !host.hostPassword.startsWith("$2y$");
  if (legacyPlain) {
    const hashed = await hashHostPassword(password);
    await db.update(hostsTable).set({ hostPassword: hashed }).where(eq(hostsTable.email, normalized));
  }

  return host;
}

async function hostFromSessionToken(token: string) {
  const payload = verifyHostSessionToken(token);
  if (!payload) return null;
  const [host] = await db.select().from(hostsTable).where(eq(hostsTable.id, payload.hostId)).limit(1);
  if (!host || host.email !== payload.email) return null;
  return host;
}

// POST /api/auth/host-login — email+password → list of owned properties + session token
router.post("/auth/host-login", async (req, res): Promise<void> => {
  if (!getHostSessionSecret()) {
    res.status(503).json({
      error: "Server non configurato: impostare HOST_SESSION_SECRET o SESSION_SECRET.",
    });
    return;
  }

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

  const sessionToken = issueHostSessionToken({ id: host.id, email: host.email });

  logger.info({ email: host.email, count: properties.length }, "Host login successful");
  res.json({ email: host.email, properties, sessionToken });
});

// GET /api/host/:slug — get property info (host session or email+password auth)
router.get("/host/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const email = req.query["email"] as string | undefined;
  const hostPassword = req.query["hostPassword"] as string | undefined;
  const qSession = req.query["sessionToken"] as string | undefined;
  const headerSession = getHostTokenFromRequest(req);
  const sessionRaw = headerSession ?? qSession;

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  if (sessionRaw) {
    const host = await hostFromSessionToken(sessionRaw);
    if (!host) {
      res.status(401).json({ error: "Sessione non valida o scaduta." });
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

  if (hostPassword && property.hostPassword) {
    const valid = await verifyHostPassword(property.hostPassword, hostPassword);
    if (!valid) {
      res.status(401).json({ error: "Password non corretta." });
      return;
    }
    const legacyPlain =
      !property.hostPassword.startsWith("$2a$") &&
      !property.hostPassword.startsWith("$2b$") &&
      !property.hostPassword.startsWith("$2y$");
    if (legacyPlain) {
      const hashed = await hashHostPassword(hostPassword);
      await db
        .update(propertiesTable)
        .set({ hostPassword: hashed })
        .where(eq(propertiesTable.slug, slug));
    }
    const { hostPassword: _hidden, resetToken: _rt, resetRequestedAt: _rra, ...safe } = property;
    res.json(safe);
    return;
  }

  res.status(401).json({ error: "Autenticazione richiesta." });
});

// PUT /api/host/:slug — update property (host session or email+password)
router.put("/host/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const { email, hostPassword, name, content, whatsappNumber, sessionToken: bodyToken } = req.body ?? {};

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  const headerSession = getHostTokenFromRequest(req);
  const sessionRaw =
    typeof headerSession === "string"
      ? headerSession
      : typeof bodyToken === "string"
        ? bodyToken
        : undefined;

  if (sessionRaw) {
    const host = await hostFromSessionToken(sessionRaw);
    if (!host) {
      res.status(401).json({ error: "Sessione non valida o scaduta." });
      return;
    }
    if (property.email?.toLowerCase() !== host.email) {
      res.status(403).json({ error: "Non sei il proprietario di questa struttura." });
      return;
    }
  } else if (email) {
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
    if (!property.hostPassword) {
      res.status(401).json({ error: "Password non corretta." });
      return;
    }
    const valid = await verifyHostPassword(property.hostPassword, hostPassword);
    if (!valid) {
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

// PUT /properties/:slug/host-password — set/reset host password (CEO only)
router.put("/properties/:slug/host-password", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const { slug } = req.params;
  const { hostPassword } = req.body ?? {};

  if (!hostPassword?.trim()) {
    res.status(400).json({ error: "La password host non può essere vuota." });
    return;
  }

  const hashed = await hashHostPassword(String(hostPassword).trim());

  const [property] = await db
    .select({ slug: propertiesTable.slug, email: propertiesTable.email })
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, slug))
    .limit(1);

  if (!property) {
    res.status(404).json({ error: "Proprietà non trovata." });
    return;
  }

  if (property.email) {
    const [existingHost] = await db
      .select()
      .from(hostsTable)
      .where(eq(hostsTable.email, property.email))
      .limit(1);

    if (existingHost) {
      await db
        .update(hostsTable)
        .set({ hostPassword: hashed })
        .where(eq(hostsTable.email, property.email));
    } else {
      await db.insert(hostsTable).values({ email: property.email, hostPassword: hashed });
    }
    await db.update(propertiesTable).set({ hostPassword: null }).where(eq(propertiesTable.slug, slug));
    logger.info({ slug, email: property.email }, "Host password updated by CEO via hosts table");
  } else {
    await db
      .update(propertiesTable)
      .set({ hostPassword: hashed })
      .where(eq(propertiesTable.slug, slug));
    logger.info({ slug }, "Host password updated by CEO on property (no owner email set)");
  }

  res.json({ success: true, slug, hostPasswordSet: true });
});

export default router;
