import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

function isBcryptHash(stored: string): boolean {
  return stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");
}

export async function hashHostPassword(plain: string): Promise<string> {
  return bcrypt.hash(String(plain).trim(), BCRYPT_ROUNDS);
}

export async function verifyHostPassword(stored: string, plain: string): Promise<boolean> {
  const p = String(plain).trim();
  if (!stored || !p) return false;
  if (isBcryptHash(stored)) {
    return bcrypt.compare(p, stored);
  }
  return stored === p;
}
