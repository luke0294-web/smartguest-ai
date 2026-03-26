import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const hostsTable = pgTable("hosts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  hostPassword: text("host_password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Host = typeof hostsTable.$inferSelect;
export type NewHost = typeof hostsTable.$inferInsert;
