import { Router, type IRouter, type RequestHandler } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { logger } from "../lib/logger";
import {
  aiTranscribeRateLimiter,
  aiVisionRateLimiter,
  aiDocumentRateLimiter,
} from "../lib/rateLimiter";
import { logOpenAi429IfNeeded } from "../lib/openaiErrors";
import { requireHostSession } from "../lib/host-auth";
import { looksLikeAudio, looksLikeImage, looksLikePdf, looksLikeDocx } from "../lib/fileTypeSniff";
import { extractPdfText, extractDocxText, DocumentExtractionError } from "../lib/documentExtract";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// multer — keep files in memory (no temp files needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max (Whisper limit)
});

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB — plenty for a house manual PDF/Word doc
});

const rateLimitAiTranscribe: RequestHandler = (req, res, next) => {
  const clientIp = req.ip ?? "unknown";
  if (!aiTranscribeRateLimiter.check(clientIp)) {
    const retryAfter = aiTranscribeRateLimiter.retryAfterSeconds(clientIp);
    logger.warn({ ip: clientIp, retryAfter }, "AI transcribe rate limit exceeded");
    res.status(429).json({
      error: "Troppe richieste. Riprova più tardi.",
      retryAfter,
    });
    return;
  }
  next();
};

const rateLimitAiVision: RequestHandler = (req, res, next) => {
  const clientIp = req.ip ?? "unknown";
  if (!aiVisionRateLimiter.check(clientIp)) {
    const retryAfter = aiVisionRateLimiter.retryAfterSeconds(clientIp);
    logger.warn({ ip: clientIp, retryAfter }, "AI vision rate limit exceeded");
    res.status(429).json({
      error: "Troppe richieste. Riprova più tardi.",
      retryAfter,
    });
    return;
  }
  next();
};

const rateLimitAiDocument: RequestHandler = (req, res, next) => {
  const clientIp = req.ip ?? "unknown";
  if (!aiDocumentRateLimiter.check(clientIp)) {
    const retryAfter = aiDocumentRateLimiter.retryAfterSeconds(clientIp);
    logger.warn({ ip: clientIp, retryAfter }, "AI document rate limit exceeded");
    res.status(429).json({
      error: "Troppe richieste. Riprova più tardi.",
      retryAfter,
    });
    return;
  }
  next();
};

/** Dopo rate limit, prima di multer: solo host con sessione Bearer valida. */
const requireHostSessionForAi: RequestHandler = async (req, res, next) => {
  const session = await requireHostSession(req, res);
  if (session) next();
};

// POST /ai/transcribe — Whisper speech-to-text
router.post(
  "/ai/transcribe",
  rateLimitAiTranscribe,
  requireHostSessionForAi,
  upload.single("audio"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Nessun file audio ricevuto." });
      return;
    }

    if (!looksLikeAudio(req.file.buffer)) {
      res.status(400).json({ error: "Il file non sembra un audio valido." });
      return;
    }

    const mime = req.file.mimetype || "audio/webm";
    const ext = mime.includes("mp4") ? "mp4"
              : mime.includes("ogg") ? "ogg"
              : mime.includes("wav") ? "wav"
              : mime.includes("mpeg") || mime.includes("mp3") ? "mp3"
              : "webm";

    try {
      const audioFile = await toFile(req.file.buffer, `recording.${ext}`, { type: mime });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "it",
      });

      logger.info({ chars: transcription.text.length }, "Whisper transcription completed");
      res.json({ text: transcription.text });
    } catch (err: unknown) {
      logOpenAi429IfNeeded(err, "POST /ai/transcribe");
      console.error("[ERRORE CRITICO] /ai/transcribe:", err);
      logger.error({ err }, "Whisper transcription failed");
      res.status(500).json({ error: "Errore nella trascrizione. Riprova tra poco." });
    }
  }
);

// POST /ai/vision — GPT-4o vision: extract info from an image
router.post(
  "/ai/vision",
  rateLimitAiVision,
  requireHostSessionForAi,
  upload.single("image"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Nessuna immagine ricevuta." });
      return;
    }

    if (!looksLikeImage(req.file.buffer)) {
      res.status(400).json({ error: "Il file non sembra un'immagine valida." });
      return;
    }

    const mime = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Sei un assistente che estrae informazioni utili dalle immagini caricate da host di appartamenti turistici. " +
              "Estrai tutte le informazioni utili da questa immagine (testo, istruzioni, regole, codici WiFi, ecc.) " +
              "e formattale in modo chiaro come regole della casa, in italiano. " +
              "Usa un formato strutturato con bullet point se appropriato. " +
              "Sii diretto e conciso. Non aggiungere commenti meta.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "low" },
              },
              {
                type: "text",
                text: "Estrai tutte le informazioni utili da questa immagine e formattale come regole della casa.",
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      const text = response.choices[0]?.message?.content ?? "";
      logger.info({ chars: text.length }, "Vision extraction completed");
      res.json({ text });
    } catch (err: unknown) {
      logOpenAi429IfNeeded(err, "POST /ai/vision");
      console.error("[ERRORE CRITICO] /ai/vision:", err);
      logger.error({ err }, "Vision extraction failed");
      res.status(500).json({ error: "Errore nell'analisi immagine. Riprova tra poco." });
    }
  }
);

// POST /ai/extract-document — extract text from an uploaded PDF or Word (.docx) document, no OpenAI call
router.post(
  "/ai/extract-document",
  rateLimitAiDocument,
  requireHostSessionForAi,
  uploadDocument.single("document"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Nessun documento ricevuto." });
      return;
    }

    const buf = req.file.buffer;
    const name = (req.file.originalname || "").toLowerCase();

    try {
      let text: string;
      if (looksLikePdf(buf)) {
        text = await extractPdfText(buf);
      } else if (looksLikeDocx(buf)) {
        text = await extractDocxText(buf);
      } else if (name.endsWith(".pdf")) {
        res.status(400).json({ error: "Il file non sembra un PDF valido." });
        return;
      } else if (name.endsWith(".docx")) {
        res.status(400).json({ error: "Il file non sembra un documento Word (.docx) valido." });
        return;
      } else {
        res.status(400).json({ error: "Formato non supportato. Carica un file .pdf o .docx." });
        return;
      }

      logger.info({ chars: text.length, name }, "Document text extraction completed");
      res.json({ text });
    } catch (err: unknown) {
      if (err instanceof DocumentExtractionError) {
        res.status(422).json({ error: err.message });
        return;
      }
      console.error("[ERRORE CRITICO] /ai/extract-document:", err);
      logger.error({ err }, "Document extraction failed");
      res.status(500).json({ error: "Errore nell'analisi del documento. Riprova tra poco." });
    }
  }
);

export default router;
