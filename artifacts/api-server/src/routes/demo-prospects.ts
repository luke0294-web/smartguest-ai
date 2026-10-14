import { Router, type IRouter } from "express";
import {
  CreateDemoProspectBody,
  CreateDemoProspectResponse,
  ListDemoProspectsResponse,
  DeleteDemoProspectResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import { supabaseAdmin } from "../lib/supabase";
import {
  buildDemoProspectSlugCandidate,
  mapDemoProspectRowToApi,
} from "../lib/demoProspects";

const router: IRouter = Router();

const MAX_SLUG_GENERATION_ATTEMPTS = 5;

// POST /demo-prospects — create a personalized demo link (CEO only)
router.post("/demo-prospects", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const parsed = CreateDemoProspectBody.safeParse(req.body);
  if (!parsed.success) {
    // Zod's error.message is the JSON dump of every issue: show one readable
    // message instead (the length limits carry their own Italian text).
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "dati";
    res.status(400).json({
      error: issue?.code === "too_big" ? issue.message : `Campo "${field}" mancante o non valido.`,
    });
    return;
  }

  const { propertyName, manualContent, suggestedQuestion } = parsed.data;
  if (!propertyName.trim() || !manualContent.trim()) {
    res.status(400).json({ error: "Nome struttura e info sulla casa sono obbligatori." });
    return;
  }

  try {
    let insertedRow: {
      slug: string;
      property_name: string;
      manual_content: string;
      suggested_question: string | null;
      first_message_at: string | null;
      created_at: string;
    } | null = null;

    for (let attempt = 0; attempt < MAX_SLUG_GENERATION_ATTEMPTS && !insertedRow; attempt++) {
      const candidateSlug = buildDemoProspectSlugCandidate(propertyName);
      const { data, error } = await supabaseAdmin
        .from("demo_prospects")
        .insert({
          slug: candidateSlug,
          property_name: propertyName.trim(),
          manual_content: manualContent.trim(),
          suggested_question: suggestedQuestion?.trim() ? suggestedQuestion.trim() : null,
        })
        .select("slug, property_name, manual_content, suggested_question, first_message_at, created_at")
        .single();

      if (!error && data) {
        insertedRow = data;
        break;
      }

      // 23505 = unique_violation (slug collision) — extremely unlikely given the random suffix, but retry.
      const isUniqueViolation = (error as { code?: string } | null)?.code === "23505";
      if (!isUniqueViolation) {
        logger.error({ err: error, propertyName }, "POST /demo-prospects — insert Supabase fallito");
        res.status(500).json({ error: "Errore durante la creazione della demo personalizzata." });
        return;
      }
    }

    if (!insertedRow) {
      logger.error({ propertyName }, "POST /demo-prospects — impossibile generare uno slug univoco");
      res.status(500).json({ error: "Errore durante la creazione della demo personalizzata." });
      return;
    }

    const payload = mapDemoProspectRowToApi(insertedRow);
    const parsedResponse = CreateDemoProspectResponse.safeParse(payload);
    if (!parsedResponse.success) {
      logger.error(
        { zod: parsedResponse.error.flatten(), slug: insertedRow.slug },
        "POST /demo-prospects — validazione risposta fallita",
      );
      res.status(500).json({ error: "Risposta non valida dopo la creazione." });
      return;
    }

    logger.info({ slug: insertedRow.slug, propertyName }, "Demo prospect created");
    res.status(201).json(parsedResponse.data);
  } catch (error) {
    logger.error({ err: error }, "POST /demo-prospects — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /demo-prospects — list all, newest first (CEO only)
router.get("/demo-prospects", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const { data, error } = await supabaseAdmin
      .from("demo_prospects")
      .select("slug, property_name, manual_content, suggested_question, first_message_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ err: error }, "GET /demo-prospects — query Supabase fallita");
      res.status(500).json({ error: "Errore durante il recupero delle demo personalizzate." });
      return;
    }

    const payload = (data ?? []).map(mapDemoProspectRowToApi);
    const parsedResponse = ListDemoProspectsResponse.safeParse(payload);
    if (!parsedResponse.success) {
      logger.error(
        { zod: parsedResponse.error.flatten() },
        "GET /demo-prospects — validazione risposta fallita",
      );
      res.status(500).json({ error: "Risposta non valida." });
      return;
    }

    res.json(parsedResponse.data);
  } catch (error) {
    logger.error({ err: error }, "GET /demo-prospects — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// DELETE /demo-prospects/:slug (CEO only)
router.delete("/demo-prospects/:slug", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
  if (!slug) {
    res.status(400).json({ error: "Slug non valido." });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("demo_prospects")
      .delete()
      .eq("slug", slug)
      .select("slug")
      .maybeSingle();

    if (error) {
      logger.error({ err: error, slug }, "DELETE /demo-prospects/:slug — Supabase fallito");
      res.status(500).json({ error: "Errore durante l'eliminazione." });
      return;
    }

    if (!data) {
      res.status(404).json({ error: "Demo personalizzata non trovata." });
      return;
    }

    const parsedResponse = DeleteDemoProspectResponse.safeParse({ success: true, slug });
    res.json(parsedResponse.success ? parsedResponse.data : { success: true, slug });
  } catch (error) {
    logger.error({ err: error }, "DELETE /demo-prospects/:slug — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

export default router;
