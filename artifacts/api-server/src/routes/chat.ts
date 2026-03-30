import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { eq, desc, and } from "drizzle-orm";
import { db, propertiesTable, chatLogsTable } from "@workspace/db";
import {
  SendPropertyChatBody,
  SendPropertyChatResponse,
  SendPropertyChatParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { chatRateLimiter, getClientIp } from "../lib/rateLimiter";
import { detectNeedsAttention } from "../lib/detectNeedsAttention";
import {
  categorizeMessage,
  isHostFallbackResponse,
} from "../lib/categorizeMessage";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────
// POST /properties/:slug/chat
// ─────────────────────────────────────────────
router.post("/properties/:slug/chat", async (req, res): Promise<void> => {
  // 1. Rate limiting: 30 requests/ora per IP
  const clientIp = getClientIp(req);
  if (!chatRateLimiter.check(clientIp)) {
    const retryAfter = chatRateLimiter.retryAfterSeconds(clientIp);
    logger.warn({ ip: clientIp, retryAfter }, "Chat rate limit exceeded");
    res.status(429).json({
      reply:
        "Hai raggiunto il limite di messaggi per questa ora. Fai una pausa, goditi la città e scrivimi più tardi! 🍕",
      propertyName: "",
      rateLimited: true,
    });
    return;
  }

  // 2. Validazione parametri e body
  const params = SendPropertyChatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendPropertyChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // 3. Recupero proprietà dal DB
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.slug, params.data.slug))
    .limit(1);

  if (!property) {
    res
      .status(404)
      .json({ error: `Proprietà '${params.data.slug}' non trovata.` });
    return;
  }

  const { message, conversationHistory = [] } = parsed.data;

  // 4. Guardia: nessun contenuto disponibile
  if (!property.content.trim()) {
    res.json(
      SendPropertyChatResponse.parse({
        reply:
          "Benvenuto! Al momento non ho ancora informazioni su questo appartamento. Contatta direttamente l'host.",
        propertyName: property.name,
      }),
    );
    return;
  }

  // 5. Costruzione system prompt
  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemPrompt = `
IDENTITY:
You are Marco, the friendly and enthusiastic AI co-host of "${property.name}". 
Your goal is to assist guests and make them feel at home. 
TONE: Warm, colloquial, informal, and helpful. Use emojis like 🍕, ☀️, 🍷.
CURRENT DATE: ${today}

!!! CRITICAL GLOBAL RULES !!!
1. LANGUAGE: ALWAYS respond in the EXACT SAME LANGUAGE as the guest.
2. BOLD KEYWORDS: EVERY response MUST contain at least 3-4 **bolded** keywords.
3. CONCISENESS: Max 3 short sentences. No fluff.
4. READ AND EXTRACT: Thoroughly read the HOUSE INFORMATION. If the answer (WiFi, Trash, Parking, Checkout) is there, YOU MUST PROVIDE IT explicitly.

==================================================
HOUSE INFORMATION (Your ONLY source of truth):
${property.content}
==================================================

HYBRID LOGIC:
A. TOURISM: Use AI knowledge for local tips. Disclaimer: "Come consiglio personale ti suggerisco [Posto], ma per i posti preferiti del tuo host, chiedi pure su **WhatsApp**! 👆"
B. HOUSE MANAGEMENT: ONLY use the HOUSE INFORMATION above. Never guess or invent locations.

FALLBACK PHRASES (For missing info or physical items):
- IT: "Mi dispiace, non ho questa informazione specifica. Chiedi all'**host** su **WhatsApp**. 👆"
- EN: "Sorry, I don't have that specific information. Please ask the **host** via **WhatsApp**. 👆"
- DE: "Entschuldigung, ich habe diese Information nicht. Fragen Sie den **Host** via **WhatsApp**. 👆"
- FR: "Je suis désolé, je n'ai pas cette information. Veuillez demander à l'**hôte** via **WhatsApp**. 👆"
- ES: "Lo siento, no tengo esa información. Por favor, pregunta al **host** por **WhatsApp**. 👆"
- NL: "Sorry, ik heb die informatie niet. Vraag het de **host** via **WhatsApp**. 👆"
- 中文: "抱歉，我没有这个信息。请通过 **WhatsApp** 直接询问 **host**。👆"
- 日本語: "申し訳ありませんが、その情報はありません。**WhatsApp** で **host** にご質問ください。👆"
- 한국어: "죄송합니다. 정보가 없습니다. **WhatsApp**을 통해 **host**에게 문의해 주세요.👆"
- PT: "Desculpe, não tenho essa informação. Pergunte ao **host** via **WhatsApp**. 👆"
- PL: "Przepraszam, nie mam tej informacji. Proszę zapytać **hosta** przez **WhatsApp**. 👆"

STRICT OPERATIONAL RULES:
- For damage or urgent issues, tell the guest to contact the host on **WhatsApp** immediately.
- If asked for WiFi, search for "wifi", "network", "password".
- LOGIC: If manual says "No unregistered guests", then friends visiting is **forbidden**.

!!! FINAL COMMAND: If the info is in the HOUSE INFORMATION, YOU MUST PROVIDE IT. Do not hide behind 'I don't know'. !!!
`;

  // 6. Costruzione array messaggi per OpenAI (ultimi 6 per risparmiare token)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "system",
      content: `MANDATORY: 1. Respond ONLY in the guest's language. 2. If info is in the HOUSE INFORMATION, you MUST provide it. 3. ALWAYS format 3-4 keywords in **bold**.`,
    },
    { role: "user", content: message },
  ];

  // 7. Chiamata OpenAI e risposta
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 150,
      temperature: 0.4,
    });

    const reply =
      response.choices[0]?.message?.content ??
      "Mi dispiace, si è verificato un errore. Contatta l'host.";

    // 8. Salvataggio log nel DB (non bloccante)
    try {
      const category = categorizeMessage(message);
      const isHostFallback = isHostFallbackResponse(reply);
      const resolved =
        category === "tourism"
          ? true
          : isHostFallback
            ? false
            : !detectNeedsAttention(reply);

      await db.insert(chatLogsTable).values({
        propertySlug: params.data.slug,
        guestMessage: message,
        marcoReply: reply,
        resolved,
      });

      logger.info({ slug: params.data.slug, resolved }, "Chat log salvato");
    } catch (dbError) {
      logger.error({ dbError }, "Errore salvataggio chat log");
    }

    res.json(
      SendPropertyChatResponse.parse({ reply, propertyName: property.name }),
    );
  } catch (err) {
    logger.error({ err }, "OpenAI API error");
    res.status(500).json({ error: "Errore di connessione" });
  }
});

