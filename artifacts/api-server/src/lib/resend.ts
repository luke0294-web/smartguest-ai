import { Resend } from "resend";
import { logger } from "./logger";

let resendClient: Resend | null = null;

const MISSING_RESEND_API_KEY =
  "RESEND_API_KEY mancante: aggiungi la chiave API da resend.com nelle variabili d'ambiente su Render (Environment → Add Environment Variable).";

const MISSING_RESEND_FROM_EMAIL =
  "RESEND_FROM_EMAIL mancante: aggiungi l'indirizzo mittente verificato nel dashboard Resend come variabile RESEND_FROM_EMAIL su Render.";

export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error(MISSING_RESEND_API_KEY);
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

/** Verified sender: display name + `RESEND_FROM_EMAIL` only (no hardcoded addresses). */
export function getResendFromHeader(): string {
  const email = process.env.RESEND_FROM_EMAIL?.trim();
  if (!email) {
    throw new Error(MISSING_RESEND_FROM_EMAIL);
  }
  const name = (process.env.EMAIL_FROM_NAME ?? "HeyCico").trim();
  return `"${name}" <${email}>`;
}

export function isResendEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

function safeResendFailureMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err !== null && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Invio email fallito";
}

export async function sendResendEmail(params: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<void> {
  const resend = getResend();
  try {
    const { error } = await resend.emails.send({
      from: params.from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    });
    if (error) {
      throw error;
    }
  } catch (err: unknown) {
    const message = safeResendFailureMessage(err);
    logger.error({ message }, "Resend emails.send failed");
    throw new Error("EMAIL_SEND_FAILED");
  }
}
