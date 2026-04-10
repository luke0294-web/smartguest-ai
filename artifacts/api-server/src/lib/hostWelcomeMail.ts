import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { logger } from "./logger";

const smtpUser = process.env.EMAIL_USER?.trim();
const smtpPass = process.env.EMAIL_PASS?.trim();
const smtpPort = Number(process.env.EMAIL_SMTP_PORT ?? 465);

function getTransporter(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST ?? "smtp.gmail.com",
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

export function isHostWelcomeEmailConfigured(): boolean {
  return Boolean(smtpUser && smtpPass);
}

/** QR + simple A4 tent card (PDFKit). */
export async function buildHostWelcomePdfBuffer(slug: string, propertyName: string): Promise<Buffer> {
  const frontendBase = (process.env.FRONTEND_URL ?? "").trim().replace(/\/$/, "");
  if (!frontendBase) {
    throw new Error("FRONTEND_URL mancante: impossibile generare il PDF.");
  }
  const guestUrl = `${frontendBase}/guest/${slug}`;
  const dataUrl = await QRCode.toDataURL(guestUrl, {
    type: "image/png",
    errorCorrectionLevel: "M",
    width: 320,
    margin: 2,
  });
  const pngBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const m = 48;
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111827");
    doc.text(`Benvenuti a ${propertyName}`, m, 72, { width: pageW - 2 * m, align: "center" });

    doc.font("Helvetica").fontSize(11).fillColor("#6b7280");
    doc.text("Assistente ospiti HeyCico — scansiona il QR", m, 108, { width: pageW - 2 * m, align: "center" });

    const qrSize = 168;
    const qrX = (pageW - qrSize) / 2;
    doc.image(pngBuf, qrX, 132, { width: qrSize });

    doc.font("Helvetica").fontSize(11).fillColor("#374151");
    doc.text("Wi‑Fi • Regole • Consigli • Assistenza", m, 132 + qrSize + 20, {
      width: pageW - 2 * m,
      align: "center",
    });

    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#9ca3af");
    doc.text("Powered by HeyCico", m, doc.page.height - 52, {
      width: pageW - 2 * m,
      align: "center",
    });

    doc.end();
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildHostWelcomeEmailHtml(opts: {
  hostFirstName: string;
  propertyName: string;
  setupPasswordUrl: string;
  guestAssistantUrl: string;
}): string {
  const name = escapeHtml(opts.hostFirstName);
  const prop = escapeHtml(opts.propertyName);
  const setup = escapeHtml(opts.setupPasswordUrl);
  const guest = escapeHtml(opts.guestAssistantUrl);
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="font-size:18px;line-height:1.5;color:#111827;padding-bottom:16px;">Ciao ${name},</td></tr>
        <tr><td style="font-size:16px;line-height:1.55;color:#374151;padding-bottom:20px;">
          Benvenuto in <strong style="color:#111827;">HeyCico</strong>! La struttura <strong>${prop}</strong> è pronta. Imposta la tua password con il pulsante qui sotto e trova in allegato il cartello da tavolo con QR per i tuoi ospiti.
        </td></tr>
        <tr><td align="center" style="padding:12px 0 28px;">
          <a href="${setup}" style="display:inline-block;padding:15px 25px;background:#1e40af;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;border-radius:10px;">IMPOSTA LA TUA PASSWORD</a>
        </td></tr>
        <tr><td style="font-size:16px;line-height:1.55;color:#374151;padding-bottom:12px;">
          Link diretto all&apos;assistente per gli ospiti:
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="${guest}" style="font-size:16px;color:#2563eb;word-break:break-all;line-height:1.4;">${guest}</a>
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.5;color:#6b7280;padding-top:8px;">
          Cordiali saluti,<br/><strong style="color:#111827;">Il team HeyCico</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Mobile-first Italian HTML — same visual language as `buildHostWelcomeEmailHtml`. */
export function buildPasswordResetEmailHtml(opts: {
  propertyName: string;
  resetPasswordUrl: string;
}): string {
  const prop = escapeHtml(opts.propertyName);
  const resetUrl = escapeHtml(opts.resetPasswordUrl);
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="font-size:18px;line-height:1.5;color:#111827;padding-bottom:16px;">Ciao,</td></tr>
        <tr><td style="font-size:16px;line-height:1.55;color:#374151;padding-bottom:20px;">
          Hai richiesto il <strong style="color:#111827;">recupero accesso</strong> alla dashboard host su <strong style="color:#111827;">HeyCico</strong>.
          Per la struttura <strong>${prop}</strong> puoi reimpostare la password con il pulsante qui sotto. Il link è valido per <strong>2 ore</strong>.
        </td></tr>
        <tr><td align="center" style="padding:12px 0 28px;">
          <a href="${resetUrl}" style="display:inline-block;padding:15px 25px;background:#1e40af;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;border-radius:10px;">REIMPOSTA LA PASSWORD</a>
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.55;color:#6b7280;padding-bottom:20px;">
          Se non hai richiesto tu questo messaggio, ignora questa email: la tua password non verrà modificata.
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.5;color:#6b7280;padding-top:8px;">
          Cordiali saluti,<br/><strong style="color:#111827;">Il team HeyCico</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  propertyName: string;
  resetToken: string;
}): Promise<void> {
  if (!isHostWelcomeEmailConfigured()) {
    throw new Error("Email non configurata (EMAIL_USER / EMAIL_PASS).");
  }
  const frontendBase = (process.env.FRONTEND_URL ?? "").trim().replace(/\/$/, "");
  if (!frontendBase) throw new Error("FRONTEND_URL mancante");

  const resetPasswordUrl = `${frontendBase}/reset-password/${opts.resetToken}`;
  const html = buildPasswordResetEmailHtml({
    propertyName: opts.propertyName,
    resetPasswordUrl,
  });

  const transporter = getTransporter();
  const fromName = process.env.EMAIL_FROM_NAME ?? "HeyCico";
  const fromAddress = smtpUser ?? "hello@smartguest.ai";

  await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: opts.to.trim(),
    subject: "Recupero accesso HeyCico — reimposta la password",
    html,
  });

  logger.info({ to: opts.to }, "Password reset email sent");
}

