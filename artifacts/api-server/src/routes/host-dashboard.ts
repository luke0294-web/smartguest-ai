import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { HostPropertyResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import {
  getHostSessionSecret,
  issueHostSessionToken,
} from "../lib/host-session";
import { requireHostSession, requireHostOwnsPropertySlug } from "../lib/host-auth";
import {
  hashHostPassword,
  verifyHostPassword,
  HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT,
  MIN_HOST_PASSWORD_LENGTH,
} from "../lib/passwords";
import { authRateLimiter, getClientIp } from "../lib/rateLimiter";
import { generateGuestQrDataUrl } from "../lib/generateQr";
import { supabase, supabaseAdmin } from "../lib/supabase";
import { propertyRowToCamel, type PropertyRowSnake } from "../lib/supabaseMaps";

const router: IRouter = Router();

/** Plain text only: strip script tags, cap length (stored in DB + chat context). */
function sanitizeReferralLinksInput(raw: unknown): string {
  return String(raw ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?script[^>]*>/gi, "")
    .trim()
    .slice(0, 2000);
}

function toValidDate(value: unknown, fallbackMs: number): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (value !== null && value !== undefined && value !== "") {
    const d = new Date(value as string | number);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(fallbackMs);
}

type HostRow = { id: number; email: string; host_password: string };

async function authenticateHost(
  email: string,
  password: string,
): Promise<HostRow | null> {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !password) return null;

  const { data: host, error } = await supabaseAdmin
    .from("hosts")
    .select("id, email, host_password")
    .eq("email", normalized)
    .maybeSingle<HostRow>();

  if (error || !host) return null;

  const ok = await verifyHostPassword(host.host_password, password);
  if (!ok) return null;

  const legacyPlain =
    !host.host_password.startsWith("$2a$") &&
    !host.host_password.startsWith("$2b$") &&
    !host.host_password.startsWith("$2y$");
  if (legacyPlain) {
    const hashed = await hashHostPassword(password);
    await supabaseAdmin.from("hosts").update({ host_password: hashed }).eq("email", normalized);
  }

  return host;
}

async function ensureLocalHostShell(email: string): Promise<HostRow> {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("hosts")
    .select("id, email, host_password")
    .eq("email", email)
    .maybeSingle<HostRow>();

  if (selErr) {
    throw selErr;
  }
  if (existing) return existing;

  const placeholderSecret = randomBytes(24).toString("base64url");
  const placeholderHash = await hashHostPassword(placeholderSecret);
  const { data: created, error: insErr } = await supabaseAdmin
    .from("hosts")
    .insert({ email, host_password: placeholderHash })
    .select("id, email, host_password")
    .single<HostRow>();

  if (insErr || !created) {
    throw insErr ?? new Error("ensureLocalHostShell: insert failed");
  }
  return created;
}

// POST /api/auth/host-login — email+password → list of owned properties + session token
router.post("/auth/host-login", async (req, res): Promise<void> => {
  try {
    const clientIp = getClientIp(req);
    if (!authRateLimiter.check(clientIp)) {
      const retryAfter = authRateLimiter.retryAfterSeconds(clientIp);
      res.status(429).json({ error: "Troppi tentativi di accesso. Riprova più tardi.", retryAfter });
      return;
    }

    if (!getHostSessionSecret()) {
      res.status(503).json({
        error: "Server non configurato: impostare HOST_SESSION_SECRET o SESSION_SECRET.",
      });
      return;
    }

    const { email, password } = req.body ?? {};

    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

    let host = await authenticateHost(normalizedEmail, normalizedPassword);
    if (!host) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });
      if (error || !data.user) {
        console.error("[ERRORE CRITICO] auth/host-login credenziali o Supabase auth:", error?.message ?? error);
        res.status(401).json({ error: "Email o password non corretti." });
        return;
      }
      host = await ensureLocalHostShell(normalizedEmail);
    }

    const { data: propRows, error: propErr } = await supabaseAdmin
      .from("properties")
      .select("id, slug, name, whatsapp_number")
      .eq("email", host.email)
      .order("name");

    if (propErr) {
      console.error("[ERRORE CRITICO] host-login properties:", propErr);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    const properties = (propRows ?? []).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      whatsappNumber: r.whatsapp_number,
    }));

    const sessionToken = issueHostSessionToken({ id: host.id, email: host.email });

    logger.info({ email: host.email, count: properties.length }, "Host login successful");
    res.json({ email: host.email, properties, sessionToken });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /api/host/:slug — get property info (host session only)
