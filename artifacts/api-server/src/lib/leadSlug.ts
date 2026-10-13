import { randomBytes } from "node:crypto";
import { isReservedPropertySlug } from "@workspace/api-zod";

/** Upper bound for collision retries — never loop forever on a pathological name. */
export const MAX_LEAD_SLUG_ATTEMPTS = 20;

function slugifyPropertyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
      .replace(/-$/g, "") || "proprieta"
  );
}

function randomSuffix(): string {
  // 4 lowercase alphanumerics: ~1.6M combinations per name — enough that a
  // guest link can't be guessed from the property name alone.
  return randomBytes(8).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 4).padEnd(4, "0");
}

/**
 * Slug base for a property created from a lead.
 *
 * A name that slugifies into a reserved slug ("demo", "dashboard", or any
 * "demo-…") gets a neutral prefix: appending "-1", "-2"… to a reserved base
 * would stay reserved forever (every "demo-…" candidate is reserved).
 */
export function leadSlugBase(propertyName: string): string {
  const base = slugifyPropertyName(propertyName);
  return isReservedPropertySlug(base) ? `struttura-${base}` : base;
}

/** One candidate slug: `<base>-<random suffix>`, never reserved. */
export function leadSlugCandidate(base: string): string {
  return `${base}-${randomSuffix()}`;
}
