const REQUIRED_VARS = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "CEO_PASSWORD",
  "HOST_SESSION_SECRET",
  "FRONTEND_URL",
  "EMAIL_USER",
  "EMAIL_PASS",
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]?.trim());

  if (missing.length === 0) return;

  for (const key of missing) {
    console.error(`[ENV] Variabile obbligatoria mancante: ${key}`);
  }

  throw new Error("Configurazione ambiente non valida.");
}
