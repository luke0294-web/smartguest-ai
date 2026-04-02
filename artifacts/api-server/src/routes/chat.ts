import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  SendPropertyChatBody,
  SendPropertyChatResponse,
  SendPropertyChatParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { chatRateLimiter, getClientIp } from "../lib/rateLimiter";
import { DEMO_SLUG, demoPropertyRowForChat } from "../lib/demoProperty";
import { requireHostSession, requireHostOwnsPropertySlug } from "../lib/host-auth";
import { detectNeedsAttention } from "../lib/detectNeedsAttention";
import { enforceAiMessageLimit, requireAiInternalApiKey } from "../lib/aiGuard";
import { supabaseAdmin } from "../lib/supabase";
import { chatLogRowToApi, type ChatLogRowSnake } from "../lib/supabaseMaps";
import {
  categorizeMessage,
  isHostFallbackResponse,
} from "../lib/categorizeMessage";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SupabasePropertyRow = {
  slug: string;
  name: string;
  manual_content?: string | null;
  content?: string | null;
};

const SOS_TOKEN = "%%SOS%%";

function splitSosFromReply(raw: string): { reply: string; sosSuggested: boolean } {
  const sosSuggested = raw.includes(SOS_TOKEN);
  const reply = raw.replace(/\s*%%SOS%%\s*/g, "").trim();
  return { reply, sosSuggested };
}

function shouldIncrementPendingQuestions(reply: string): boolean {
  const lower = reply.toLowerCase();
  const broadFallbackHints = [
    "proprietario",
    "host",
    "whatsapp",
    "non so",
    "non lo so",
    "i don't know",
    "i dont know",
  ];
  return isHostFallbackResponse(reply) || broadFallbackHints.some((hint) => lower.includes(hint));
}

