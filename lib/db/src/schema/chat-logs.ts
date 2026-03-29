import { pgTable, serial, text, timestamp, varchar, boolean } from "drizzle-orm/pg-core";

export const chatLogsTable = pgTable("chat_logs", {
  id: serial("id").primaryKey(),
  propertySlug: varchar("property_slug", { length: 255 }).notNull(),
  guestMessage: text("guest_message").notNull(),
  marcoReply: text("marco_reply").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolved: boolean("resolved").default(false).notNull(),
});