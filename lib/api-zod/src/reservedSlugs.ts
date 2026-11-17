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

/**
 * Ogni slug che inizia con "demo-" è riservato alle demo personalizzate
 * (vedi lib/demoProspects nel backend) — una proprietà reale con questo
 * prefisso verrebbe trattata come demo (stesso trattamento di "demo") e
 * mostrerebbe per sempre il contenuto sbagliato.
 */
const RESERVED_PROPERTY_SLUG_PREFIXES = ["demo-"];

export function isReservedPropertySlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase();
  if (RESERVED_PROPERTY_SLUGS.has(normalized)) return true;
  return RESERVED_PROPERTY_SLUG_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
