import { Router, type IRouter } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// multer — keep files in memory (no temp files needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max (Whisper limit)
});

// POST /ai/transcribe — Whisper speech-to-text
router.post(
  "/ai/transcribe",
  upload.single("audio"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Nessun file audio ricevuto." });
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
    } catch (err: any) {
      logger.error({ err: err.message }, "Whisper transcription failed");
      res.status(500).json({ error: err.message ?? "Errore nella trascrizione." });
    }
  }
);

// POST /ai/vision — GPT-4o vision: extract info from an image
router.post(
  "/ai/vision",
  upload.single("image"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Nessuna immagine ricevuta." });
      return;
    }

    const mime = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
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
                image_url: { url: dataUrl, detail: "high" },
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
    } catch (err: any) {
      logger.error({ err: err.message }, "Vision extraction failed");
      res.status(500).json({ error: err.message ?? "Errore nell'analisi immagine." });
    }
  }
);

export default router;
