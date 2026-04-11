import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreatePropertyBody,
  UpdatePropertyBody,
  UpdatePropertyParams,
  GetPropertyParams,
  GetPropertyResponse,
  ListPropertiesResponseItem,
  UpdatePropertyResponse,
  DeletePropertyParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import { hashHostPassword, HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT, MIN_HOST_PASSWORD_LENGTH } from "../lib/passwords";
import { generateGuestQrDataUrl } from "../lib/generateQr";
import { DEMO_SLUG, parseDemoPropertyForGet } from "../lib/demoProperty";
import { supabaseAdmin } from "../lib/supabase";
import { isHostWelcomeEmailConfigured, sendHostWelcomeEmail } from "../lib/hostWelcomeMail";

function isInviteTokenExpiredForResend(inviteTokenExpiresAt: string | null | undefined): boolean {
  if (inviteTokenExpiresAt == null || String(inviteTokenExpiresAt).trim() === "") return true;
  const t = new Date(inviteTokenExpiresAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() > t;
}

type SupabasePropertyRowPublic = {
  id: number | string;
  slug: string;
  name: string;
  manual_content?: string | null;
  content?: string | null;
  whatsapp_number?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  pending_questions_count?: number | null;
  pendingQuestionsCount?: number | null;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
};

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

/** Slug URL-safe (allineato al form CEO). */
function normalizePropertySlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Se lo slug non è valorizzato, deriva dal nome come sul frontend. */
function slugFromPropertyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "property";
}

type PropertyCoreMapped = {
  id: number | string;
  slug: string;
  name: string;
  content: string;
  whatsappNumber: string | null;
  pendingQuestionsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Mappa una riga Supabase `properties` al core usato da GetPropertyResponse. */
function mapSupabaseRowToPropertyCore(row: SupabasePropertyRowPublic): PropertyCoreMapped | null {
  const rawId = row.id;
  let id: number | string;
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    id = rawId;
  } else if (typeof rawId === "string") {
    const trimmed = rawId.trim();
    if (!trimmed) return null;
    id = trimmed;
  } else {
    return null;
  }

  const fallbackMs = Date.now();
  return {
    id,
    slug: row.slug,
    name: row.name,
    content: row.manual_content ?? row.content ?? "",
    whatsappNumber: row.whatsapp_number ?? row.whatsappNumber ?? null,
    pendingQuestionsCount: row.pending_questions_count ?? row.pendingQuestionsCount ?? 0,
    createdAt: toValidDate(row.created_at ?? row.createdAt, fallbackMs),
    updatedAt: toValidDate(
      row.updated_at ?? row.updatedAt ?? row.created_at ?? row.createdAt,
      fallbackMs,
    ),
  };
}

/** Matches UUID-shaped primary keys (some deployments use uuid for `properties.id`). */
const UUID_PROPERTY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Public guest read: uses service role (same as chat) so RLS cannot block listing by slug.
 * Tries `slug` first, then numeric `id`, then UUID `id`.
 */
async function loadPropertyBySlugOrId(segment: string): Promise<{
  row: SupabasePropertyRowPublic | null;
  error: { message: string } | null;
}> {
  const from = () => supabaseAdmin.from("properties").select("*");

  const bySlug = await from().eq("slug", segment).maybeSingle<SupabasePropertyRowPublic>();
  if (bySlug.data) return { row: bySlug.data, error: null };
  if (bySlug.error) return { row: null, error: bySlug.error };

  if (/^\d+$/.test(segment)) {
    const idNum = parseInt(segment, 10);
    if (!Number.isNaN(idNum) && idNum > 0) {
      const byId = await from().eq("id", idNum).maybeSingle<SupabasePropertyRowPublic>();
      if (byId.data) return { row: byId.data, error: null };
      if (byId.error) return { row: null, error: byId.error };
    }
  }

  if (UUID_PROPERTY_ID_RE.test(segment)) {
    const byUuid = await from().eq("id", segment).maybeSingle<SupabasePropertyRowPublic>();
    if (byUuid.data) return { row: byUuid.data, error: null };
    if (byUuid.error) return { row: null, error: byUuid.error };
  }

  return { row: null, error: null };
}