export async function sendHostWelcomeEmail(opts: {
  to: string;
  hostDisplayName: string;
  propertyName: string;
  slug: string;
  inviteToken: string;
}): Promise<void> {
  if (!isHostWelcomeEmailConfigured()) {
    throw new Error("Email non configurata (EMAIL_USER / EMAIL_PASS).");
  }
  const frontendBase = (process.env.FRONTEND_URL ?? "").trim().replace(/\/$/, "");
  if (!frontendBase) throw new Error("FRONTEND_URL mancante");

  const setupPasswordUrl = `${frontendBase}/setup-password/${opts.inviteToken}`;
  const guestAssistantUrl = `${frontendBase}/guest/${opts.slug}`;

  const parts = opts.hostDisplayName.trim().split(/\s+/).filter(Boolean);
  const hostFirstName = parts[0] ?? "Host";

  const pdfBuf = await buildHostWelcomePdfBuffer(opts.slug, opts.propertyName);
  const html = buildHostWelcomeEmailHtml({
    hostFirstName,
    propertyName: opts.propertyName,
    setupPasswordUrl,
    guestAssistantUrl,
  });

  const transporter = getTransporter();
  const fromName = process.env.EMAIL_FROM_NAME ?? "HeyCico";
  const fromAddress = smtpUser ?? "hello@smartguest.ai";

  await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: opts.to.trim(),
    subject: "Benvenuto in HeyCico — la tua struttura è pronta ✨",
    html,
    attachments: [
      {
        filename: `Cartello_QR_${opts.propertyName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "")}.pdf`,
        content: pdfBuf,
        contentType: "application/pdf",
      },
    ],
  });

  logger.info({ to: opts.to, slug: opts.slug }, "Host welcome email sent");
}
