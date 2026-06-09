import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

/** Production SPA origins — allowlisted for CORS (QR/email links still use `FRONTEND_URL` from env). */
const PRODUCTION_FRONTEND_ORIGIN = "https://heycico.com";
const PRODUCTION_FRONTEND_ORIGIN_WWW = "https://www.heycico.com";

const allowedOrigins: Array<string | undefined | RegExp> = [
  process.env.FRONTEND_URL,
  PRODUCTION_FRONTEND_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN_WWW,
  /\.vercel\.app$/,
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
          url: req.url?.split("?")[0],
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
app.use(
  cors({
    origin: (origin, callback) => {
      // Local dev: allow Vite on any port, LAN IPs, etc.
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
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
    console.error(
      "[ERRORE CRITICO] Express non gestito:",
      req.method,
      req.path,
      err instanceof Error ? err.stack ?? err.message : err,
    );
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Errore interno del server" });
  },
);

export default app;
