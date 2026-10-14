import express, { type Express } from "express";
import cors from "cors";
import multer from "multer";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { isProductionSecurityEnabled } from "./lib/validateEnv";
import { redactUrlForLogs } from "./lib/logRedact";

const app: Express = express();
app.set("trust proxy", 1);

/** Production SPA origins — allowlisted for CORS (QR/email links still use `FRONTEND_URL` from env). */
const PRODUCTION_FRONTEND_ORIGIN = "https://heycico.com";
const PRODUCTION_FRONTEND_ORIGIN_WWW = "https://www.heycico.com";

/**
 * Vercel preview deployments of the frontend project only — e.g.
 * https://smartguest-ai-rome-guest-git-<branch>-luke0294-8669s-projects.vercel.app
 * Scoped to this project/team instead of a bare `*.vercel.app` wildcard,
 * which would allow any Vercel-hosted site to make credentialed requests.
 */
const PRODUCTION_FRONTEND_PREVIEW_ORIGIN =
  /^https:\/\/smartguest-ai-rome-guest-git-[a-z0-9-]+-luke0294-8669s-projects\.vercel\.app$/;

const allowedOrigins: Array<string | undefined | RegExp> = [
  process.env.FRONTEND_URL,
  PRODUCTION_FRONTEND_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN_WWW,
  PRODUCTION_FRONTEND_PREVIEW_ORIGIN,
];

app.use(
  pinoHttp({
    logger,
    redact: [
      "req.headers.authorization",
      "req.headers.x-ceo-session",
      "req.headers.x-host-session",
      "req.body.password",
      "req.body.hostPassword",
      "req.body.newPassword",
      "req.body.resetToken",
      "req.body.reset_token",
      "req.body.pdfBase64",
    ],
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: redactUrlForLogs(req.url),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet());

/**
 * One-off diagnostic for `trust proxy`: every rate limiter keys on `req.ip`,
 * which is only the real client IP if exactly one proxy sits in front of the
 * app. Set LOG_PROXY_DEBUG=true on Render, load the site once, compare the
 * two values in the logs, then remove the variable.
 */
if (process.env.LOG_PROXY_DEBUG?.trim().toLowerCase() === "true") {
  app.use((req, _res, next) => {
    logger.info(
      { ip: req.ip, xForwardedFor: req.headers["x-forwarded-for"] ?? null },
      "[PROXY DEBUG] IP visto dal server",
    );
    next();
  });
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Local dev: allow Vite on any port, LAN IPs, etc.
      if (!isProductionSecurityEnabled()) {
        return callback(null, true);
      }

      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))
      ) {
        return callback(null, true);
      }

      // `false` = no CORS headers (the browser blocks the response) instead of
      // throwing into the error handler, which logged a "critical" 500.
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use("/api/send-pdf", express.json({ limit: "15mb" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

app.use("/api", router);

// Ultimo resort: errori non gestiti (sync throw o, con Express 5, reject delle promesse nei route handler).
app.use(
  (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Client errors raised by the body parsers (malformed JSON → 400, body
    // over the limit → 413) carry their own status: answer with it instead of
    // a 500 logged as "critical" that any anonymous request could trigger.
    const clientStatus =
      err && typeof err === "object" && "status" in err ? Number((err as { status: unknown }).status) : NaN;
    if (clientStatus >= 400 && clientStatus < 500) {
      if (!res.headersSent) {
        res.status(clientStatus).json({
          error: clientStatus === 413 ? "Richiesta troppo grande." : "Richiesta non valida.",
        });
      }
      return;
    }

    if (err instanceof multer.MulterError) {
      if (!res.headersSent) {
        res
          .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
          .json({
            error:
              err.code === "LIMIT_FILE_SIZE"
                ? "Il file è troppo grande."
                : "Caricamento del file non valido.",
          });
      }
      return;
    }
    console.error(
      "[ERRORE CRITICO] Express non gestito:",
      req.method,
      redactUrlForLogs(req.path),
      err instanceof Error ? err.stack ?? err.message : err,
    );
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Errore interno del server" });
  },
);

export default app;
