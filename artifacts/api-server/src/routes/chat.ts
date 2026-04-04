import { Router, type IRouter, type Response } from "express";
import OpenAI from "openai";
import {
  SendPropertyChatBody,
  SendPropertyChatResponse,
  SendPropertyChatParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { chatRateLimiter, getClientIp } from "../lib/rateLimiter";
import { DEMO_SLUG, DEMO_MASTER_MANUAL, demoPropertyRowForChat } from "../lib/demoProperty";
import { requireHostSession, requireHostOwnsPropertySlug } from "../lib/host-auth";
import { detectNeedsAttention } from "../lib/detectNeedsAttention";
import { enforceAiMessageLimit } from "../lib/aiGuard";
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

function writeChatSseEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function beginChatSse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const r = res as Response & { flushHeaders?: () => void };
  if (typeof r.flushHeaders === "function") {
    r.flushHeaders();
  }
}

function splitSosFromReply(raw: string): { reply: string; sosSuggested: boolean } {
  const sosSuggested = raw.includes(SOS_TOKEN);
  const reply = raw.replace(/\s*%%SOS%%\s*/g, "").trim();
  return { reply, sosSuggested };
}

const isLikelyItalian = (text: string): boolean => {
  const italianMarkers =
    /\b(che|perché|quindi|anche|nella|nello|sono|hanno|tutto|molto|grazie)\b/gi;
  const matches = text.match(italianMarkers);
  return matches !== null && matches.length >= 2;
};

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

const DATE_LOCALE: Record<string, string> = {
  it: "it-IT",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  nl: "nl-NL",
  pt: "pt-PT",
  pl: "pl-PL",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
};

/** User-visible chat strings by UI language code (no Italian-only defaults). */
const GUEST_CANNED: Record<
  string,
  { rateLimit: string; noManual: string; openAiError: string }
> = {
  it: {
    rateLimit:
      "Hai raggiunto il limite di messaggi per questa ora. Fai una pausa, goditi la città e scrivimi più tardi! 🍕",
    noManual:
      "Benvenuto! Non ho ancora informazioni su questo alloggio. Contatta l'host direttamente, ad esempio su WhatsApp.",
    openAiError:
      "Mi dispiace, si è verificato un errore. Contatta l'host su WhatsApp.",
  },
  en: {
    rateLimit:
      "You've reached the message limit for this hour. Take a break, enjoy the city, and message again later! 🍕",
    noManual:
      "Welcome! I don't have details about this stay yet. Please contact the host directly, e.g. on WhatsApp.",
    openAiError: "Sorry, something went wrong. Please contact the host on WhatsApp.",
  },
  de: {
    rateLimit:
      "Du hast das Nachrichtenlimit für diese Stunde erreicht. Mach eine Pause, genieß die Stadt und schreib später wieder! 🍕",
    noManual:
      "Willkommen! Zu dieser Unterkunft liegen mir noch keine Infos vor. Bitte kontaktiere den Host direkt, z. B. per WhatsApp.",
    openAiError:
      "Entschuldigung, etwas ist schiefgelaufen. Bitte kontaktiere den Host per WhatsApp.",
  },
  fr: {
    rateLimit:
      "Tu as atteint la limite de messages pour cette heure. Fais une pause, profite de la ville et écris plus tard ! 🍕",
    noManual:
      "Bienvenue ! Je n'ai pas encore d'informations sur ce logement. Contacte directement l'hôte, par ex. sur WhatsApp.",
    openAiError:
      "Désolé, une erreur s'est produite. Contacte l'hôte sur WhatsApp.",
  },
  es: {
    rateLimit:
      "Has alcanzado el límite de mensajes para esta hora. Tómate un descanso, disfruta la ciudad y escribe más tarde. 🍕",
    noManual:
      "¡Bienvenido! Aún no tengo información sobre este alojamiento. Contacta al anfitrión directamente, p. ej. por WhatsApp.",
    openAiError: "Lo siento, hubo un error. Contacta al anfitrión por WhatsApp.",
  },
  nl: {
    rateLimit:
      "Je hebt het berichtenlimiet voor dit uur bereikt. Neem een pauze, geniet van de stad en schrijf later weer! 🍕",
    noManual:
      "Welkom! Ik heb nog geen info over deze accommodatie. Neem rechtstreeks contact op met de host, bijv. via WhatsApp.",
    openAiError: "Sorry, er ging iets mis. Neem contact op met de host via WhatsApp.",
  },
  pt: {
    rateLimit:
      "Atingiste o limite de mensagens para esta hora. Faz uma pausa, aproveita a cidade e escreve mais tarde! 🍕",
    noManual:
      "Bem-vindo! Ainda não tenho informações sobre este alojamento. Contacta o anfitrião diretamente, por ex. no WhatsApp.",
    openAiError: "Desculpa, ocorreu um erro. Contacta o anfitrião no WhatsApp.",
  },
  pl: {
    rateLimit:
      "Osiągnąłeś limit wiadomości na tę godzinę. Zrób przerwę, ciesz się miastem i napisz później! 🍕",
    noManual:
      "Witaj! Nie mam jeszcze informacji o tym miejscu. Skontaktuj się bezpośrednio z gospodarzem, np. przez WhatsApp.",
    openAiError: "Przepraszamy, wystąpił błąd. Skontaktuj się z gospodarzem przez WhatsApp.",
  },
  zh: {
    rateLimit: "你已达到本小时的消息上限。休息一下，享受城市，稍后再联系！🍕",
    noManual: "欢迎！我暂时没有此房源的信息。请直接联系房东，例如通过 WhatsApp。",
    openAiError: "抱歉，出了点问题。请通过 WhatsApp 联系房东。",
  },
  ja: {
    rateLimit: "この1時間のメッセージ上限に達しました。少し休んで街を楽しみ、また後でどうぞ！🍕",
    noManual:
      "ようこそ！この宿泊先の情報はまだありません。ホストに直接ご連絡ください（例：WhatsApp）。",
    openAiError: "申し訳ありません。エラーが発生しました。WhatsApp でホストにご連絡ください。",
  },
  ko: {
    rateLimit: "이 시간대 메시지 한도에 도달했습니다. 잠시 쉬며 도시를 즐기고 나중에 다시 연락해 주세요! 🍕",
    noManual:
      "환영합니다! 이 숙소 정보가 아직 없습니다. 호스트에게 직접 연락하세요(예: WhatsApp).",
    openAiError: "죄송합니다. 오류가 발생했습니다. WhatsApp으로 호스트에게 문의해 주세요.",
  },
};

