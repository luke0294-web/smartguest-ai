const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "CEO_PASSWORD",
  "FRONTEND_URL",
  "EMAIL_USER",
  "EMAIL_PASS",
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
