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

  const systemPrompt = `Sei un assistente virtuale per ospiti di un appartamento Airbnb a Roma. 
Il tuo compito è rispondere alle domande degli ospiti in modo cordiale e utile, ESCLUSIVAMENTE basandoti sulle informazioni fornite dall'host qui sotto.

INFORMAZIONI FORNITE DALL'HOST:
${knowledgeContent}

REGOLE IMPORTANTI:
1. Rispondi SOLO basandoti sulle informazioni fornite dall'host sopra.
2. Se la risposta a una domanda NON si trova nelle informazioni fornite, rispondi educatamente che non hai questa informazione e di contattare l'host. Adatta questo messaggio nella lingua dell'utente.
3. Rispondi SEMPRE nella stessa identica lingua in cui l'utente ti fa la domanda. Se l'utente scrive in inglese, traduci le informazioni del database e rispondi in inglese perfetto. Se scrive in spagnolo, rispondi in spagnolo. Se scrive in francese, rispondi in francese, ecc.
4. Non inventare mai informazioni che non sono nel testo dell'host.
5. Se l'ospite ti saluta o ti fa domande generali, puoi rispondere gentilmente nella sua lingua, ma rimanda sempre all'host per informazioni non presenti nel testo.`;

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
