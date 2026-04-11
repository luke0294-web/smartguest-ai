import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";
import { hashHostPassword, HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT, MIN_HOST_PASSWORD_LENGTH } from "../lib/passwords";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

/** CEO panel: validation messages in Italian. */
function validateHostEmailForCeo(
  input: unknown,
): { ok: true; email: string } | { ok: false; message: string } {
  const normalized = String(input ?? "").trim().toLowerCase();
  if (!normalized) return { ok: false, message: "Email obbligatoria." };
  return { ok: true, email: normalized };
}

function validateHostPasswordForCeo(
  input: unknown,
): { ok: true; password: string } | { ok: false; message: string } {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return { ok: false, message: "Password obbligatoria." };
  if (trimmed.length < MIN_HOST_PASSWORD_LENGTH) {
    return { ok: false, message: `${HOST_PASSWORD_MIN_LENGTH_MESSAGE_IT}.` };
  }
  return { ok: true, password: trimmed };
}

// GET /admin/hosts — list all hosts (CEO only)
router.get("/admin/hosts", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from("hosts")
      .select("id, email, created_at")
      .order("email", { ascending: true });

    if (error) {
      logger.error({ error }, "GET /admin/hosts — Supabase");
      res.status(500).json({ error: "Impossibile caricare gli host." });
      return;
    }

    const hosts = (rows ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      createdAt: r.created_at,
    }));

    res.json(hosts);
  } catch (error) {
    logger.error({ err: error }, "GET /admin/hosts — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// POST /admin/hosts — create or update host (CEO only)
router.post("/admin/hosts", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const { email, hostPassword } = req.body ?? {};

    const emailCheck = validateHostEmailForCeo(email);
    if (!emailCheck.ok) {
      res.status(400).json({ error: emailCheck.message });
      return;
    }
    const normalizedEmail = emailCheck.email;

    const pwCheck = validateHostPasswordForCeo(hostPassword);
    if (!pwCheck.ok) {
      res.status(400).json({ error: pwCheck.message });
      return;
    }

    const hashed = await hashHostPassword(pwCheck.password);

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("hosts")
      .select("email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (selErr) {
      logger.error({ selErr }, "POST /admin/hosts — select");
      res.status(500).json({ error: "Errore durante la verifica dell'host." });
      return;
    }

    if (existing) {
      const { data: updatedRow, error: updErr } = await supabaseAdmin
        .from("hosts")
        .update({ host_password: hashed })
        .eq("email", normalizedEmail)
        .select("email")
        .maybeSingle();

      if (updErr) {
        logger.error({ updErr }, "POST /admin/hosts — update");
        res.status(500).json({ error: "Impossibile aggiornare la password host." });
        return;
      }
      if (!updatedRow) {
        logger.warn({ email: normalizedEmail }, "POST /admin/hosts — update: nessuna riga aggiornata");
        res.status(404).json({ error: "Host non trovato." });
        return;
      }

      logger.info({ email: normalizedEmail }, "Host password updated by CEO");
      res.json({ success: true, email: normalizedEmail, action: "updated" });
    } else {
      const { data: insertedRow, error: insErr } = await supabaseAdmin
        .from("hosts")
        .insert({
          email: normalizedEmail,
          host_password: hashed,
        })
        .select("email")
        .maybeSingle();

      if (insErr) {
        logger.error({ insErr }, "POST /admin/hosts — insert");
        res.status(500).json({ error: "Impossibile creare l'host su Supabase." });
        return;
      }
      if (!insertedRow) {
        logger.error({ email: normalizedEmail }, "POST /admin/hosts — insert: nessuna riga restituita");
        res.status(500).json({ error: "Impossibile creare l'host su Supabase." });
        return;
      }

      logger.info({ email: normalizedEmail }, "Host created by CEO");
      res.status(201).json({ success: true, email: normalizedEmail, action: "created" });
    }
  } catch (error) {
    logger.error({ err: error }, "POST /admin/hosts — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// DELETE /admin/hosts/:email — delete host (CEO only)
router.delete("/admin/hosts/:email", async (req, res): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();

    const { data: deletedRows, error } = await supabaseAdmin
      .from("hosts")
      .delete()
      .eq("email", email)
      .select("email");

    if (error) {
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
    logger.error({ err: error }, "DELETE /admin/hosts — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// GET /admin/properties-by-email — properties for a given owner email (CEO only)
router.get("/admin/properties-by-email", async (req, res): Promise<void> => {
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
      logger.error({ error }, "GET /admin/properties-by-email");
      res.status(500).json({ error: "Impossibile caricare le proprietà." });
      return;
    }

    res.json(props ?? []);
  } catch (error) {
    logger.error({ err: error }, "GET /admin/properties-by-email — eccezione non gestita");
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

export default router;
