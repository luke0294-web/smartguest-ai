/**
 * Gmail and most SMTP providers require the envelope From address to match auth.user (EMAIL_USER).
 * Display name comes from EMAIL_FROM_NAME (default HeyCico).
 */
export function getSmtpFromHeader(): string {
  const user = process.env.EMAIL_USER?.trim();
  if (!user) {
    throw new Error("EMAIL_USER mancante");
  }
  const name = (process.env.EMAIL_FROM_NAME ?? "HeyCico").trim();
  return `"${name}" <${user}>`;
}
