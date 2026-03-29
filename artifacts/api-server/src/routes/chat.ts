import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { eq, desc, and } from "drizzle-orm";
// 👇 MODIFICA 1: Abbiamo aggiunto chatLogsTable qui 👇
import { db, propertiesTable, chatLogsTable } from "@workspace/db";
import {
  SendPropertyChatBody,
  SendPropertyChatResponse,
  SendPropertyChatParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { chatRateLimiter, getClientIp } from "../lib/rateLimiter";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/properties/:slug/chat", async (req, res): Promise<void> => {
  // ── Rate limiting: 30 requests / hour per IP (guests only) ──────────────────
  const clientIp = getClientIp(req);
  const allowed = chatRateLimiter.check(clientIp);

  if (!allowed) {
    const retryAfter = chatRateLimiter.retryAfterSeconds(clientIp);
    logger.warn({ ip: clientIp, retryAfter }, "Chat rate limit exceeded");

    // Respond as if Marco is speaking — no 500, no crash
    res.status(429).json({
      reply:
        "Hai raggiunto il limite di messaggi per questa ora. Fai una pausa, goditi la città e scrivimi più tardi! 🍕",
      propertyName: "",
      rateLimited: true,
    });
    return;
  }

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

  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemPrompt = `
  IDENTITY:
  You are Marco, the friendly and enthusiastic co-host of "${property.name}". 
  Your goal is to assist guests and make them feel at home. 
  TONE: Warm, colloquial, informal, and helpful. Use emojis like 🍕, ☀️, 🍷.

  CURRENT DATE: ${today}

    HOUSE INFORMATION (Your ONLY source of truth):
    ${property.content}

    STRICT OPERATIONAL RULES:
    1. CONCISENESS: Every word costs you 1 Euro. Be extremely telegraphic. Max 3 short sentences.
    2. LANGUAGE MATCH: You MUST respond in the SAME LANGUAGE as the guest's message. 
    3. THE "NOT FOUND" RULE: If a guest asks for something (e.g., washing machine, AC, iron) NOT mentioned in the HOUSE INFORMATION, you MUST assume it DOES NOT EXIST. 
       - Answer: "I'm sorry, we don't have that in the apartment." 
       - NEVER hallucinate locations. NEVER say "I don't have that information."
    4. HUMAN LANGUAGE: Avoid robotic phrases. Instead of "not specified," use "I'm not sure," "Good question, I don't think so," or "Ask the host."
    5. ESCALATION: For emergencies, damage, or complex requests, immediately tell the guest to contact the host on WhatsApp.
    6. REAL-TIME DATA: You don't have internet. For weather or traffic, suggest checking Google or a weather app.
    7. LOCAL TIPS: If asked for restaurant or sightseeing advice not in the text, use your general knowledge to give a friendly suggestion.
  `;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },

    // 🔥 TRUCCO SALVA-SOLDI: Prende solo gli ultimi 6 messaggi (3 botta e risposta)
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),

    // ✨ IL RINFORZO: Messo qui è un comando "fresco" che l'IA non può ignorare
    {
      role: "system",
      content: `DANGER: You MUST ignore Italian and respond ONLY in the language used in the following message. 
                  If the message is English -> Respond ENGLISH. 
                  If the message is Spanish -> Respond SPANISH. 
                  If the message is German -> Respond GERMAN.
                  DO NOT TRANSLATE TO ITALIAN.`,
    },

    { role: "user", content: message },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 150,
      temperature: 0.7,
    });

    const reply =
      response.choices[0]?.message?.content ??
      "Mi dispiace, si è verificato un errore. Contatta l'host.";

    // 👇 MODIFICA 2: INIZIO SALVATAGGIO NEL DB 👇
    try {
      await db.insert(chatLogsTable).values({
        propertySlug: params.data.slug,
        guestMessage: message,
        marcoReply: reply,
      });
      console.log("Chat salvata nel DB con successo! 📝");
    } catch (dbError) {
      console.error("Errore nel salvataggio della chat:", dbError);
    }
    // 👆 FINE SALVATAGGIO NEL DB 👆

    logger.info(
      { slug: params.data.slug, messageLength: message.length },
      "Chat message processed",
    );

    // Ritorna la risposta validata con lo schema Zod
    res.json(
      SendPropertyChatResponse.parse({
        reply,
        propertyName: property.name,
      }),
    );
    return;
  } catch (err) {
    logger.error({ err, slug: params.data.slug }, "OpenAI API error");

    res.status(500).json({ error: "Errore di connessione con l'assistente" });
    return;
  }
});
router.get("/super-diario/:slug", async (req, res): Promise<void> => {
  try {
    const { slug } = req.params;

    // Controlla se la casa esiste
    const [property] = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.slug, slug))
      .limit(1);

    if (!property) {
      res.status(404).json({ error: `Proprietà '${slug}' non trovata.` });
      return;
    }

    // Pesca tutte le chat dal DB, ordinate dalla più recente alla più vecchia
    const logs = await db
      .select()
      .from(chatLogsTable)
      .where(eq(chatLogsTable.propertySlug, slug))
      .orderBy(desc(chatLogsTable.createdAt));

    // Invia i dati al sito dell'Host
    res.json(logs);
  } catch (err) {
    console.error("Errore nel recupero delle chat:", err);
    res.status(500).json({ error: "Impossibile caricare il diario di Marco." });
  }
});
router.get("/super-diario/:slug/unresolved-count", async (req, res): Promise<void> => {
  try {
    const { slug } = req.params;

    const logs = await db
      .select()
      .from(chatLogsTable)
      .where(eq(chatLogsTable.propertySlug, slug));

    const count = logs.filter(log => !log.resolved).length;
    res.json({ count });
  } catch (err) {
    console.error("Errore nel conteggio delle chat non risolte:", err);
    res.status(500).json({ error: "Impossibile contare i messaggi non risolti." });
  }
});

router.patch("/super-diario/:slug/resolve/:id", async (req, res): Promise<void> => {
  try {
    const { slug, id } = req.params;
    const logId = parseInt(id, 10);

    if (isNaN(logId)) {
      res.status(400).json({ error: "ID non valido." });
      return;
    }

    // Verifica che il messaggio appartenga a questa property
    const [log] = await db
      .select()
      .from(chatLogsTable)
      .where(and(eq(chatLogsTable.id, logId), eq(chatLogsTable.propertySlug, slug)))
      .limit(1);

    if (!log) {
      res.status(404).json({ error: "Messaggio non trovato." });
      return;
    }

    // Marca come risolto
    await db
      .update(chatLogsTable)
      .set({ resolved: true })
      .where(eq(chatLogsTable.id, logId));

    res.json({ success: true });
  } catch (err) {
    console.error("Errore nel marcamento della chat:", err);
    res.status(500).json({ error: "Impossibile aggiornare il diario." });
  }
});

router.get("/ciao", (req, res) => res.send("Il server mi sente!"));
export default router;