const router: IRouter = Router();

// GET /properties — list all (CEO only) → Supabase
router.get("/properties", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const { data: rows, error: listError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });

    if (listError) {
      logger.error({ listError }, "GET /properties — query Supabase fallita");
      res.status(500).json({ error: "Impossibile caricare l'elenco proprietà da Supabase." });
      return;
    }

    const list = rows ?? [];
    type ListRow = SupabasePropertyRowPublic & { email?: string | null };
    type ListPayloadItem = {
      id: number | string;
      slug: string;
      name: string;
      content: string;
      whatsappNumber: string | null;
      createdAt: Date;
      updatedAt: Date;
      email?: string | null;
      pendingQuestionsCount: number;
    };
    const payload: ListPayloadItem[] = [];

    for (const raw of list as ListRow[]) {
      const core = mapSupabaseRowToPropertyCore(raw);
      if (!core) {
        logger.warn({ slug: raw.slug }, "GET /properties — riga saltata (id non valido)");
        continue;
      }

      const item = ListPropertiesResponseItem.parse({
        id: core.id,
        slug: core.slug,
        name: core.name,
        content: core.content,
        whatsappNumber: core.whatsappNumber,
        createdAt: core.createdAt,
        updatedAt: core.updatedAt,
      });

      payload.push({
        ...item,
        email: raw.email?.trim() ? raw.email.trim().toLowerCase() : null,
        pendingQuestionsCount: core.pendingQuestionsCount,
      });
    }

    res.json(payload);
  } catch (error) {
    logger.error({ err: error }, "GET /properties — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// POST /properties — create (CEO only) → Supabase
router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!requireCeoSession(req, res)) return;

  const { slug, name, content, whatsappNumber } = parsed.data;
  const ownerEmail = typeof req.body?.ownerEmail === "string" ? req.body.ownerEmail.trim().toLowerCase() || null : null;

  let finalSlug = normalizePropertySlug(slug);
  if (!finalSlug) {
    finalSlug = slugFromPropertyName(name);
  }

  try {
    const { data: existingRow, error: existingError } = await supabaseAdmin
      .from("properties")
      .select("slug")
      .eq("slug", finalSlug)
      .maybeSingle();

    if (existingError) {
      logger.error({ existingError, finalSlug }, "POST /properties — verifica slug su Supabase fallita");
      res.status(500).json({ error: "Errore durante la verifica dello slug su Supabase." });
      return;
    }

    if (existingRow) {
      res.status(409).json({ error: `Lo slug '${finalSlug}' è già in uso. Scegli un altro nome.` });
      return;
    }

    const bodyContent = content ?? "";

    const { data: row, error: insertError } = await supabaseAdmin
      .from("properties")
      .insert({
        slug: finalSlug,
        name: name.trim(),
        content: bodyContent,
        manual_content: bodyContent,
        whatsapp_number: whatsappNumber?.trim() ? whatsappNumber.trim() : null,
        email: ownerEmail,
        pending_questions_count: 0,
      })
      .select("*")
      .single<SupabasePropertyRowPublic>();

    if (insertError || !row) {
      logger.error({ insertError, finalSlug }, "POST /properties — insert Supabase fallito");
      res.status(500).json({
        error: "Errore durante la creazione della proprietà su Supabase.",
      });
      return;
    }

    const mappedCore = mapSupabaseRowToPropertyCore(row);
    if (!mappedCore) {
      res.status(500).json({ error: "Dati proprietà non validi dopo l'inserimento (id)." });
      return;
    }

    let qrCodeBase64: string;
    try {
      qrCodeBase64 = await generateGuestQrDataUrl(mappedCore.slug);
    } catch (qrErr) {
      logger.error(
        { err: qrErr },
        "POST /properties — generateGuestQrDataUrl fallita",
      );
      res.status(500).json({
        error: "Impossibile generare il QR ospite. Verifica FRONTEND_URL nel .env dell'API.",
      });
      return;
    }

    const payload = { ...mappedCore, qrCodeBase64 };
    const parsedResponse = GetPropertyResponse.safeParse(payload);
    if (!parsedResponse.success) {
      logger.error(
        { zod: parsedResponse.error.flatten(), payloadId: payload.id },
        "POST /properties — validazione GetPropertyResponse fallita",
      );
      res.status(500).json({ error: "Risposta proprietà non valida dopo la creazione." });
      return;
    }

    logger.info({ slug: finalSlug, name: name.trim() }, "Property created (Supabase)");
    res.status(201).json(parsedResponse.data);
  } catch (error) {
    logger.error({ err: error }, "POST /properties — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /properties/:slug — get one (public)
router.get("/properties/:slug", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    if (params.data.slug === DEMO_SLUG) {
      res.json(parseDemoPropertyForGet());
      return;
    }

    const segment = params.data.slug.trim();
    const { row, error: supabaseError } = await loadPropertyBySlugOrId(segment);

    if (supabaseError || !row) {
      logger.warn(
        { slug: segment, supabaseError },
        "GET /properties/:slug — nessuna riga su Supabase (slug/id errato o tabella vuota)",
      );
      res.status(404).json({
        error: "Proprietà non trovata.",
      });
      return;
    }

    const mapped = mapSupabaseRowToPropertyCore(row);
    if (!mapped) {
      res.status(500).json({ error: "Dati proprietà non validi (id)." });
      return;
    }

    let qrCodeBase64: string;
    try {
      qrCodeBase64 = await generateGuestQrDataUrl(mapped.slug);
    } catch (qrErr) {
      logger.error({ err: qrErr, slug: params.data.slug }, "GET /properties/:slug — generateGuestQrDataUrl fallita");
      res.status(500).json({
        error:
          "Impossibile generare il QR ospite. Verifica FRONTEND_URL nel file .env del backend.",
      });
      return;
    }

    const payload = { ...mapped, qrCodeBase64 };
    const parsed = GetPropertyResponse.safeParse(payload);
    if (!parsed.success) {
      logger.error(
        { slug: params.data.slug, zod: parsed.error.flatten(), payloadId: payload.id },
        "GET /properties/:slug — validazione GetPropertyResponse fallita",
      );
      res.status(500).json({
        error:
          "Impossibile serializzare la proprietà dopo Supabase. Controlla id (numero o UUID) e date valide.",
      });
      return;
    }

    res.json(parsed.data);
  } catch (err) {
    logger.error({ err }, "GET /properties/:slug — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno durante il caricamento della proprietà." });
    }
  }
});

