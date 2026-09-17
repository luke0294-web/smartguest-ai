import { escapeHtml } from "./hostWelcomeMail";
import { getResendFromHeader, isResendEmailConfigured, sendResendEmail } from "./resend";
import { logger } from "./logger";

const CEO_NOTIFICATION_EMAIL = "hello@heycico.com";

function buildNewLeadNotificationEmailHtml(lead: {
  hostName: string;
  email: string;
  propertyName: string;
}): string {
  const hostName = escapeHtml(lead.hostName);
  const email = escapeHtml(lead.email);
  const propertyName = escapeHtml(lead.propertyName);
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="font-size:18px;line-height:1.5;color:#111827;padding-bottom:16px;">Nuovo lead da HeyCico 🎉</td></tr>
        <tr><td style="padding-bottom:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="font-size:13px;color:#6b7280;padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;width:120px;">Nome</td>
              <td style="font-size:15px;color:#111827;padding:12px 16px;border-bottom:1px solid #e5e7eb;">${hostName}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b7280;padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Email</td>
              <td style="font-size:15px;color:#111827;padding:12px 16px;border-bottom:1px solid #e5e7eb;">${email}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b7280;padding:12px 16px;background:#f9fafb;">Struttura</td>
              <td style="font-size:15px;color:#111827;padding:12px 16px;">${propertyName}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="font-size:14px;line-height:1.5;color:#6b7280;">
          Vai al pannello CEO per contattare il lead.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Notifica best-effort al CEO per ogni nuovo lead dal form pubblico.
 * Non lancia mai se Resend non è configurato (logga e ritorna); lancia solo
 * se Resend È configurato ma l'invio fallisce, lasciando al chiamante decidere
 * come loggare quel caso con più contesto (es. l'id del lead).
 */
export async function sendNewLeadNotificationEmail(lead: {
  hostName: string;
  email: string;
  propertyName: string;
}): Promise<void> {
  if (!isResendEmailConfigured()) {
    logger.warn({ lead }, "Nuovo lead — notifica CEO non inviata (Resend non configurato)");
    return;
  }

  await sendResendEmail({
    from: getResendFromHeader(),
    to: CEO_NOTIFICATION_EMAIL,
    subject: `Nuovo lead: ${lead.propertyName}`,
    html: buildNewLeadNotificationEmailHtml(lead),
  });
}
