import { pgTable, bigserial, text, timestamp } from "drizzle-orm/pg-core";

export const hostsTable = pgTable("hosts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull().unique(),
  hostPassword: text("host_password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Host = typeof hostsTable.$inferSelect;
export type NewHost = typeof hostsTable.$inferInsert;