// PUT /properties/:slug — update (CEO only) → Supabase
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

  if (!requireCeoSession(req, res)) return;

  try {
    const { name, content, whatsappNumber } = body.data;

    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (content !== undefined) {
      patch.content = content;
      patch.manual_content = content;
    }
    if (whatsappNumber !== undefined) {
      patch.whatsapp_number = whatsappNumber?.trim() ? whatsappNumber.trim() : null;
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nessun campo da aggiornare." });
      return;
    }

    const { data: rows, error } = await supabaseAdmin
      .from("properties")
      .update(patch)
      .eq("slug", params.data.slug)
      .select("*");

    if (error) {
      logger.error({ error, slug: params.data.slug }, "PUT /properties");
      res.status(500).json({ error: "Aggiornamento su Supabase fallito." });
      return;
    }

    const row = rows?.[0] as SupabasePropertyRowPublic | undefined;
    if (!row) {
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    const core = mapSupabaseRowToPropertyCore(row);
    if (!core) {
      res.status(500).json({ error: "Dati proprietà non validi dopo l'aggiornamento." });
      return;
    }

    logger.info({ slug: params.data.slug }, "Property updated");
    res.json(UpdatePropertyResponse.parse(core));
  } catch (error) {
    logger.error({ err: error }, "PUT /properties — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// PUT /properties/:slug/full-edit — inline CEO edit: name, slug, hostPassword (CEO only) → Supabase
router.put("/properties/:slug/full-edit", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const { slug } = req.params;
    const { name, newSlug, hostPassword, email } = req.body ?? {};

    const { data: currentRow, error: curErr } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("slug", slug)
      .maybeSingle<SupabasePropertyRowPublic>();

    if (curErr || !currentRow) {
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    const propPatch: Record<string, unknown> = {};

    if (name !== undefined && String(name).trim()) {
      propPatch.name = String(name).trim();
    }

    if (newSlug !== undefined) {
      const trimmed = String(newSlug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (trimmed && trimmed !== slug) {
        const { data: conflict } = await supabaseAdmin
          .from("properties")
          .select("slug")
          .eq("slug", trimmed)
          .maybeSingle();
        if (conflict) {
          res.status(409).json({ error: `Lo slug "${trimmed}" è già usato da un altro appartamento.` });
          return;
        }
        propPatch.slug = trimmed;
      }
    }

    if (hostPassword !== undefined) {
      const trimmedPw = String(hostPassword).trim();
      const currentEmail = currentRow.email?.trim().toLowerCase() || null;
      const effectiveEmail =
        email !== undefined ? String(email).trim().toLowerCase() || null : currentEmail;

      if (!trimmedPw) {
        propPatch.host_password = null;
      } else if (trimmedPw.length < MIN_HOST_PASSWORD_LENGTH) {
        res.status(400).json({ error: `${HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT}.` });
        return;
      } else if (effectiveEmail) {
        const hashed = await hashHostPassword(trimmedPw);
        const { data: existingHost } = await supabaseAdmin
          .from("hosts")
          .select("email")
          .eq("email", effectiveEmail)
          .maybeSingle();

        if (existingHost) {
          const { error: hErr } = await supabaseAdmin
            .from("hosts")
            .update({ host_password: hashed })
            .eq("email", effectiveEmail);
          if (hErr) {
            logger.error({ hErr }, "full-edit — update host password");
            res.status(500).json({ error: "Impossibile aggiornare la password host." });
            return;
          }
        } else {
          const { error: hIns } = await supabaseAdmin
            .from("hosts")
            .insert({ email: effectiveEmail, host_password: hashed });
          if (hIns) {
            logger.error({ hIns }, "full-edit — insert host");
            res.status(500).json({ error: "Impossibile creare l'host su Supabase." });
            return;
          }
        }
        propPatch.host_password = null;
      } else {
        propPatch.host_password = await hashHostPassword(trimmedPw);
      }
    }

    if (email !== undefined) {
      propPatch.email = String(email).trim().toLowerCase() || null;
    }

    const targetSlug = (typeof propPatch.slug === "string" ? propPatch.slug : slug) as string;

    if (Object.keys(propPatch).length > 0) {
      const { error: updErr } = await supabaseAdmin.from("properties").update(propPatch).eq("slug", slug);
      if (updErr) {
        logger.error({ updErr, slug }, "full-edit — update property");
        res.status(500).json({ error: "Aggiornamento proprietà fallito." });
        return;
      }
    }

    const { data: finalRow, error: finErr } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("slug", targetSlug)
      .maybeSingle<SupabasePropertyRowPublic>();

    if (finErr || !finalRow) {
      res.status(500).json({ error: "Impossibile ricaricare la proprietà dopo l'aggiornamento." });
      return;
    }

    const core = mapSupabaseRowToPropertyCore(finalRow);
    if (!core) {
      res.status(500).json({ error: "Dati proprietà non validi." });
      return;
    }

    const parsed = GetPropertyResponse.safeParse(core);
    if (!parsed.success) {
      logger.error({ zod: parsed.error.flatten() }, "full-edit — GetPropertyResponse");
      res.status(500).json({ error: "Risposta non valida dopo full-edit." });
      return;
    }

    logger.info({ slug: targetSlug, updates: Object.keys(propPatch) }, "Property fully edited by CEO");
    res.json(parsed.data);
  } catch (error) {
    logger.error({ err: error }, "full-edit — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// POST /properties/:slug/resend-host-welcome — CEO: reinvia email benvenuto + PDF (fallback)
router.post("/properties/:slug/resend-host-welcome", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const slug = req.params.slug?.trim();
  if (!slug) {
    res.status(400).json({ error: "Slug mancante." });
    return;
  }

  if (slug === DEMO_SLUG) {
    res.status(400).json({ error: "Non disponibile per la demo." });
    return;
  }

  try {
    const { data: row, error } = await supabaseAdmin
      .from("properties")
      .select("slug, name, email, invite_token, invite_token_expires_at")
      .eq("slug", slug)
      .maybeSingle<{
        slug: string;
        name: string;
        email: string | null;
        invite_token: string | null;
        invite_token_expires_at: string | null;
      }>();

    if (error) {
      logger.error({ error, slug }, "resend-host-welcome select");
      res.status(500).json({ error: "Errore database." });
      return;
    }

    if (!row?.email?.trim()) {
      res.status(400).json({ error: "Nessuna email host per questa proprietà." });
      return;
    }

    if (!isHostWelcomeEmailConfigured()) {
      res.status(503).json({ error: "Invio email non configurato sul server." });
      return;
    }

    let inviteToken = row.invite_token?.trim() ?? "";
    const needsNewToken = !inviteToken || isInviteTokenExpiredForResend(row.invite_token_expires_at);

    if (needsNewToken) {
      inviteToken = randomBytes(32).toString("hex");
      const inviteTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const { error: upErr } = await supabaseAdmin
        .from("properties")
        .update({
          invite_token: inviteToken,
          invite_token_expires_at: inviteTokenExpiresAt,
        })
        .eq("slug", slug);

      if (upErr) {
        logger.error({ upErr, slug }, "resend-host-welcome token update");
        res.status(500).json({ error: "Impossibile aggiornare il token invito." });
        return;
      }
    }

    const displayName = row.email.trim().split("@")[0] || "Host";

    try {
      await sendHostWelcomeEmail({
        to: row.email.trim(),
        hostDisplayName: displayName,
        propertyName: row.name.trim(),
        slug: row.slug,
        inviteToken,
      });
    } catch (sendErr: unknown) {
      logger.error({ slug, err: sendErr }, "resend-host-welcome send failed");
      res.status(500).json({ error: "Errore durante l'invio dell'email. Riprova più tardi." });
      return;
    }

    logger.info({ slug }, "Host welcome email resent by CEO");
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, slug: req.params.slug }, "resend-host-welcome — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// DELETE /properties/:slug — delete (CEO only) → Supabase
router.delete("/properties/:slug", async (req, res): Promise<void> => {
  const params = DeletePropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!requireCeoSession(req, res)) return;

  try {
    const { data: removed, error } = await supabaseAdmin
      .from("properties")
      .delete()
      .eq("slug", params.data.slug)
      .select("slug");

    if (error) {
      logger.error({ error }, "DELETE /properties");
      res.status(500).json({ error: "Eliminazione su Supabase fallita." });
      return;
    }

    if (!removed?.length) {
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    logger.info({ slug: params.data.slug }, "Property deleted");
    res.sendStatus(204);
  } catch (error) {
    logger.error({ err: error }, "DELETE /properties — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

export default router;
