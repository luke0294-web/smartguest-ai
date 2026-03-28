import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { SendPropertyChatBody, SendPropertyChatResponse, SendPropertyChatParams } from "@workspace/api-zod";
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
    res.json(SendPropertyChatResponse.parse({
      reply: "Benvenuto! Al momento non ho ancora informazioni su questo appartamento. Contatta direttamente l'host.",
      propertyName: property.name,
    }));
    return;
  }

  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const systemPrompt = `Sei Marco, il fantastico e amichevole co-host della struttura "${property.name}". Il tuo compito è assistere gli ospiti facendoli sentire a casa. Usa un tono caldo, colloquiale e informale (usa qualche emoji 🍕).

  DATA ODIERNA: ${today}

  INFORMAZIONI DELLA CASA (Conosci questa casa a memoria perché ci lavori):
  ${property.content}

  REGOLE TASSATIVE:
  RISPONDI COME SE OGNI PAROLA TI COSTASSE 1 EURO. Sii telegrafico e amichevole.
  0. REGOLE D'ORO: Sii brevissimo (max 3-4 frasi). Rispondi SEMPRE nella lingua dell'utente. Se c'è un danno o un'emergenza (macchie, guasti), rimanda SEMPRE all'host su WhatsApp immediatamente.
  1. DIVIETO DI LINGUAGGIO ROBOTICO: È SEVERAMENTE VIETATO usare la "Blacklist dei Robot": "non ho informazioni", "non è specificato", "non sono fornite indicazioni", "nella descrizione". Se non sai una cosa, rispondi come un amico: "Non ne ho idea", "Non lo so di preciso", "Chiedi all'host".
  2. GESTIONE DELLE COSE MANCANTI: Se un ospite chiede di un elettrodomestico, servizio o regola (es. lavatrice, aria condizionata) che NON C'È nelle "INFORMAZIONI DELLA CASA", devi dare per certo che NON ESISTE. Rispondi dicendo: "Purtroppo in appartamento non abbiamo la lavatrice 🧺" oppure "Mi spiace, ma non offriamo questo servizio". NON giustificarti dicendo che non hai il dato.
  3. ESCALATION: Se la richiesta è urgente o molto specifica, di' in modo amichevole: "Per questo dettaglio specifico, fai un fischio all'host su WhatsApp, lui sa sicuramente come aiutarti al volo!"
  4. INFO IN TEMPO REALE: Non hai accesso diretto a internet. Se l'ospite chiede il meteo, il traffico o eventi odierni, rispondi in modo gentile dicendo che non hai i dati in tempo reale e consiglia di dare un'occhiata veloce su Google o su un'app meteo per avere l'informazione più aggiornata. Sii sempre utile e amichevole!
  5. ANTI-OVER-REFUSAL: Se chiedono consigli su cosa mangiare o vedere, usa le tue conoscenze generali della città se non c'è nulla di specifico scritto.
  6. ESEMPIO DI RISPOSTA PER LAVATRICE: "Ciao! Purtroppo non abbiamo la lavatrice in appartamento 🧺. Se hai urgenza, ti consiglio di mandare un messaggino su WhatsApp all'host, magari ti sa consigliare una lavanderia a gettoni qui vicino!"`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    // 🔥 TRUCCO SALVA-SOLDI: Prende solo gli ultimi 6 messaggi (3 botta e risposta)
    ...conversationHistory.slice(-6).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 150,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content
      ?? "Mi dispiace, si è verificato un errore. Contatta l'host.";

    logger.info({ slug: params.data.slug, messageLength: message.length }, "Chat message processed");
    res.json(SendPropertyChatResponse.parse({ reply, propertyName: property.name }));
  } catch (err) {
    logger.error({ err, slug: params.data.slug }, "OpenAI API error");
    res.status(500).json({ error: "Errore di connessione con l'assistente" });
  }
});

export default router;
