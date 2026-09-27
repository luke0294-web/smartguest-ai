import { pgTable, bigserial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Personalized outreach demos (/demo/:slug) — a real property record is
 * never created for these; see artifacts/api-server/src/lib/demoProspects.ts
 * for the actual runtime queries (this file only mirrors the Supabase
 * schema for documentation, per this repo's convention — see README).
 */
export const demoProspectsTable = pgTable("demo_prospects", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  slug: text("slug").notNull().unique(),
  propertyName: text("property_name").notNull(),
  manualContent: text("manual_content").notNull(),
  suggestedQuestion: text("suggested_question"),
  firstMessageAt: timestamp("first_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DemoProspect = typeof demoProspectsTable.$inferSelect;
export type NewDemoProspect = typeof demoProspectsTable.$inferInsert;
