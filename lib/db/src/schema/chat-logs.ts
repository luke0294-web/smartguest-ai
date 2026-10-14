import { pgTable, bigserial, text, timestamp, varchar, boolean } from "drizzle-orm/pg-core";

export const chatLogsTable = pgTable("chat_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  propertySlug: varchar("property_slug", { length: 255 }).notNull(),
  guestMessage: text("guest_message").notNull(),
  marcoReply: text("marco_reply").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolved: boolean("resolved").default(false).notNull(),
});