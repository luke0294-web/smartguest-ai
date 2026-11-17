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

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SUFFIX_LENGTH = 8;

function randomSuffix(): string {
  // 8 chars from 36 symbols: ~2.8 × 10^12 combinations per name. The guest
  // link (and the house manual behind it) must not be guessable even by a
  // distributed attacker going through the public rate limits.
  const bytes = randomBytes(SUFFIX_LENGTH);
  let out = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) out += SUFFIX_ALPHABET[bytes[i] % SUFFIX_ALPHABET.length];
  return out;
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
