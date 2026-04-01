import { logger } from "./lib/logger";
import { validateEnv } from "./lib/validateEnv";

try {
  validateEnv();
} catch (err) {
  logger.error({ err }, "Avvio bloccato: variabili ambiente mancanti o non valide.");
  process.exit(1);
}

const { default: app } = await import("./app");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "🚀 Server finalmente visibile all'esterno!");
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