// ─────────────────────────────────────────────
// POST /properties/:slug/chat
// ─────────────────────────────────────────────
router.post("/properties/:slug/chat", async (req, res): Promise<void> => {
  console.log("[ROTTA] Ricevuta richiesta per:", req.path);
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
  const userMessage = parsed.data.message || "";
  // Always trust what the guest writes, not the UI selector
  const languageCode = parsed.data.language || "en";
  const dateLocale = DATE_LOCALE[languageCode] ?? "en-US";
  const guestCanned = GUEST_CANNED[languageCode] ?? GUEST_CANNED.en;

  if (!isDemo) {
    if (!chatRateLimiter.check(clientIp)) {
      const retryAfter = chatRateLimiter.retryAfterSeconds(clientIp);
      logger.warn({ ip: clientIp, retryAfter }, "Chat rate limit exceeded");
      res.status(429).json({
        reply: guestCanned.rateLimit,
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
    console.log("[DB] Property loaded:", { slug });

    if (propertyError || !propertyRow) {
      console.error("[ERRORE CRITICO] POST /properties/:slug/chat property load:", propertyError ?? "no row");
      res.status(404).json({ error: "Property not found." });
      return;
    }

    property = {
      slug: propertyRow.slug,
      name: propertyRow.name,
      content: propertyRow.manual_content ?? propertyRow.content ?? "",
    };
  }

  const { conversationHistory = [] } = parsed.data;

  /** Demo: always `DEMO_MASTER_MANUAL` in the system prompt; prod: Supabase manual. */
  const houseManual = isDemo ? DEMO_MASTER_MANUAL : property.content;

  // 4. Guardia: nessun contenuto disponibile — SSE done only (no OpenAI)
  if (!houseManual.trim()) {
    beginChatSse(res);
    const replyNoManual = guestCanned.noManual;
    const payload = SendPropertyChatResponse.parse({
      reply: replyNoManual,
      propertyName: property.name,
    });
    writeChatSseEvent(res, "done", payload);
    res.end();
    return;
  }

  // 5. Costruzione system prompt
  const today = new Date().toLocaleDateString(dateLocale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemPrompt = `
You are Marco, the AI assistant of "${property.name}".
CRITICAL: Always reply in the exact same language the guest is writing in. If the guest writes in French, reply in French. If Spanish, reply in Spanish. If Dutch, reply in Dutch. This applies to ALL languages without exception.
Today: ${today}

HOUSE MANUAL (your only source of truth):
${houseManual}

RULES:
1. If the answer is in the manual → respond clearly using that information.
2. If the guest reports a technical problem → give step-by-step help from the manual. Add ${SOS_TOKEN} only if the manual cannot solve it.
3. If the guest wants to check out → create a checklist using only the manual.
4. For restaurant or local tips → use the manual if available, otherwise use general knowledge and suggest contacting the host.
5. If information is missing → briefly apologize and suggest contacting the host on WhatsApp.
6. Emergency → suggest contacting emergency services and the host immediately.
7. BOLD TEXT: You MUST **bold** at least 3-4 important keywords or short phrases in EVERY response to make it skimmable (e.g., times, locations, passwords, objects).
`.trim();

  // 6. Costruzione array messaggi per OpenAI (ultimi 6 per risparmiare token)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "system",
      content: `Reply in the exact same language as the guest's message. Use the manual first. You MUST highlight a MINIMUM of 3-4 keywords in bold. Use ${SOS_TOKEN} ONLY if the manual cannot solve a technical issue.`,
    },
    { role: "user", content: userMessage },
  ];

  // 7. OpenAI streaming (SSE) — forward native deltas; isLikelyItalian only on full text after stream ends
    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 300,
        temperature: 0.4,
        stream: true,
        stream_options: { include_usage: true },
      });
    } catch (openAiStartError) {
      logger.error({ openAiStartError, slug }, "OpenAI chat stream start failed");
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    beginChatSse(res);

    let clientClosed = false;
    req.on("close", () => {
      clientClosed = true;
      logger.info({ slug }, "Client disconnected, aborting stream");
    });

    let rawReply = "";
    let lastChunk: OpenAI.Chat.Completions.ChatCompletionChunk | undefined;
    try {
      for await (const chunk of stream) {
        lastChunk = chunk;
        if (clientClosed) break;
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          rawReply += delta;
          writeChatSseEvent(res, "delta", { text: delta });
        }
      }
      if (lastChunk?.usage) {
        logger.info(
          {
            slug,
            prompt_tokens: lastChunk.usage.prompt_tokens,
            completion_tokens: lastChunk.usage.completion_tokens,
            total_tokens: lastChunk.usage.total_tokens,
          },
          "OpenAI token usage",
        );
      }
      if (clientClosed) {
        return;
      }
      if (!rawReply.trim()) {
        rawReply = guestCanned.openAiError;
        writeChatSseEvent(res, "delta", { text: rawReply });
      }
    } catch (streamError) {
      logger.error({ streamError, slug }, "OpenAI chat stream read failed");
      writeChatSseEvent(res, "error", { message: "Internal server error" });
      res.end();
      return;
    }

    const { reply: replyForClient, sosSuggested } = splitSosFromReply(rawReply);

    if (languageCode !== "it" && isLikelyItalian(replyForClient)) {
      const leakPayload = {
        event: "AI_LANGUAGE_LEAK" as const,
        expected: languageCode,
        detected: "it" as const,
        sample: replyForClient.substring(0, 100).replace(/\n/g, " "),
        timestamp: new Date().toISOString(),
        slug,
      };
      console.warn(leakPayload);
      logger.warn(leakPayload, "AI_LANGUAGE_LEAK");
    }

    if (!isDemo) {
      console.log("[DB] Inizio query al database...");
      try {
        const category = categorizeMessage(userMessage);
        const isHostFallback = shouldIncrementPendingQuestions(replyForClient);
        const resolved =
          category === "tourism"
            ? true
            : isHostFallback
              ? false
              : !detectNeedsAttention(replyForClient);

        const { error: logInsertError } = await supabaseAdmin.from("chat_logs").insert({
          property_slug: slug,
          guest_message: userMessage,
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

    const donePayload = SendPropertyChatResponse.parse({
      reply: replyForClient,
      propertyName: property.name,
      ...(sosSuggested && !isDemo ? { sosSuggested: true } : {}),
    });
    writeChatSseEvent(res, "done", donePayload);
    res.end();
  } catch (error) {
    console.error("[ERRORE CRITICO]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      try {
        writeChatSseEvent(res, "error", { message: "Internal server error" });
        res.end();
      } catch {
        /* ignore double-fault */
      }
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
