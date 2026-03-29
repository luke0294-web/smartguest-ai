import { Router, type IRouter } from "express";
import { db, hostKnowledgeTable, type HostKnowledge } from "@workspace/db";
import { logger } from "../lib/logger";

type KnowledgeResponse = Pick<HostKnowledge, "id" | "content" | "updatedAt">;

const toResponse = (row: HostKnowledge): KnowledgeResponse => ({
  id: row.id,
  content: row.content,
  updatedAt: row.updatedAt,
});

const router: IRouter = Router();

const HOST_PASSWORD = process.env.HOST_PASSWORD ?? "host123";

router.get("/host/knowledge", async (req, res): Promise<void> => {
  const rows = await db.select().from(hostKnowledgeTable).limit(1);

  if (!rows[0]) {
    const [created] = await db.insert(hostKnowledgeTable).values({ content: "" }).returning();
    res.json(toResponse(created));
    return;
  }

  res.json(toResponse(rows[0]));
});

router.put("/host/knowledge", async (req, res): Promise<void> => {
  const { content, hostPassword } = req.body ?? {};

  if (typeof content !== "string" || typeof hostPassword !== "string") {
    res.status(400).json({ error: "Campi 'content' e 'hostPassword' obbligatori." });
    return;
  }

  if (hostPassword !== HOST_PASSWORD) {
    res.status(401).json({ error: "Password non corretta. Accesso negato." });
    return;
  }

  const rows = await db.select().from(hostKnowledgeTable).limit(1);

  let updated: HostKnowledge;
  if (!rows[0]) {
    [updated] = await db.insert(hostKnowledgeTable).values({ content }).returning();
  } else {
    [updated] = await db.update(hostKnowledgeTable)
      .set({ content })
      .returning();
  }

  logger.info({ contentLength: content.length }, "Host knowledge updated");
  res.json(toResponse(updated));
});

export default router;
