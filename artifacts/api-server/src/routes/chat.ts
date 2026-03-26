import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import { SendPropertyChatBody, SendPropertyChatResponse, SendPropertyChatParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  const systemPrompt = `Sei Marco, l'assistente virtuale dell'appartamento "${property.name}". Rispondi in modo amichevole e nella stessa lingua dell'utente, basandoti SOLO sul testo fornito dall'host qui sotto.

INFORMAZIONI FORNITE DALL'HOST PER "${property.name}":
${property.content}

REGOLE IMPORTANTI:
1. Rispondi SEMPRE nella stessa identica lingua in cui l'utente ti fa la domanda. Se scrive in inglese, rispondi in inglese perfetto traducendo le informazioni. Se in spagnolo, in spagnolo. Se in francese, in francese. Ecc.
2. Basati ESCLUSIVAMENTE sulle informazioni fornite dall'host sopra. Non inventare mai nulla che non sia presente nel testo.
3. ANTI-OVER-REFUSAL — Se l'ospite fa una domanda generale (cosa fare la sera, dove mangiare, cosa visitare, ecc.), NON rifiutare subito. Cerca nel testo i luoghi, ristoranti, consigli o attività che si avvicinano di più alla sua richiesta e proponili proattivamente in modo entusiasta.
4. Rinuncia e indirizza all'host su WhatsApp SOLO se la domanda riguarda un'informazione completamente assente dal testo E non correlata a nulla di ciò che è scritto (es. farmacie, orari dei musei, noleggio auto). In quel caso rispondi educatamente nella lingua dell'utente.
5. Sii sempre cordiale, caldo e di buon umore come un amico locale che conosce bene il quartiere.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 500,
    temperature: 0.3,
  });

  const reply = completion.choices[0]?.message?.content ?? "Mi dispiace, si è verificato un errore. Contatta l'host.";
  logger.info({ slug: params.data.slug, messageLength: message.length }, "Chat message processed");

  res.json(SendPropertyChatResponse.parse({ reply, propertyName: property.name }));
});

export default router;