// ─────────────────────────────────────────────
// POST /properties/:slug/chat
// ─────────────────────────────────────────────
router.post("/properties/:slug/chat", async (req, res): Promise<void> => {
  console.log("[ROTTA] Ricevuta richiesta per:", req.path);
  if (!requireAiInternalApiKey(req, res)) return;
  if (!enforceAiMessageLimit(req, res)) return;

  const clientIp = getClientIp(req);

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

  try {
  const slug = params.data.slug;
  const isDemo = slug === DEMO_SLUG;

  if (!isDemo) {
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
  }

  let property: { slug: string; name: string; content: string };

  if (isDemo) {
    const demoRow = demoPropertyRowForChat();
    property = {
      slug: demoRow.slug,
      name: demoRow.name,
      content: demoRow.content,
    };
    console.log("Slug ricevuto:", slug, "(demo — dati sintetici, nessuna query Supabase)");
  } else {
    console.log("[DB] Inizio query al database...");
    const { data: propertyRow, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("slug", slug)
      .single<SupabasePropertyRow>();

    console.log("[DB] Query completata!");
    console.log("Slug ricevuto:", slug);
    console.log("Dati DB:", propertyRow ?? null, "Errore Supabase:", propertyError ?? null);

    if (propertyError || !propertyRow) {
      console.error("[ERRORE CRITICO] POST /properties/:slug/chat property load:", propertyError ?? "no row");
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    property = {
      slug: propertyRow.slug,
      name: propertyRow.name,
      content: propertyRow.manual_content ?? propertyRow.content ?? "",
    };
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
3. CONCISENESS: Max 3 short sentences. No fluff — EXCEPT in **TECHNICAL TROUBLESHOOTING MODE** or **CHECK-OUT CHECKLIST MODE** (see below), where you may use more steps when required.
4. READ AND EXTRACT: Thoroughly read the HOUSE INFORMATION. If the answer (WiFi, Trash, Parking, Checkout) is there, YOU MUST PROVIDE IT explicitly.

==================================================
HOUSE INFORMATION (Your ONLY source of truth):
${property.content}
==================================================

PROBLEM RESOLVER — TECHNICAL TROUBLESHOOTING MODE:
- Applies when the guest reports a **technical problem** (e.g. WiFi, hot water, heating, keys, locks, appliances not working).
- FIRST: Give a **clear step-by-step troubleshooting guide** using **ONLY** information from the HOUSE INFORMATION above. Number or bullet the steps.
- Do **NOT** tell the guest to contact the host, WhatsApp, or the proprietario **immediately** while you still have relevant steps from the manual to try.
- ONLY if the problem **cannot** be solved with the manual (info missing, steps exhausted, or issue needs physical intervention not covered), end your reply with the **exact** token on its own line: ${SOS_TOKEN}
- Never show or explain the token; it is for the app only. Do not add text after the token.

CHECK-OUT CHECKLIST MODE:
- When the guest expresses **check-out intent** (leaving, departing, checking out, packing, "sto partendo", "voglio fare il check-out", etc.):
- Generate a **dynamic checklist** using **ONLY** check-out related rules found in the HOUSE INFORMATION (times, keys, trash, lights, lockbox, etc.).
- Format items as markdown task list lines: \`- [ ] Step description\` (one item per line).
- When the guest expresses checkout intent, after the checklist always add a review request.
- CRITICAL: Write this review request in the EXACT SAME language you are using with the guest. Never write it in Italian if the guest is speaking another language.
- Use this structure (translated to the guest's language):
-   - Thank them for choosing the property
-   - Ask for a 5-star review on Airbnb
-   - Say it only takes one minute
-   - Use the ⭐⭐⭐⭐⭐ emoji and 🙏
- Example in English: "Thank you for choosing this home! We would love a ⭐⭐⭐⭐⭐ review on Airbnb — it only takes a minute! 🙏"
- Example in Portuguese: "Obrigado por escolher esta casa! Adoraríamos uma avaliação ⭐⭐⭐⭐⭐ no Airbnb — leva apenas um minuto! 🙏"
- Never hardcode this phrase in Italian.

HYBRID LOGIC:
RECOMMENDATIONS (food, restaurants, bars, places):
1. PRIORITY: Check HOUSE INFORMATION first.
2. IF FOUND: Use ONLY those tips. Present as:
   'Il tuo host consiglia...' — NO WhatsApp disclaimer.
3. IF NOT FOUND: Use general knowledge + add disclaimer
   in the guest's language (same rule as all other responses):
   IT: 'Per i consigli personali del tuo host, scrivigli su WhatsApp 👆'
   EN: 'For your host's personal tips, ask on WhatsApp 👆'
   (apply same translation logic to all other languages)
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
- For **fire, gas smell, serious injury, or criminal activity**, tell the guest to contact **emergency services** and the host on **WhatsApp** immediately (this overrides TECHNICAL TROUBLESHOOTING MODE).
- For other **technical** issues, follow **PROBLEM RESOLVER** above instead of pushing WhatsApp first.
- If asked for WiFi, search for "wifi", "network", "password".
- LOGIC: If manual says "No unregistered guests", then friends visiting is **forbidden**.

!!! FINAL COMMAND: If the info is in the HOUSE INFORMATION, YOU MUST PROVIDE IT. Do not hide behind 'I don't know'. !!!
${
  isDemo
    ? `

Sei Marco, l'assistente virtuale di "La Bellezza di Roma".

REGOLE ORO:
- Sii estremamente specifico usando i dettagli del manuale (es. cita la Signora Maria o il tasto "L" del piano cottura).
- Presenta i ristoranti come i preferiti di Luca (l'host).
- Se l'ospite chiede qualcosa che non sai, dì che può scrivere a Luca su WhatsApp per i dettagli più tecnici.
`
    : ""
}
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
      content: `MANDATORY: 1. Respond ONLY in the guest's language. 2. If info is in the HOUSE INFORMATION, you MUST provide it. 3. ALWAYS format 3-4 keywords in **bold**. 4. For technical issues use troubleshooting first; use ${SOS_TOKEN} only when the manual cannot fix it. 5. For check-out intent, output markdown \`- [ ]\` checklist from the manual plus the required closing line about Airbnb review.`,
    },
    { role: "user", content: message },
  ];

  // 7. Chiamata OpenAI e risposta
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 250,
      temperature: 0.4,
    });

    const rawReply =
      response.choices[0]?.message?.content ??
      "Mi dispiace, si è verificato un errore. Contatta l'host.";

    const { reply: replyForClient, sosSuggested } = splitSosFromReply(rawReply);

    if (!isDemo) {
      console.log("[DB] Inizio query al database...");
      try {
        const category = categorizeMessage(message);
        const isHostFallback = shouldIncrementPendingQuestions(
          splitSosFromReply(rawReply).reply,
        );
        const resolved =
          category === "tourism"
            ? true
            : isHostFallback
              ? false
              : !detectNeedsAttention(replyForClient);

        const { error: logInsertError } = await supabaseAdmin.from("chat_logs").insert({
          property_slug: slug,
          guest_message: message,
          marco_reply: rawReply,
          resolved,
        });

        if (logInsertError) {
          logger.error({ logInsertError, slug }, "Errore salvataggio chat log (Supabase)");
        } else {
          logger.info({ slug, resolved }, "Chat log salvato");
        }

        if (isHostFallback) {
          const { data: propRow, error: pendingReadError } = await supabaseAdmin
            .from("properties")
            .select("pending_questions_count")
            .eq("slug", slug)
            .maybeSingle<{ pending_questions_count: number | null }>();

          if (pendingReadError) {
            logger.warn(
              { pendingReadError, slug },
              "Impossibile leggere pending_questions_count per incremento",
            );
          } else {
            const current = Number(propRow?.pending_questions_count ?? 0);
            const { error: pendingUpdError } = await supabaseAdmin
              .from("properties")
              .update({ pending_questions_count: current + 1 })
              .eq("slug", slug);

            if (pendingUpdError) {
              logger.warn(
                { pendingUpdError, slug },
                "Incremento pending_questions_count fallito (Supabase)",
              );
            } else {
              console.log(
                `[PENDING_Q] increment slug=${slug} reason=fallback-detected`,
              );
              logger.info({ slug }, "Pending questions counter incremented");
            }
          }
        }
      } catch (dbError) {
        console.error("[ERRORE CRITICO] chat log persist:", dbError);
        logger.error({ dbError }, "Errore salvataggio chat log");
      }
      console.log("[DB] Query completata!");
    }

    res.json(
      SendPropertyChatResponse.parse({
        reply: replyForClient,
        propertyName: property.name,
        ...(sosSuggested && !isDemo ? { sosSuggested: true } : {}),
      }),
    );
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Errore interno del server" });
    }
  }
});

