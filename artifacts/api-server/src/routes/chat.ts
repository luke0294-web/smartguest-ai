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
import { detectNeedsAttention } from "../lib/detectNeedsAttention";
import { categorizeMessage, isHostFallbackResponse } from "../lib/categorizeMessage";

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

    HOUSE INFORMATION (Your ONLY source of truth for apartment-related questions):
    ${property.content}

    HYBRID LOGIC:
    A. TOURISM & CULTURE (Verona tips, restaurants, history, monuments):
       - Use your general knowledge to give friendly, helpful advice
       - Be enthusiastic! You're from Verona 🏛️
       - Use **bold** (Markdown) to highlight key names, places, times.
       
    B. HOUSE MANAGEMENT (apartment, wifi, check-in/out, amenities, rules):
       - ONLY reference the HOUSE INFORMATION above
       - Use **bold** (Markdown) to highlight passwords, times, key names.
       - If the info is NOT in the manual, respond with EXACTLY this phrase (no variations):
         "Scusa, non ho questa info! Puoi chiedere direttamente all'host dal tasto WhatsApp qui sopra. 👆"
       - NEVER make up apartment details
       
    C. MIXED QUESTIONS: 
       - Address the house part strictly from the manual
       - Use general knowledge for the tourism part

    STRICT OPERATIONAL RULES:
    1. CONCISENESS: Every word costs you 1 Euro. Be extremely telegraphic. Max 3 short sentences.
    2. LANGUAGE MATCH: You MUST respond in the SAME LANGUAGE as the guest's message. 
    3. EMERGENCIES: For emergencies or damage, tell the guest to contact the host on WhatsApp.
    4. REAL-TIME DATA: You don't have internet. For weather or traffic, suggest checking Google or a weather app.
    5. BOLD: Always use **bold** Markdown to highlight keywords, times, passwords, and names.
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

    // 👇 MODIFICA 2: INIZIO SALVATAGGIO NEL DB CON LOGICA IBRIDA 👇
    try {
      const category = categorizeMessage(message);
      const isHostFallback = isHostFallbackResponse(reply);
      
      // Logica di marcatura:
      // - Turismo: resolved: true (no badge)
      // - Fallimento sicuro (messaggio host): resolved: false (need user action)
      // - Altro: rilevazione automatica
      let resolved = false;
      if (category === "tourism") {
        resolved = true; // Turismo è sempre risolto (general knowledge)
      } else if (isHostFallback) {
        resolved = false; // Host fallback needs attention
      } else {
        resolved = !detectNeedsAttention(reply); // Usa la logica universale
      }
      
      await db.insert(chatLogsTable).values({
        propertySlug: params.data.slug,
        guestMessage: message,
        marcoReply: reply,
        resolved,
      });
      console.log(`Chat salvata nel DB con successo! 📝 [categoria: ${category}, resolved: ${resolved}]`);
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

    const count = logs.filter(log => !log.resolved && detectNeedsAttention(log.marcoReply)).length;
    res.json({ count });
  } catch (err) {
    console.error("Errore nel conteggio delle chat non risolte:", err);
    res.status(500).json({ error: "Impossibile contare i messaggi non risolti." });
  }
});

router.post("/super-diario/refresh-all", async (req, res): Promise<void> => {
  try {
    const logs = await db.select().from(chatLogsTable);
    
    for (const log of logs) {
      const needsAttention = detectNeedsAttention(log.marcoReply);
      // Non aggiorniamo resolved, solo usiamo la logica per il conteggio dinamico
    }
    
    res.json({ message: "Logica di rilevamento rinfrescata (calcolata dinamicamente)" });
  } catch (err) {
    console.error("Errore nel refresh:", err);
    res.status(500).json({ error: "Impossibile fare il refresh." });
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
