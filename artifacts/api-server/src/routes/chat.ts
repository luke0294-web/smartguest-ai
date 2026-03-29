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
import { categorizeMessage, isHostFallbackResponse } from "../lib/categorizeMessage";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── CHAT ─────────────────────────────────────────────────────────────────────
router.post("/properties/:slug/chat", async (req, res): Promise<void> => {
  const clientIp = getClientIp(req);
  const allowed = chatRateLimiter.check(clientIp);

  if (!allowed) {
    const retryAfter = chatRateLimiter.retryAfterSeconds(clientIp);
    logger.warn({ ip: clientIp, retryAfter }, "Chat rate limit exceeded");
    res.status(429).json({
      reply: "Hai raggiunto il limite di messaggi per questa ora. Fai una pausa, goditi la città e scrivimi più tardi! 🍕",
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
    res.status(404).json({ error: `Proprietà '${params.data.slug}' non trovata.` });
    return;
  }

  const { message, conversationHistory = [] } = parsed.data;

  if (!property.content.trim()) {
    res.json(
      SendPropertyChatResponse.parse({
        reply: "Benvenuto! Al momento non ho ancora informazioni su questo appartamento. Contatta direttamente l'host.",
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
  You are Marco, the friendly and enthusiastic AI co-host of "${property.name}". 
  Your goal is to assist guests and make them feel at home. 
  TONE: Warm, colloquial, informal, and helpful. Use emojis like 🍕, ☀️, 🍷.
  CURRENT DATE: ${today}

  !!! CRITICAL GLOBAL RULES !!!
  1. LANGUAGE: ALWAYS respond in the EXACT SAME LANGUAGE as the guest.
  2. BOLD KEYWORDS: EVERY response MUST contain at least 3-4 **bolded** keywords.
  3. CONCISENESS: Max 3 short sentences. No fluff.
  4. READ AND EXTRACT: Thoroughly read the HOUSE INFORMATION. If the answer (WiFi, Trash, Parking, Checkout) is there, YOU MUST PROVIDE IT explicitly. Do not be lazy.

  ==================================================
  HOUSE INFORMATION (Your ONLY source of truth):
  ${property.content}
  ==================================================

  HYBRID LOGIC - TWO DISTINCT MODES:

  A. TOURISM & CULTURE (Verona tips, restaurants, history, monuments, general advice):
     *** FLEXIBLE MODE: Use your AI knowledge generously! ***
     - MUST provide helpful recommendations from your internal knowledge
     - Be enthusiastic! You're from Verona 🏛️
     - Always respond in the GUEST'S LANGUAGE
     - TONE: Be a friend, not a wall. Help with courtesies, suggestions, local tips.
     - DISCLAIMER: "Come consiglio personale, ti suggerisco **[Posto]**, ma per i posti preferiti del tuo host, chiedi pure su **WhatsApp**! 👆"
     - NEVER be cold or dismissive. This is about hospitality, not liability.

  B. HOUSE MANAGEMENT (check-in/out, rules, security, WiFi, parking, garbage, amenities):
     *** STRICT MODE: HOUSE INFORMATION is the ONLY truth. Maximum precision. ***
     - ONLY reference the HOUSE INFORMATION above
     - NEVER make up directions, locations, or apartment details
     - NEVER invent rules or policies
     - Use **bold** for passwords, times, key names, RULES

     *** MANDATORY KEYWORD SEARCH (before giving up) ***
     Always search these terms in HOUSE INFORMATION first:
     - WiFi/Internet → "wifi", "WiFi", "WIFI", "password", "network", "internet", "SSID"
     - Garbage/Trash → "garbage", "trash", "bin", "rifiuti", "bidone", "waste", "raccolta"
     - Parking → "parking", "parcheggio", "garage", "driveway", "permit", "posto auto"
     - Rules → "rule", "vietato", "forbidden", "no", "prohibited", "non è permesso"
     - Extra guests → "guests", "registered", "visitors", "ospiti", "non registrati"
     
     LOGIC RULE: If manual says "No unregistered guests" → friends visiting is FORBIDDEN.
     LOGIC RULE: If manual contains WiFi password → you MUST state it clearly.
     LOGIC RULE: If the answer is inferrable from any rule in the manual → INFER IT.

     If info is STILL not found after keyword search, respond in guest's language:
     • IT: "Mi dispiace, non ho questa informazione specifica. Chiedi all'**host** su **WhatsApp**. 👆"
     • EN: "Sorry, I don't have that specific information. Please ask the **host** via **WhatsApp**. 👆"
     • DE: "Entschuldigung, ich habe diese Information nicht. Fragen Sie den **Host** via **WhatsApp**. 👆"
     • FR: "Je suis désolé, je n'ai pas cette information. Veuillez demander à l'**hôte** via **WhatsApp**. 👆"
     • ES: "Lo siento, no tengo esa información. Por favor, pregunta al **host** por **WhatsApp**. 👆"
     • NL: "Sorry, ik heb die informatie niet. Vraag het de **host** via **WhatsApp**. 👆"
     • PT: "Desculpe, não tenho essa informação. Pergunte ao **host** via **WhatsApp**. 👆"

     *** PHYSICAL ITEMS (High-risk for hallucination) ***
     If guest asks "Where are the [towels/hairdryer/remote/keys/etc]?" and it's NOT in HOUSE INFORMATION:
     - NEVER guess. NEVER invent. ALWAYS redirect to WhatsApp.

  C. MIXED QUESTIONS:
     - House part → STRICT MODE
     - Tourism part → FLEXIBLE MODE

  STRICT OPERATIONAL RULES:
  - For damage or urgent issues: contact the host on **WhatsApp** immediately.
  - For weather/traffic: suggest Google or a weather app (no real-time data).

  !!! FINAL COMMAND: If the info is in the HOUSE INFORMATION, YOU MUST PROVIDE IT. Do NOT hide behind 'I don't know'. !!!
  `;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "system",
      content: `MANDATORY REMINDER: 1. Respond ONLY in the guest's language. 2. If the info (WiFi, checkout, parking, garbage) IS in the HOUSE INFORMATION, you MUST provide it. 3. Use **bold** on at least 3-4 keywords.`,
    },
    { role: "user", content: message },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 150,
      temperature: 0.4,
    });

    const reply = response.choices[0]?.message?.content ?? "Mi dispiace, si è verificato un errore. Contatta l'host.";

    try {
      const category = categorizeMessage(message);
      const isHostFallback = isHostFallbackResponse(reply);
      const resolved = category === "tourism" ? true : isHostFallback ? false : !detectNeedsAttention(reply);

      await db.insert(chatLogsTable).values({
        propertySlug: params.data.slug,
        guestMessage: message,
        marcoReply: reply,
        resolved,
      });
      console.log(`Chat salvata! 📝 [Risolta: ${resolved}]`);
    } catch (dbError) {
      console.error("Errore salvataggio DB:", dbError);
    }

    res.json(SendPropertyChatResponse.parse({ reply, propertyName: property.name }));
  } catch (err) {
    console.error("OpenAI API error:", err);
    res.status(500).json({ error: "Errore di connessione" });
  }
});

// ── DIARIO DI BORDO ───────────────────────────────────────────────────────────
router.get("/super-diario/:slug", async (req, res): Promise<void> => {
  try {
    const logs = await db
      .select()
      .from(chatLogsTable)
      .where(eq(chatLogsTable.propertySlug, req.params.slug))
      .orderBy(desc(chatLogsTable.createdAt));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Impossibile caricare il diario." });
  }
});

router.get("/super-diario/:slug/unresolved-count", async (req, res): Promise<void> => {
  try {
    const logs = await db
      .select()
      .from(chatLogsTable)
      .where(and(eq(chatLogsTable.propertySlug, req.params.slug), eq(chatLogsTable.resolved, false)));
    res.json({ count: logs.length });
  } catch (err) {
    res.status(500).json({ error: "Errore conteggio." });
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
    await db
      .update(chatLogsTable)
      .set({ resolved: true })
      .where(and(eq(chatLogsTable.id, logId), eq(chatLogsTable.propertySlug, slug)));
    res.json({ success: true });
  } catch (err) {
    console.error("Errore update resolved:", err);
    res.status(500).json({ error: "Errore durante l'aggiornamento." });
  }
});

router.post("/super-diario/refresh-all", async (req, res): Promise<void> => {
  try {
    const logs = await db.select().from(chatLogsTable);
    for (const log of logs) {
      const isHostFallback = isHostFallbackResponse(log.marcoReply);
      const needsAttention = detectNeedsAttention(log.marcoReply);
      const newResolvedStatus = isHostFallback ? false : !needsAttention;
      await db.update(chatLogsTable).set({ resolved: newResolvedStatus }).where(eq(chatLogsTable.id, log.id));
    }
    res.json({ message: "Diario aggiornato con la nuova logica di rilevamento! 🔄" });
  } catch (err) {
    console.error("Errore nel refresh:", err);
    res.status(500).json({ error: "Impossibile fare il refresh." });
  }
});

router.get("/ciao", (_req, res) => res.send("Il server è vivo e vegeto! 🚀"));

export default router;
