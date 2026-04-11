import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import { authRateLimiter, getClientIp } from "../lib/rateLimiter";
import { supabaseAdmin } from "../lib/supabase";
import { isHostWelcomeEmailConfigured, sendHostWelcomeEmail } from "../lib/hostWelcomeMail";

const router: IRouter = Router();
const VALID_STATUSES = ["Nuovo", "Contattato", "In Trattativa", "Chiuso", "Non Interessato"] as const;

type LeadRow = {
  id: number;
  host_name: string;
  email: string;
  property_name: string;
  status: string;
  created_at: string;
};

function mapLeadToApi(row: LeadRow) {
  return {
    id: row.id,
    hostName: row.host_name,
    email: row.email,
    propertyName: row.property_name,
    status: row.status,
    createdAt: row.created_at,
  };
}

router.post("/leads", async (req, res): Promise<void> => {
  try {
    const clientIp = getClientIp(req);
    if (!authRateLimiter.check(clientIp)) {
      const retryAfter = authRateLimiter.retryAfterSeconds(clientIp);
      res.status(429).json({ error: "Troppe richieste. Riprova più tardi.", retryAfter });
      return;
    }

    const { hostName, email, propertyName } = req.body ?? {};

    if (!hostName?.trim() || !email?.trim() || !propertyName?.trim()) {
      res.status(400).json({ error: "Dati non validi. Controlla nome, email e struttura." });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Email non valida." });
      return;
    }

    const { data: row, error } = await supabaseAdmin
      .from("leads")
      .insert({
        host_name: hostName.trim(),
        email: email.trim(),
        property_name: propertyName.trim(),
        status: "Nuovo",
      })
      .select("*")
      .single<LeadRow>();

    if (error || !row) {
      logger.error({ error }, "POST /leads — insert Supabase");
      res.status(500).json({ error: "Impossibile registrare la richiesta. Riprova più tardi." });
      return;
    }

    logger.info({ email, propertyName }, "New lead registered");
    res.status(201).json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "POST /leads — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

router.get("/leads", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ error }, "GET /leads");
      res.status(500).json({ error: "Impossibile caricare i lead." });
      return;
    }

    res.json((rows as LeadRow[] | null)?.map(mapLeadToApi) ?? []);
  } catch (error) {
    logger.error({ err: error }, "GET /leads — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID non valido." });
      return;
    }

    const { data: deleted, error } = await supabaseAdmin.from("leads").delete().eq("id", id).select("id");

    if (error) {
      logger.error({ error }, "DELETE /leads");
      res.status(500).json({ error: "Impossibile eliminare il lead." });
      return;
    }

    if (!deleted?.length) {
      res.status(404).json({ error: "Lead non trovato." });
      return;
    }

    logger.info({ id }, "Lead deleted by CEO");
    res.json({ success: true, id });
  } catch (error) {
    logger.error({ err: error }, "DELETE /leads — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

router.put("/leads/:id/status", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
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

    const { data: rows, error } = await supabaseAdmin
      .from("leads")
      .update({ status })
      .eq("id", id)
      .select("*");

    if (error) {
      logger.error({ error }, "PUT /leads status");
      res.status(500).json({ error: "Impossibile aggiornare lo stato." });
      return;
    }

    const updated = rows?.[0] as LeadRow | undefined;
    if (!updated) {
      res.status(404).json({ error: "Lead non trovato." });
      return;
    }

    logger.info({ id, status }, "Lead status updated by CEO");
    res.json(mapLeadToApi(updated));
  } catch (error) {
    logger.error({ err: error }, "PUT /leads status — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

router.post("/leads/:id/convert", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID non valido." });
      return;
    }

    const { data: leadRow, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle<LeadRow>();

    if (leadErr || !leadRow) {
      res.status(404).json({ error: "Lead non trovato." });
      return;
    }

    const normalizedEmail = leadRow.email.trim().toLowerCase();
    const inviteToken = randomBytes(32).toString("hex");
    const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const baseSlug = leadRow.property_name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "proprieta";

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const { data: clash } = await supabaseAdmin.from("properties").select("slug").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${baseSlug}-${counter++}`;
    }

    const { error: propInsErr } = await supabaseAdmin.from("properties").insert({
      slug,
      name: leadRow.property_name.trim(),
      content: "",
      manual_content: "",
      email: normalizedEmail,
      pending_questions_count: 0,
      invite_token: inviteToken,
      invite_token_expires_at: inviteTokenExpiresAt,
    });

    if (propInsErr) {
      logger.error({ propInsErr, slug }, "Lead convert — insert property failed");
      res.status(500).json({ error: "Impossibile creare la proprietà su Supabase." });
      return;
    }

    const { error: leadUpdErr } = await supabaseAdmin.from("leads").update({ status: "Chiuso" }).eq("id", id);

    if (leadUpdErr) {
      logger.warn({ leadUpdErr, id }, "Lead convert — stato lead non aggiornato");
    }

    let emailSent = false;
    if (isHostWelcomeEmailConfigured()) {
      try {
        await sendHostWelcomeEmail({
          to: normalizedEmail,
          hostDisplayName: leadRow.host_name.trim(),
          propertyName: leadRow.property_name.trim(),
          slug,
          inviteToken,
        });
        emailSent = true;
      } catch (mailErr: unknown) {
        logger.error({ slug, email: normalizedEmail, err: mailErr }, "Lead convert — welcome email failed");
        res.status(500).json({ error: "Errore durante l'invio dell'email. Riprova più tardi." });
        return;
      }
    } else {
      logger.warn({ slug }, "Lead convert — invio email non configurato (Resend), email di benvenuto non inviata");
    }

    logger.info({ id, email: normalizedEmail, slug, emailSent }, "Lead converted to property + invite token");
    res.status(201).json({
      success: true,
      slug,
      emailSent,
    });
  } catch (error) {
    logger.error({ err: error }, "POST /leads/:id/convert — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

export default router;