// ─────────────────────────────────────────────
// GET /super-diario/:slug — tutti i log
// ─────────────────────────────────────────────
router.get("/super-diario/:slug", async (req, res): Promise<void> => {
  const session = requireHostSession(req, res);
  if (!session) return;
  if (!(await requireHostOwnsPropertySlug(res, session, req.params.slug))) return;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from("chat_logs")
      .select("*")
      .eq("property_slug", req.params.slug)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ERRORE CRITICO] super-diario GET:", error);
      logger.error({ error }, "Errore caricamento diario");
      res.status(500).json({ error: "Impossibile caricare il diario." });
      return;
    }

    const logs = (rows ?? []).map((r) => chatLogRowToApi(r as ChatLogRowSnake));
    res.json(logs);
  } catch (err) {
    console.error("[ERRORE CRITICO]", err);
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
    const session = requireHostSession(req, res);
    if (!session) return;
    if (!(await requireHostOwnsPropertySlug(res, session, req.params.slug))) return;

    try {
      const { count, error } = await supabaseAdmin
        .from("chat_logs")
        .select("*", { count: "exact", head: true })
        .eq("property_slug", req.params.slug)
        .eq("resolved", false);

      if (error) {
        console.error("[ERRORE CRITICO] unresolved-count:", error);
        logger.error({ error }, "Errore conteggio non risolti");
        res.status(500).json({ error: "Errore conteggio." });
        return;
      }

      res.json({ count: count ?? 0 });
    } catch (err) {
      console.error("[ERRORE CRITICO]", err);
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
    const session = requireHostSession(req, res);
    if (!session) return;

    try {
      const { slug, id } = req.params;
      const logId = parseInt(id, 10);

      if (isNaN(logId)) {
        res.status(400).json({ error: "ID non valido." });
        return;
      }

      if (!(await requireHostOwnsPropertySlug(res, session, slug))) return;

      const { error: updErr } = await supabaseAdmin
        .from("chat_logs")
        .update({ resolved: true })
        .eq("id", logId)
        .eq("property_slug", slug);

      if (updErr) {
        console.error("[ERRORE CRITICO] super-diario resolve:", updErr);
        res.status(500).json({ error: "Errore durante l'aggiornamento." });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      console.error("[ERRORE CRITICO]", err);
      logger.error({ err }, "Errore update resolved");
      res.status(500).json({ error: "Errore durante l'aggiornamento." });
    }
  },
);

// ─────────────────────────────────────────────
// POST /super-diario/refresh-all
// Ricalcola la logica di risoluzione su tutti i log esistenti
// ─────────────────────────────────────────────
router.post("/super-diario/:slug/refresh-all", async (req, res): Promise<void> => {
  const session = requireHostSession(req, res);
  if (!session) return;
  if (!(await requireHostOwnsPropertySlug(res, session, req.params.slug))) return;

  try {
    const { data: logs, error: selErr } = await supabaseAdmin
      .from("chat_logs")
      .select("id, marco_reply")
      .eq("property_slug", req.params.slug);

    if (selErr) {
      console.error("[ERRORE CRITICO] refresh-all select:", selErr);
      res.status(500).json({ error: "Impossibile fare il refresh." });
      return;
    }

    for (const log of logs ?? []) {
      const isHostFallback = isHostFallbackResponse(log.marco_reply);
      const resolved = isHostFallback ? false : !detectNeedsAttention(log.marco_reply);

      const { error: updErr } = await supabaseAdmin
        .from("chat_logs")
        .update({ resolved })
        .eq("id", log.id);

      if (updErr) {
        console.error("[ERRORE CRITICO] refresh-all update:", updErr);
        res.status(500).json({ error: "Impossibile fare il refresh." });
        return;
      }
    }

    res.json({
      message: "Diario aggiornato con la nuova logica di rilevamento.",
    });
  } catch (err) {
    console.error("[ERRORE CRITICO]", err);
    logger.error({ err }, "Errore refresh-all");
    res.status(500).json({ error: "Impossibile fare il refresh." });
  }
});

// ─────────────────────────────────────────────
// POST /host/:slug/sos — guest manual SOS (rate limited, no auth)
// ─────────────────────────────────────────────
router.post("/host/:slug/sos", async (req, res): Promise<void> => {
  const clientIp = getClientIp(req);
  if (!chatRateLimiter.check(clientIp)) {
    const retryAfter = chatRateLimiter.retryAfterSeconds(clientIp);
    logger.warn({ ip: clientIp, retryAfter }, "SOS rate limit exceeded");
    res.status(429).json({
      error: "Troppi tentativi. Riprova più tardi.",
      retryAfter,
    });
    return;
  }

  const slug = String(req.params.slug ?? "").trim();
  if (!slug) {
    res.status(400).json({ error: "Slug non valido." });
    return;
  }

  if (slug === DEMO_SLUG) {
    res.status(404).json({ error: "SOS non disponibile nella demo." });
    return;
  }

  try {
    const { data: property, error: propErr } = await supabaseAdmin
      .from("properties")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle<{ slug: string }>();

    if (propErr || !property) {
      res.status(404).json({ error: "Proprietà non trovata." });
      return;
    }

    const { error: insErr } = await supabaseAdmin.from("chat_logs").insert({
      property_slug: slug,
      guest_message: "SOS manuale ospite",
      marco_reply: "SOS manuale ospite",
      resolved: false,
    });

    if (insErr) {
      console.error("[ERRORE CRITICO] SOS insert log:", insErr);
      res.status(500).json({ error: "Errore durante la segnalazione." });
      return;
    }

    const { data: propRow, error: readErr } = await supabaseAdmin
      .from("properties")
      .select("pending_questions_count")
      .eq("slug", slug)
      .maybeSingle<{ pending_questions_count: number | null }>();

    if (readErr) {
      console.error("[ERRORE CRITICO] SOS read pending:", readErr);
      res.status(500).json({ error: "Errore durante la segnalazione." });
      return;
    }

    const current = Number(propRow?.pending_questions_count ?? 0);
    const { error: updErr } = await supabaseAdmin
      .from("properties")
      .update({ pending_questions_count: current + 1 })
      .eq("slug", slug);

    if (updErr) {
      console.error("[ERRORE CRITICO] SOS increment pending:", updErr);
      res.status(500).json({ error: "Errore durante la segnalazione." });
      return;
    }

    logger.info({ slug }, "Guest SOS manuale registrato");
    res.json({ success: true });
  } catch (err) {
    console.error("[ERRORE CRITICO]", err);
    logger.error({ err }, "Errore SOS ospite");
    res.status(500).json({ error: "Errore durante la segnalazione." });
  }
});

// ─────────────────────────────────────────────
// GET /ciao — health check
// ─────────────────────────────────────────────
router.get("/ciao", (_req, res) => res.send("Il server è vivo e vegeto! 🚀"));

export default router;
