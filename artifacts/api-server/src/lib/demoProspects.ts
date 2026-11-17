import { randomBytes } from "node:crypto";
import { GetPropertyResponse } from "@workspace/api-zod";
import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { DEMO_MOCK_WHATSAPP_NUMBER } from "./demoProperty";

/**
 * Prefix shared with `isReservedPropertySlug` (lib/api-zod): any slug
 * starting with this can never be assigned to a real host property, so a
 * personalized demo link can never collide with — or be shadowed by — a
 * real property slug.
 */
const DEMO_PROSPECT_SLUG_PREFIX = "demo-";

export function isPersonalizedDemoSlug(slug: string): boolean {
  return slug.startsWith(DEMO_PROSPECT_SLUG_PREFIX) && slug !== "demo";
}

type DemoProspectRow = {
  slug: string;
  property_name: string;
  manual_content: string;
  suggested_question: string | null;
  first_message_at: string | null;
  created_at: string;
};

export type DemoProspectApi = {
  slug: string;
  url: string;
  propertyName: string;
  manualContent: string;
  suggestedQuestion: string | null;
  firstMessageAt: string | null;
  createdAt: string;
};

function frontendBaseUrl(): string {
  const raw = process.env.FRONTEND_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

export function demoProspectUrl(slug: string): string {
  const base = frontendBaseUrl();
  return base ? `${base}/demo/${slug}` : `/demo/${slug}`;
}

export function mapDemoProspectRowToApi(row: DemoProspectRow): DemoProspectApi {
  return {
    slug: row.slug,
    url: demoProspectUrl(row.slug),
    propertyName: row.property_name,
    manualContent: row.manual_content,
    suggestedQuestion: row.suggested_question,
    firstMessageAt: row.first_message_at,
    createdAt: row.created_at,
  };
}

function slugifyBase(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base.slice(0, 40) || "casa";
}

function randomSlugSuffix(): string {
  return randomBytes(6).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6);
}

/** Generates a candidate slug; caller retries on the rare uniqueness collision. */
export function buildDemoProspectSlugCandidate(propertyName: string): string {
  return `${DEMO_PROSPECT_SLUG_PREFIX}${slugifyBase(propertyName)}-${randomSlugSuffix()}`;
}

/**
 * Fetches a personalized demo by slug for the chat/GET-property handlers.
 * Returns null on any error or missing row (both treated as 404 by callers).
 */
export async function loadDemoProspectBySlug(slug: string): Promise<DemoProspectRow | null> {
  const { data, error } = await supabaseAdmin
    .from("demo_prospects")
    .select("slug, property_name, manual_content, suggested_question, first_message_at, created_at")
    .eq("slug", slug)
    .maybeSingle<DemoProspectRow>();

  if (error) {
    logger.error({ err: error, slug }, "loadDemoProspectBySlug — query Supabase fallita");
    return null;
  }
  return data ?? null;
}

/** Shape for `GET /properties/:slug` when the slug is a personalized demo. */
export function parseDemoProspectForGet(row: DemoProspectRow) {
  const createdAt = new Date(row.created_at);
  return GetPropertyResponse.parse({
    id: 0,
    slug: row.slug,
    name: row.property_name,
    content: row.manual_content,
    whatsappNumber: DEMO_MOCK_WHATSAPP_NUMBER,
    createdAt,
    updatedAt: createdAt,
  });
}

/**
 * Best-effort, fire-and-forget: records the first time a prospect actually
 * chats with their personalized demo. Never blocks or fails the chat
 * response — this is an engagement signal for the CEO panel, not a guard.
 */
export function markDemoProspectFirstMessage(slug: string): void {
  supabaseAdmin
    .from("demo_prospects")
    .update({ first_message_at: new Date().toISOString() })
    .eq("slug", slug)
    .is("first_message_at", null)
    .then(
      ({ error }) => {
        if (error) {
          logger.warn({ err: error, slug }, "markDemoProspectFirstMessage — update Supabase fallito");
        }
      },
      (err: unknown) => {
        logger.warn({ err, slug }, "markDemoProspectFirstMessage — eccezione non gestita");
      },
    );
}
