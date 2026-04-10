import dns from "node:dns";
import { logger } from "./lib/logger";
import { validateEnv } from "./lib/validateEnv";

/** Prefer IPv4 for SMTP (Render IPv6 egress to Gmail often returns ENETUNREACH). */
dns.setDefaultResultOrder("ipv4first");

try {
  validateEnv();
} catch (err) {
  logger.error({ err }, "Avvio bloccato: variabili ambiente mancanti o non valide.");
  process.exit(1);
}

console.error("[BOOT] Ambiente caricato — voci critiche:", {
  NODE_ENV: process.env.NODE_ENV ?? "(non impostato)",
  PORT: process.env.PORT ?? "(non impostato)",
  haSUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
  haSUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY?.trim()),
  haSUPABASE_SERVICE_ROLE: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  FRONTEND_URL: process.env.FRONTEND_URL?.trim() || "(MANCANTE: generazione QR / link ospite possono fallire)",
});

async function startServer(): Promise<void> {
  const { default: app } = await import("./app");

  const rawPort = process.env.PORT ?? "8080";

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  // 0.0.0.0 — accept connections from other devices on the LAN (not just localhost).
  const server = app.listen(port, "0.0.0.0", () => {
    logger.info({ port, host: "0.0.0.0" }, "🚀 Server finalmente visibile all'esterno!");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Segnale ricevuto, chiusura in corso...");
    server.close(() => {
      logger.info("Server HTTP chiuso.");
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("Timeout chiusura, forzando uscita.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
