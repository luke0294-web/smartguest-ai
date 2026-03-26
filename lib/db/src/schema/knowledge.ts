import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hostKnowledgeTable = pgTable("host_knowledge", {
  id: serial("id").primaryKey(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHostKnowledgeSchema = createInsertSchema(hostKnowledgeTable).omit({ id: true, updatedAt: true });
export type InsertHostKnowledge = z.infer<typeof insertHostKnowledgeSchema>;
export type HostKnowledge = typeof hostKnowledgeTable.$inferSelect;
