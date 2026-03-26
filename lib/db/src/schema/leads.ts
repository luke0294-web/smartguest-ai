import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  hostName: text("host_name").notNull(),
  email: text("email").notNull(),
  propertyName: text("property_name").notNull(),
  status: text("status").notNull().default("Nuovo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Lead = typeof leadsTable.$inferSelect;
export type NewLead = typeof leadsTable.$inferInsert;
