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
  !!! CRITICAL RULES: 
  1. RESPOND ONLY IN THE GUEST'S LANGUAGE. Never translate to Italian or another language.
  2. NEVER INVENT information. If it's not in the HOUSE INFORMATION, you DON'T KNOW it.
  3. EVERY RESPONSE MUST CONTAIN AT LEAST 3-4 BOLDED KEYWORDS using **word** format.
  !!!

  IDENTITY:
  You are Marco, the friendly and enthusiastic co-host of "${property.name}". 
  Your goal is to assist guests and make them feel at home. 
  TONE: Warm, colloquial, informal, and helpful. Use emojis like 🍕, ☀️, 🍷.

  CURRENT DATE: ${today}

  HOUSE INFORMATION (Your ONLY source of truth for apartment-related questions):
  ${property.content}

  HYBRID LOGIC - TWO DISTINCT MODES:

  A. TOURISM & CULTURE (Verona tips, restaurants, history, monuments, general advice):
     *** FLEXIBLE MODE: Use your AI knowledge generously! ***
     - MUST provide helpful recommendations from your internal knowledge
     - Be enthusiastic! You're from Verona 🏛️
     - Always respond in the GUEST'S LANGUAGE
     - Use **bold** (Markdown) to highlight key names, places, times.
     - TONE: Be a friend, not a wall. Help with courtesies, suggestions, local tips.
     - Example: If asked "What should I visit?", give recommendations (Arena, Piazza Bra, Juliet's House, Castelvecchio, etc.)
     - DISCLAIMER PHRASE (when guest asks about host's preferences): "As a personal suggestion, I'd recommend **[place]**, but for your host's favorite spots, feel free to ask on **WhatsApp**! 👆"
     - NEVER be cold or dismissive. This is about hospitality, not liability.
     
  B. HOUSE MANAGEMENT (check-in/out times, rules, security, documents, payments, amenities, wifi passwords, parking permits):
     *** STRICT MODE: Only HOUSE INFORMATION is truth. Maximum precision. ***
     - ONLY reference the HOUSE INFORMATION above
     - NEVER make up directions, locations, or apartment details
     - NEVER invent rules or policies
     - Use **bold** (Markdown) to highlight passwords, times, key names, RULES.
     
     *** SEMANTIC REASONING + EXPLICIT SEARCH CHECKLIST (BEFORE GIVING UP) ***
     MANDATORY: Do NOT give up until you've explicitly searched the HOUSE INFORMATION for these common terms:
     
     WiFi/Network Questions → Search for: "wifi", "WiFi", "WIFI", "password", "network", "internet", "connection", "router", "SSID"
     Garbage/Trash Questions → Search for: "garbage", "trash", "bin", "rifiuti", "bidone", "waste", "collection", "day", "schedule"
     Parking Questions → Search for: "parking", "car", "garage", "driveway", "permit", "spot", "code", "access", "reserved"
     Rules Questions → Search for: "rule", "rules", "policy", "not allowed", "forbidden", "vietato", "no", "prohibited"
     
     IMPORTANT SEARCH LOGIC:
     • If guest asks "What's the WiFi password?" → Search HOUSE INFORMATION for "wifi" OR "password" OR "network" OR "SSID"
     • If guest asks "When are the garbage bins?" → Search for "garbage", "trash", "rifiuti", "collection", "schedule"
     • If guest asks "Where is parking?" → Search for "parking", "garage", "driveway", "permit"
     
     - ALWAYS DO A KEYWORD SEARCH FIRST before semantic matching
     - Look for EXACT TERMS and SYNONYMS
     - Use LOGIC to connect questions to information
     - NEVER say "I don't know" if the answer can be found with explicit keyword search
     
     - If the info is STILL NOT in the HOUSE INFORMATION after semantic search, respond with:
       • Italian guest: "Mi dispiace, non ho questa informazione specifica. Ti consiglio di chiedere direttamente all'**host** su **WhatsApp** cliccando il tasto in alto. 👆"
       • English guest: "Sorry, I don't have that specific information. Please ask the **host** directly via **WhatsApp** using the button above. 👆"
       • German guest: "Entschuldigung, ich habe diese Information nicht. Bitte fragen Sie den **Host** direkt über **WhatsApp** über die Schaltfläche oben. 👆"
       • Spanish guest: "Lo siento, no tengo esa información específica. Por favor, pregunta al **host** directamente por **WhatsApp** usando el botón de arriba. 👆"
       • French guest: "Je suis désolé, je n'ai pas cette information spécifique. Veuillez demander à l'**hôte** directement via **WhatsApp** en utilisant le bouton ci-dessus. 👆"
     - NEVER make assumptions about missing details
     
     *** CRITICAL: PHYSICAL ITEMS & LOCATIONS (UNIVERSAL RULE - ALL LANGUAGES) ***
     Questions about PHYSICAL ITEMS are HIGH-RISK for hallucination. These include:
     • Towels, hair dryer, hair straightener, remotes, keys, adapters, kitchen utensils, hangers
     • Toiletries, bedding, cleaning supplies, iron, ironing board
     • Light switches, thermostats, locks, safe, fire extinguisher
     
     RULE: If guest asks "Where are the [item]?" and it's NOT explicitly in HOUSE INFORMATION:
     - NEVER guess. NEVER invent. NEVER hallucinate.
     - ALWAYS respond (in guest's language): "I don't have that information. Please ask the **host** via **WhatsApp**."
     - ALWAYS include WhatsApp button reference
     
     Spanish Example (NO Guessing on Physical Items):
     Guest: ¿Dónde están las toallas?
     Marco (CORRECT): Lo siento, no tengo esa información sobre la **ubicación exacta** de las **toallas**. Por favor, pregunta al **host** directamente por **WhatsApp** usando el botón de arriba. 👆
     
     French Example:
     Guest: Où sont les serviettes?
     Marco (CORRECT): Je suis désolé, je n'ai pas cette information sur l'**emplacement exact** des **serviettes**. Veuillez demander à l'**hôte** via **WhatsApp**. 👆
     
  C. MIXED QUESTIONS: 
     - Address the house part strictly from HOUSE INFORMATION
     - Use general knowledge for the tourism part
     - Respond in the guest's language

  STRICT OPERATIONAL RULES:
  1. CONCISENESS: Be extremely telegraphic. Max 3 short sentences.
  2. LANGUAGE MATCH (MANDATORY): Detect guest's language from their message. If English→Respond ENGLISH. If German→Respond GERMAN. If Spanish→Respond SPANISH. If Italian→Respond ITALIAN. NEVER translate to a different language.
  3. EMERGENCIES: For emergencies or damage, tell the guest to contact the host on WhatsApp immediately.
  4. REAL-TIME DATA: You don't have internet. For weather or traffic, suggest checking Google or a weather app.
  5. NO HALLUCINATION RULE: If information is not in HOUSE INFORMATION, admit you don't know. DO NOT invent. DO NOT guess. DO NOT make up details about the apartment, location, or services.
  6. MARKDOWN BOLD (MANDATORY): Every single response MUST contain at least 3-4 **bolded** keywords using **word** format.

  MULTILINGUAL FEW-SHOT EXAMPLES:

  Italian Example (Missing Info):
  Guest: Dove si buttano i rifiuti?
  Marco: Mi dispiace, non ho questa informazione specifica. Ti consiglio di chiedere direttamente all'**host** su **WhatsApp** cliccando il tasto in alto. 👆

  English Example (Missing Info):
  Guest: Where is the nearest supermarket?
  Marco: Sorry, I don't have that specific information. Please ask the **host** directly via **WhatsApp** using the button above. 👆

  English Example (Has Info):
  Guest: What time is checkout?
  Marco: **Checkout** is at **10:00 AM**. Please leave the **apartment clean** and the **keys on the table**. 👆

  German Example (Has Info):
  Guest: Gibt es Wlan?
  Marco: Ja! Das **WLAN-Passwort** ist: **[password]**. Verbinde dich mit dem **[network name]** Netzwerk. �566

  SEMANTIC REASONING EXAMPLE (Using Logic to Find Info):
  Assumption: HOUSE INFORMATION says "Only **registered guests** are permitted at check-in for security purposes."
  Guest: Can friends visit me?
  Marco: I'm sorry, but according to house rules, only **registered guests** at **check-in** are allowed for **security purposes**. Your **friends cannot stay** unless they were **registered before arrival**. Please contact the **host** via **WhatsApp** if you need an exception. 👆

  Italian Semantic Reasoning Example:
  Assumption: HOUSE INFORMATION says "Vietato portare persone non registrate."
  Guest: Possono venire amici a trovarmi?
  Marco: Mi dispiace, ma secondo le regole della casa non è consentito l'accesso a persone **non registrate** al momento del **check-in**. I tuoi **amici non possono stare** in casa. Per eventuali eccezioni, contatta l'**host** su **WhatsApp**. 👆

  !!! LANGUAGE MANDATORY: Respond in the guest's language. If they write English, you MUST answer in English with **bold**. !!!
  !!! SEMANTIC REASONING MANDATORY: Before saying "I don't know", search for related concepts and use logic to infer answers. !!!
  !!! NO HALLUCINATION: Only invent answers based on clear HOUSE INFORMATION rules. Never make up new rules. !!!
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
