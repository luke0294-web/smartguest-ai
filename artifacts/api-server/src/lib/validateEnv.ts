const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "CEO_PASSWORD",
  "FRONTEND_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

function hasHostSessionSecret(): boolean {
  return Boolean(
    process.env.HOST_SESSION_SECRET?.trim() || process.env.SESSION_SECRET?.trim(),
  );
}

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    for (const key of missing) {
      console.error(`[ENV] Variabile obbligatoria mancante: ${key}`);
    }
    throw new Error("Configurazione ambiente non valida.");
  }

  if (!hasHostSessionSecret()) {
    console.error(
      "[ENV] Variabile obbligatoria mancante: HOST_SESSION_SECRET oppure SESSION_SECRET",
    );
    throw new Error("Configurazione ambiente non valida.");
  }
}

/**
 * Se ENABLE_RATE_LIMITING è impostata esplicitamente, prevale su NODE_ENV.
 * Altrimenti fallback su NODE_ENV === "production" (comportamento invariato di default).
 */
export function isProductionSecurityEnabled(): boolean {
  const explicit = process.env.ENABLE_RATE_LIMITING?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Avviso a boot, non bloccante: NODE_ENV è oggi l'unico interruttore che accende
 * rate limiting, limiti AI, allowlist CORS e occultamento errori Supabase.
 * Se il deploy è in produzione ma NODE_ENV non è impostato correttamente,
 * l'hardening resta silenziosamente disattivato.
 */
export function warnIfSecurityHardeningLikelyMisconfigured(): void {
  if (isProductionSecurityEnabled()) return;

  console.error(
    "[BOOT][ATTENZIONE] ============================================================",
  );
  console.error(
    "[BOOT][ATTENZIONE] Hardening di produzione DISATTIVATO (rate limiting, limiti AI,",
  );
  console.error(
    "[BOOT][ATTENZIONE] allowlist CORS, occultamento errori Supabase dettagliati).",
  );
  console.error(
    `[BOOT][ATTENZIONE] NODE_ENV attuale: "${process.env.NODE_ENV ?? "(non impostato)"}"`,
  );
  console.error(
    "[BOOT][ATTENZIONE] Se questo è un ambiente di PRODUZIONE, imposta NODE_ENV=production",
  );
  console.error(
    "[BOOT][ATTENZIONE] oppure ENABLE_RATE_LIMITING=true per attivare l'hardening.",
  );
  console.error(
    "[BOOT][ATTENZIONE] ============================================================",
  );
}
