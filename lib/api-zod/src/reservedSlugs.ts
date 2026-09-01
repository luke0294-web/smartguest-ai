/**
 * Slug che una proprietà reale non può mai usare — condiviso tra backend e
 * frontend così che il form di creazione/modifica proprietà possa rifiutarli
 * subito, invece di scoprirlo solo alla risposta del server:
 * - "demo" è intercettato ovunque nell'app (chat, AI guard, GET property)
 *   per servire il contenuto demo statico — una proprietà reale con questo
 *   slug verrebbe mascherata per sempre;
 * - "dashboard" collide con la route letterale /host/dashboard del frontend
 *   (distinta da /host/:slug) — una proprietà con questo slug sarebbe
 *   irraggiungibile dal proprio link host.
 */
export const RESERVED_PROPERTY_SLUGS = new Set<string>(["demo", "dashboard"]);

export function isReservedPropertySlug(slug: string): boolean {
  return RESERVED_PROPERTY_SLUGS.has(slug.trim().toLowerCase());
}