// ─────────────────────────────────────────────
// GET /super-diario/:slug — tutti i log
// ─────────────────────────────────────────────
router.get("/super-diario/:slug", async (req, res): Promise<void> => {
  try {
    const logs = await db
      .select()
      .from(chatLogsTable)
      .where(eq(chatLogsTable.propertySlug, req.params.slug))
      .orderBy(desc(chatLogsTable.createdAt));
    res.json(logs);
  } catch (err) {
    logger.error({ err }, "Errore caricamento diario");
    res.status(500).json({ error: "Impossibile caricare il diario." });
  }
});

// ─────────────────────────────────────────────
// GET /super-diario/:slug/unresolved-count
// ─────────────────────────────────────────────
router.get(
  "/super-diario/:slug/unresolved-count",
  async (req, res): Promise<void> => {
    try {
      const logs = await db
        .select()
        .from(chatLogsTable)
        .where(
          and(
            eq(chatLogsTable.propertySlug, req.params.slug),
            eq(chatLogsTable.resolved, false),
          ),
        );
      res.json({ count: logs.length });
    } catch (err) {
      logger.error({ err }, "Errore conteggio non risolti");
      res.status(500).json({ error: "Errore conteggio." });
    }
  },
);

// ─────────────────────────────────────────────
// PATCH /super-diario/:slug/resolve/:id
// ─────────────────────────────────────────────
router.patch(
  "/super-diario/:slug/resolve/:id",
  async (req, res): Promise<void> => {
    try {
      const { slug, id } = req.params;
      const logId = parseInt(id, 10);

      if (isNaN(logId)) {
        res.status(400).json({ error: "ID non valido." });
        return;
      }

      await db
        .update(chatLogsTable)
        .set({ resolved: true })
        .where(
          and(
            eq(chatLogsTable.id, logId),
            eq(chatLogsTable.propertySlug, slug),
          ),
        );

      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Errore update resolved");
      res.status(500).json({ error: "Errore durante l'aggiornamento." });
    }
  },
);

// ─────────────────────────────────────────────
// POST /super-diario/refresh-all
// Ricalcola la logica di risoluzione su tutti i log esistenti
// ─────────────────────────────────────────────
router.post("/super-diario/refresh-all", async (req, res): Promise<void> => {
  try {
    const logs = await db.select().from(chatLogsTable);

    for (const log of logs) {
      const isHostFallback = isHostFallbackResponse(log.marcoReply);
      const resolved = isHostFallback
        ? false
        : !detectNeedsAttention(log.marcoReply);

      await db
        .update(chatLogsTable)
        .set({ resolved })
        .where(eq(chatLogsTable.id, log.id));
    }

    res.json({
      message: "Diario aggiornato con la nuova logica di rilevamento.",
    });
  } catch (err) {
    logger.error({ err }, "Errore refresh-all");
    res.status(500).json({ error: "Impossibile fare il refresh." });
  }
});

// ─────────────────────────────────────────────
// GET /ciao — health check
// ─────────────────────────────────────────────
router.get("/ciao", (_req, res) => res.send("Il server è vivo e vegeto! 🚀"));

export default router;
