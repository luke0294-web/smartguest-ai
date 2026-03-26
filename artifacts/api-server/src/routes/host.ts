import { Router, type IRouter } from "express";
import { db, hostKnowledgeTable } from "@workspace/db";
import { UpdateHostKnowledgeBody, GetHostKnowledgeResponse, UpdateHostKnowledgeResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const HOST_PASSWORD = process.env.HOST_PASSWORD ?? "host123";

router.get("/host/knowledge", async (req, res): Promise<void> => {
  const rows = await db.select().from(hostKnowledgeTable).limit(1);

  if (!rows[0]) {
    const [created] = await db.insert(hostKnowledgeTable).values({ content: "" }).returning();
    res.json(GetHostKnowledgeResponse.parse(created));
    return;
  }

  res.json(GetHostKnowledgeResponse.parse(rows[0]));
});

router.put("/host/knowledge", async (req, res): Promise<void> => {
  const parsed = UpdateHostKnowledgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { content, hostPassword } = parsed.data;

  if (hostPassword !== HOST_PASSWORD) {
    res.status(401).json({ error: "Password non corretta. Accesso negato." });
    return;
  }

  const rows = await db.select().from(hostKnowledgeTable).limit(1);

  let updated;
  if (!rows[0]) {
    [updated] = await db.insert(hostKnowledgeTable).values({ content }).returning();
  } else {
    [updated] = await db.update(hostKnowledgeTable)
      .set({ content })
      .returning();
  }

  logger.info({ contentLength: content.length }, "Host knowledge updated");
  res.json(UpdateHostKnowledgeResponse.parse(updated));
});

export default router;
