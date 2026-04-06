import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import { hashHostPassword, HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT, MIN_HOST_PASSWORD_LENGTH } from "../lib/passwords";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

// GET /admin/hosts — list all hosts (CEO only)
router.get("/admin/hosts", async (req, res): Promise<void> => {
  console.log("[ROTTA CEO] Ricevuta richiesta:", req.path);
  if (!requireCeoSession(req, res)) return;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from("hosts")
      .select("id, email, created_at")
      .order("email", { ascending: true });

    if (error) {
      console.error("[ERRORE CRITICO] GET /admin/hosts:", error);
      logger.error({ error }, "GET /admin/hosts — Supabase");
      res.status(500).json({ error: "Impossibile caricare gli host." });
      return;
    }

    const hosts = (rows ?? []).map((r) => ({
      id: r.id as number,
      email: r.email,
      createdAt: r.created_at,
    }));

    console.log("[ROTTA CEO] Lista host recuperata");
    res.json(hosts);
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// POST /admin/hosts — create or update host (CEO only)
router.post("/admin/hosts", async (req, res): Promise<void> => {
  console.log("[ROTTA CEO] Ricevuta richiesta:", req.path);
  if (!requireCeoSession(req, res)) return;

  try {
    const { email, hostPassword } = req.body ?? {};

    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) {
      res.status(400).json({ error: "Email obbligatoria." });
      return;
    }
    const trimmedPw = String(hostPassword ?? "").trim();
    if (!trimmedPw) {
      res.status(400).json({ error: "Password obbligatoria." });
      return;
    }
    if (trimmedPw.length < MIN_HOST_PASSWORD_LENGTH) {
      res.status(400).json({ error: `${HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT}.` });
      return;
    }

    const hashed = await hashHostPassword(trimmedPw);

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("hosts")
      .select("email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (selErr) {
      console.error("[ERRORE CRITICO] POST /admin/hosts select:", selErr);
      logger.error({ selErr }, "POST /admin/hosts — select");
      res.status(500).json({ error: "Errore durante la verifica dell'host." });
      return;
    }

    if (existing) {
      const { error: updErr } = await supabaseAdmin
        .from("hosts")
        .update({ host_password: hashed })
        .eq("email", normalizedEmail);

      if (updErr) {
        console.error("[ERRORE CRITICO] POST /admin/hosts update:", updErr);
        logger.error({ updErr }, "POST /admin/hosts — update");
        res.status(500).json({ error: "Impossibile aggiornare la password host." });
        return;
      }

      logger.info({ email: normalizedEmail }, "Host password updated by CEO");
      res.json({ success: true, email: normalizedEmail, action: "updated" });
    } else {
      const { error: insErr } = await supabaseAdmin.from("hosts").insert({
        email: normalizedEmail,
        host_password: hashed,
      });

      if (insErr) {
        console.error("[ERRORE CRITICO] POST /admin/hosts insert:", insErr);
        logger.error({ insErr }, "POST /admin/hosts — insert");
        res.status(500).json({ error: "Impossibile creare l'host su Supabase." });
        return;
      }

      logger.info({ email: normalizedEmail }, "Host created by CEO");
      res.status(201).json({ success: true, email: normalizedEmail, action: "created" });
    }
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// DELETE /admin/hosts/:email — delete host (CEO only)
router.delete("/admin/hosts/:email", async (req, res): Promise<void> => {
  console.log("[ROTTA CEO] Ricevuta richiesta:", req.path);
  if (!requireCeoSession(req, res)) return;

  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();

    const { data: deletedRows, error } = await supabaseAdmin
      .from("hosts")
      .delete()
      .eq("email", email)
      .select("email");

    if (error) {
      console.error("[ERRORE CRITICO] DELETE /admin/hosts:", error);
      logger.error({ error }, "DELETE /admin/hosts");
      res.status(500).json({ error: "Impossibile eliminare l'host." });
      return;
    }

    if (!deletedRows?.length) {
      res.status(404).json({ error: "Host non trovato." });
      return;
    }

    logger.info({ email }, "Host deleted by CEO");
    res.sendStatus(204);
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /admin/properties-by-email — properties for a given owner email (CEO only)
router.get("/admin/properties-by-email", async (req, res): Promise<void> => {
  console.log("[ROTTA CEO] Ricevuta richiesta:", req.path);
  if (!requireCeoSession(req, res)) return;

  try {
    const { email } = req.query as Record<string, string>;
    if (!email) {
      res.status(400).json({ error: "Email richiesta." });
      return;
    }

    const normalized = email.trim().toLowerCase();
    const { data: props, error } = await supabaseAdmin
      .from("properties")
      .select("id, slug, name")
      .eq("email", normalized);

    if (error) {
      console.error("[ERRORE CRITICO] GET /admin/properties-by-email:", error);
      logger.error({ error }, "GET /admin/properties-by-email");
      res.status(500).json({ error: "Impossibile caricare le proprietà." });
      return;
    }

    res.json(props ?? []);
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

export default router;
