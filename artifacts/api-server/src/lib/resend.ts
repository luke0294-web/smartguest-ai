import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY mancante");
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

/** Verified sender address + display name (HeyCico by default). */
export function getResendFromHeader(): string {
  const email = process.env.RESEND_FROM_EMAIL?.trim();
  if (!email) {
    throw new Error("RESEND_FROM_EMAIL mancante");
  }
  const name = (process.env.EMAIL_FROM_NAME ?? "HeyCico").trim();
  return `"${name}" <${email}>`;
}

export function isResendEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

export async function sendResendEmail(params: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<void> {
  const resend = getResend();
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
    throw new Error(error.message ?? "Invio email Resend fallito");
  }
}