router.get("/host/:slug", async (req, res): Promise<void> => {
  try {
    const session = requireHostSession(req, res);
    if (!session) return;

    const { slug } = req.params;

    if (!(await requireHostOwnsPropertySlug(res, session, slug))) return;

    const { data: row, error } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !row) {
      console.error("[ERRORE CRITICO] GET /host/:slug proprietà non trovata:", slug, error);
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    const normalized = propertyRowToCamel(row as PropertyRowSnake);
    const { hostPassword: _hidden, resetToken: _rt, resetRequestedAt: _rra, ...safe } = normalized;
    const fallbackMs = Date.now();
    const withDates = {
      ...safe,
      createdAt: toValidDate(safe.createdAt, fallbackMs),
      updatedAt: toValidDate(safe.updatedAt, fallbackMs),
    };

    let qrCodeBase64: string | undefined;
    try {
      qrCodeBase64 = await generateGuestQrDataUrl(withDates.slug);
    } catch (qrErr) {
      logger.warn(
        { err: qrErr, slug },
        "GET /host/:slug — generateGuestQrDataUrl fallita",
      );
      qrCodeBase64 = undefined;
    }

    const payload = qrCodeBase64 ? { ...withDates, qrCodeBase64 } : withDates;
    const parsed = HostPropertyResponse.safeParse(payload);
    if (!parsed.success) {
      console.error("[ERRORE CRITICO] GET /host/:slug Zod HostPropertyResponse:", parsed.error.flatten(), {
        propertyId: withDates.id,
        idType: typeof withDates.id,
      });
      res.status(500).json({
        error:
          "Risposta proprietà non valida (validazione). Controlla i log server per dettagli Zod.",
      });
      return;
    }

    res.json(parsed.data);
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// PUT /api/host/:slug — update property (host session only)
router.put("/host/:slug", async (req, res): Promise<void> => {
  try {
    const session = requireHostSession(req, res);
    if (!session) return;

    const { slug } = req.params;
    const { name, content, whatsappNumber, referralLinks } = req.body ?? {};
    if (!(await requireHostOwnsPropertySlug(res, session, slug))) return;

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("slug", slug)
      .maybeSingle<{ id: number }>();

    if (selErr || !existing) {
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    const updates: Record<string, string | null> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (content !== undefined) {
      updates.content = String(content);
      updates.manual_content = String(content);
    }
    if (whatsappNumber !== undefined) {
      updates.whatsapp_number = String(whatsappNumber).trim() || null;
    }
    if (referralLinks !== undefined) {
      updates.referral_links = sanitizeReferralLinksInput(referralLinks);
    }

    let updatedRows: PropertyRowSnake | null = null;
    if (Object.keys(updates).length > 0) {
      const { data, error: updErr } = await supabaseAdmin
        .from("properties")
        .update(updates)
        .eq("slug", slug)
        .select("*")
        .maybeSingle();

      if (updErr || !data) {
        console.error("[ERRORE CRITICO] PUT /host/:slug:", updErr);
        res.status(500).json({ error: "Errore interno del server" });
        return;
      }
      updatedRows = data as PropertyRowSnake;
    } else {
      const { data, error: readErr } = await supabaseAdmin
        .from("properties")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (readErr || !data) {
        console.error("[ERRORE CRITICO] PUT /host/:slug read:", readErr);
        res.status(500).json({ error: "Errore interno del server" });
        return;
      }
      updatedRows = data as PropertyRowSnake;
    }

    logger.info({ slug }, "Host updated property");

    const normalized = propertyRowToCamel(updatedRows);
    const { hostPassword: _hidden, resetToken: _rt, resetRequestedAt: _rra, ...safe } = normalized;
    res.json(safe);
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// POST /api/host/:slug/reset-pending-questions — reset diario badge counter (host session only)
router.post("/host/:slug/reset-pending-questions", async (req, res): Promise<void> => {
  try {
    const session = requireHostSession(req, res);
    if (!session) return;

    const { slug } = req.params;
    if (!(await requireHostOwnsPropertySlug(res, session, slug))) return;

    const { error } = await supabaseAdmin
      .from("properties")
      .update({ pending_questions_count: 0 })
      .eq("slug", slug);

    if (error) {
      console.error("[ERRORE CRITICO] reset-pending-questions:", error);
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    res.json({ success: true, pendingQuestionsCount: 0 });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// POST /api/host/:slug/resolve-all-logs — mark all chat logs resolved + clear pending badge (host session only)
router.post("/host/:slug/resolve-all-logs", async (req, res): Promise<void> => {
  try {
    const session = requireHostSession(req, res);
    if (!session) return;

    const { slug } = req.params;
    if (!(await requireHostOwnsPropertySlug(res, session, slug))) return;

    const { error: logsErr } = await supabaseAdmin
      .from("chat_logs")
      .update({ resolved: true })
      .eq("property_slug", slug)
      .eq("resolved", false);

    if (logsErr) {
      console.error("[ERRORE CRITICO] resolve-all-logs chat_logs:", logsErr);
      logger.error({ logsErr, slug }, "resolve-all-logs chat_logs update failed");
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    const { error: pendingErr } = await supabaseAdmin
      .from("properties")
      .update({ pending_questions_count: 0 })
      .eq("slug", slug);

    if (pendingErr) {
      console.error("[ERRORE CRITICO] resolve-all-logs properties:", pendingErr);
      logger.error({ pendingErr, slug }, "resolve-all-logs pending_questions_count update failed");
      res.status(500).json({ error: "Errore interno del server" });
      return;
    }

    res.json({ success: true, pendingQuestionsCount: 0 });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    logger.error({ error }, "resolve-all-logs");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// PUT /properties/:slug/host-password — set/reset host password (CEO only) → Supabase (service role)
router.put("/properties/:slug/host-password", async (req, res): Promise<void> => {
  try {
    if (!requireCeoSession(req, res)) return;

    const { slug } = req.params;
    const { hostPassword } = req.body ?? {};

    const trimmedHostPw = String(hostPassword ?? "").trim();
    if (!trimmedHostPw) {
      res.status(400).json({ error: "La password host non può essere vuota." });
      return;
    }
    if (trimmedHostPw.length < MIN_HOST_PASSWORD_LENGTH) {
      res.status(400).json({ error: `${HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT}.` });
      return;
    }

    const hashed = await hashHostPassword(trimmedHostPw);

    const { data: property, error: propErr } = await supabaseAdmin
      .from("properties")
      .select("slug, email")
      .eq("slug", slug)
      .maybeSingle<{ slug: string; email: string | null }>();

    if (propErr || !property) {
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    const ownerEmail = property.email?.trim().toLowerCase() || null;

    if (ownerEmail) {
      const { data: existingHost } = await supabaseAdmin
        .from("hosts")
        .select("email")
        .eq("email", ownerEmail)
        .maybeSingle();

      if (existingHost) {
        const { error: uErr } = await supabaseAdmin
          .from("hosts")
          .update({ host_password: hashed })
          .eq("email", ownerEmail);
        if (uErr) {
          console.error("[ERRORE CRITICO] host-password update host:", uErr);
          logger.error({ uErr }, "host-password — update host");
          res.status(500).json({ error: "Impossibile aggiornare la password host." });
          return;
        }
      } else {
        const { error: iErr } = await supabaseAdmin
          .from("hosts")
          .insert({ email: ownerEmail, host_password: hashed });
        if (iErr) {
          console.error("[ERRORE CRITICO] host-password insert host:", iErr);
          logger.error({ iErr }, "host-password — insert host");
          res.status(500).json({ error: "Impossibile creare l'host su Supabase." });
          return;
        }
      }

      const { error: pErr } = await supabaseAdmin
        .from("properties")
        .update({ host_password: null })
        .eq("slug", slug);
      if (pErr) {
        console.error("[ERRORE CRITICO] host-password clear property:", pErr);
        logger.error({ pErr }, "host-password — clear property host_password");
        res.status(500).json({ error: "Aggiornamento proprietà fallito." });
        return;
      }

      logger.info({ slug, email: ownerEmail }, "Host password updated by CEO via hosts table");
    } else {
      const { error: pErr } = await supabaseAdmin
        .from("properties")
        .update({ host_password: hashed })
        .eq("slug", slug);
      if (pErr) {
        console.error("[ERRORE CRITICO] host-password property-only:", pErr);
        logger.error({ pErr }, "host-password — property-only password");
        res.status(500).json({ error: "Aggiornamento proprietà fallito." });
        return;
      }
      logger.info({ slug }, "Host password updated by CEO on property (no owner email set)");
    }

    res.json({ success: true, slug, hostPasswordSet: true });
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

export default router;
