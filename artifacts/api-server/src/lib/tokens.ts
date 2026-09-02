import { createHash } from "node:crypto";

/**
 * Hashes a bearer token (reset_token, invite_token, ...) for storage.
 * The plaintext exists only in the URL/email sent at generation time —
 * only this hash is persisted, and lookups compare hash-to-hash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
