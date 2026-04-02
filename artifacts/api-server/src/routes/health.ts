import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Diagnostica: query minima su Supabase (service role). */
router.get("/healthz/db", async (_req, res): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin.from("properties").select("id").limit(1);
    if (error) {
      console.error("[ERRORE CRITICO] healthz/db:", error);
      res.status(503).json({
        status: "error",
        db: false,
        error: error.message,
      });
      return;
    }
    res.json({ status: "ok", db: true, sample: data?.[0] ?? null });
  } catch (err) {
    console.error("[ERRORE CRITICO]", err);
    res.status(503).json({
      status: "error",
      db: false,
      error: err instanceof Error ? err.message : "Errore sconosciuto",
    });
  }
});

export default router;
