import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { SendPropertyChatBody, SendPropertyChatResponse, SendPropertyChatParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Web search via gpt-4o-search-preview (free, no external API key needed) ──
async function searchWeb(query: string): Promise<string> {
  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [
        {
          role: "user",
          content: `${query}\n\nRispondi in modo conciso (max 3 frasi), con fatti aggiornati in tempo reale. Indica sempre la fonte o la data se disponibile.`,
        },
      ],
      web_search_options: { search_context_size: "low" },
    } as any);

    const text = result.choices[0]?.message?.content ?? "";
    logger.info({ query, chars: text.length }, "Web search completed");
    return text;
  } catch (err: any) {
    logger.error({ err: err.message }, "Web search failed");
    return `Ricerca non disponibile al momento: ${err.message}`;
  }
}

// ─── Tool definition for OpenAI function calling ─────────────────────────────
const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Cerca informazioni in tempo reale su Internet. " +
        "Usa questo strumento SEMPRE quando l'ospite chiede: " +
        "meteo odierno, temperatura attuale, previsioni, traffico, scioperi dei trasporti, " +
        "eventi locali in corso, orari aggiornati di musei o attrazioni, " +
        "notizie recenti o qualsiasi informazione che cambia di giorno in giorno. " +
        "NON usare questo strumento per domande sul regolamento dell'appartamento, " +
        "WiFi, check-in/check-out o informazioni fornite dall'host.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Query di ricerca specifica e contestualizzata. " +
              "Includi sempre la città dell'appartamento per ricerche geografiche. " +
              "Esempio: 'meteo Milano oggi' oppure 'sciopero trasporti Firenze domani' oppure 'eventi Venezia questo weekend'. " +
              "Ricava la città dalla knowledge base della proprietà se disponibile.",
          },
        },
        required: ["query"],
      },
    },
  },
];

router.post("/properties/:slug/chat", async (req, res): Promise<void> => {
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
    res.json(SendPropertyChatResponse.parse({
      reply: "Benvenuto! Al momento non ho ancora informazioni su questo appartamento. Contatta direttamente l'host.",
      propertyName: property.name,
    }));
    return;
  }

  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const systemPrompt = `Sei l'assistente virtuale intelligente basato su SmartGuest AI, dedicato alla struttura "${property.name}". Il tuo compito è assistere gli ospiti di questa struttura, rispondendo in modo amichevole e professionale nella stessa lingua dell'utente.

DATA ODIERNA: ${today}

INFORMAZIONI FORNITE DALL'HOST PER "${property.name}":
${property.content}

REGOLE IMPORTANTI:
1. Lingua: Rispondi SEMPRE nella stessa identica lingua in cui l'utente ti fa la domanda. Se scrive in inglese, rispondi in inglese. Se in spagnolo, in spagnolo. Ecc. Questo vale anche per le informazioni ottenute dalla ricerca web.
2. Fonte primaria: Per domande su regolamento, WiFi, check-in/check-out, parcheggio e informazioni dell'appartamento, basati ESCLUSIVAMENTE sulle informazioni fornite dall'host sopra. Non inventare mai nulla di non presente nel testo.
3. Posizione: Non dare per scontato di essere in una città specifica a meno che non sia esplicitamente indicata nelle informazioni dell'host. Ricava la città e la zona dalle informazioni fornite dall'host.
4. Ricerca web obbligatoria: Se ti chiedono il meteo odierno, la temperatura attuale, il traffico, scioperi, eventi locali, notizie o qualsiasi informazione in tempo reale, NON dire mai "non lo so" o "non posso accedere a Internet". Usa SEMPRE lo strumento search_web per recuperare la risposta aggiornata. Ricava la città dalla knowledge base della proprietà e includila nella query.
5. Identità certa: Sai SEMPRE con assoluta certezza che sei l'assistente di "${property.name}". Non dire MAI frasi come "non so dove sei" o "non so di quale struttura si tratta".
6. ANTI-OVER-REFUSAL: Se l'ospite fa una domanda generale (cosa fare, dove mangiare, cosa visitare), cerca prima nel testo le informazioni disponibili e proponile proattivamente.
7. Escalation: Indirizza all'host su WhatsApp SOLO se la domanda riguarda qualcosa di completamente assente dal testo E dalla ricerca web.
8. Tono: Sii sempre cordiale, caldo e di buon umore come un concierge professionale che conosce perfettamente la struttura e il territorio circostante.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  // ── Round 1: Ask the model — it may call search_web ───────────────────────
  const firstResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools,
    tool_choice: "auto",
    max_tokens: 800,
    temperature: 0.3,
  });

  const firstChoice = firstResponse.choices[0];
  const assistantMessage = firstChoice.message;

  // ── If no tool call, return the direct answer ──────────────────────────────
  if (firstChoice.finish_reason !== "tool_calls" || !assistantMessage.tool_calls?.length) {
    const reply = assistantMessage.content ?? "Mi dispiace, si è verificato un errore. Contatta l'host.";
    logger.info({ slug: params.data.slug, messageLength: message.length }, "Chat message processed (no tool call)");
    res.json(SendPropertyChatResponse.parse({ reply, propertyName: property.name }));
    return;
  }

  // ── Round 2: Execute tool calls, then get final response ──────────────────
  const toolMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const toolCall of assistantMessage.tool_calls) {
    if (toolCall.function.name === "search_web") {
      let query = "";
      try {
        const args = JSON.parse(toolCall.function.arguments);
        query = args.query ?? message;
      } catch {
        query = message;
      }

      logger.info({ slug: params.data.slug, query }, "Executing web search for guest");
      const searchResult = await searchWeb(query);

      toolMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: searchResult,
      });
    }
  }

  // Build the follow-up message thread
  const messagesWithToolResult: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...messages,
    { role: "assistant", content: assistantMessage.content, tool_calls: assistantMessage.tool_calls } as any,
    ...toolMessages,
  ];

  const finalResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messagesWithToolResult,
    max_tokens: 600,
    temperature: 0.3,
  });

  const reply = finalResponse.choices[0]?.message?.content
    ?? "Mi dispiace, si è verificato un errore. Contatta l'host.";

  logger.info({ slug: params.data.slug, messageLength: message.length, usedWebSearch: true }, "Chat message processed (with web search)");
  res.json(SendPropertyChatResponse.parse({ reply, propertyName: property.name }));
});

export default router;
