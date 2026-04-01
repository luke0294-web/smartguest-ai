import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean);

app.use(
  pinoHttp({
    logger,
    redact: [
      "req.headers.authorization",
      "req.headers.x-ceo-session",
      "req.headers.x-host-session",
      "req.body.password",
      "req.body.hostPassword",
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
      if (!origin || allowedOrigins.includes(origin)) {
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

export default app;
