import { logger } from "./logger";

function readHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { status: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** Log a distinct marker when OpenAI returns 429 (quota / rate limit). */
export function logOpenAi429IfNeeded(error: unknown, context: string): void {
  if (readHttpStatus(error) !== 429) return;
  logger.error({ error, context }, "[OPENAI 429 ERROR] Quota exceeded or rate limited");
}
