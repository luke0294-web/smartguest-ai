import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { db, hostKnowledgeTable } from "@workspace/db";
import { SendChatMessageBody, SendChatMessageResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, conversationHistory = [] } = parsed.data;

  const rows = await db.select().from(hostKnowledgeTable).limit(1);
  const knowledgeContent = rows[0]?.content ?? "";

  if (!knowledgeContent.trim()) {
    res.json(SendChatMessageResponse.parse({
      reply: "Benvenuto! Al momento non ho ancora informazioni sull'appartamento. Per favore contatta direttamente l'host."
    }));
    return;
  }

  const systemPrompt = `Sei Marco, l'assistente virtuale di questo appartamento. Rispondi in modo amichevole e nella stessa lingua dell'utente, basandoti SOLO sul testo fornito dall'host qui sotto.

INFORMAZIONI FORNITE DALL'HOST:
${knowledgeContent}

REGOLE IMPORTANTI:
1. Rispondi SEMPRE nella stessa identica lingua in cui l'utente ti fa la domanda. Se scrive in inglese, rispondi in inglese perfetto traducendo le informazioni. Se scrive in spagnolo, in spagnolo. Se in francese, in francese. Ecc.
2. Basati ESCLUSIVAMENTE sulle informazioni fornite dall'host sopra. Non inventare mai nulla che non sia presente nel testo.
3. ANTI-OVER-REFUSAL — Se l'ospite fa una domanda generale (cosa fare la sera, dove mangiare, cosa visitare, ecc.), NON rifiutare subito. Cerca nel testo dell'host i luoghi, ristoranti, consigli o attività che si avvicinano di più alla sua richiesta e proponili proattivamente in modo entusiasta. È meglio suggerire qualcosa di correlato che rispondere "non lo so".
4. Rinuncia e indirizza all'host su WhatsApp SOLO se la domanda riguarda un'informazione completamente assente dal testo E non correlata a nulla di ciò che è scritto (es. farmacie, orari dei musei, noleggio auto, trasporti pubblici). In quel caso rispondi educatamente nella lingua dell'utente che non hai questa informazione e di contattare l'host su WhatsApp.
5. Sii sempre cordiale, caldo e di buon umore come un amico locale che conosce bene il quartiere.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    })),
    { role: "user", content: message }
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 500,
    temperature: 0.3,
  });

  const reply = completion.choices[0]?.message?.content ?? "Mi dispiace, si è verificato un errore. Contatta l'host.";
  logger.info({ messageLength: message.length }, "Chat message processed");

  res.json(SendChatMessageResponse.parse({ reply }));
});

export default router;
