import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:5173"] : []),
].filter(Boolean);

/** Allow Vite dev server on typical LAN IPs when NODE_ENV=development (mobile testing). */
function isPrivateLanDevOrigin(origin: string): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

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
      if (!origin || allowedOrigins.includes(origin) || isPrivateLanDevOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS: origine non autorizzata"));
      }
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
