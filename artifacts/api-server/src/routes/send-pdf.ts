import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getResendFromHeader, isResendEmailConfigured, sendResendEmail } from "../lib/resend";
import { requireCeoSession } from "../lib/ceo-session";

const router: IRouter = Router();

interface SendPdfBody {
  email?: string;
  propertyName?: string;
  pdfBase64?: string;
  chatLink?: string;
}

/**
 * POST /api/send-pdf
 *
 * Riceve il PDF già generato dal frontend (come Data URI base64)
 * e lo invia via Resend.
 *
 * Variabili: RESEND_API_KEY, RESEND_FROM_EMAIL, opzionale EMAIL_FROM_NAME
 */
router.post("/send-pdf", async (req: Request<{}, {}, SendPdfBody>, res: Response): Promise<void> => {
  if (!requireCeoSession(req, res)) return;

  const { email, propertyName, pdfBase64, chatLink } = req.body;

  if (!email?.trim()) {
    res.status(400).json({ error: "Email obbligatoria." });
    return;
  }

  if (!propertyName?.trim()) {
    res.status(400).json({ error: "Nome proprietà obbligatorio." });
    return;
  }

  if (!pdfBase64?.trim()) {
    res.status(400).json({ error: "PDF non ricevuto. Riprova." });
    return;
  }

  if (!isResendEmailConfigured()) {
    res.status(503).json({ error: "Invio email non configurato sul server." });
    return;
  }

  const base64Data = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
  const normalizedPdf = base64Data.trim();
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(normalizedPdf)) {
    res.status(400).json({ error: "PDF non valido. Riprova." });
    return;
  }

  const pdfBuffer = Buffer.from(normalizedPdf, "base64");
  const safePropertyName = propertyName.trim();
  const link = chatLink ?? "";

  try {
    await sendResendEmail({
      from: getResendFromHeader(),
      to: email.trim(),
      subject: "Il tuo Cartello QR HeyCico è pronto! 🖨️",
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.5;">
          <h2 style="color: #1d4ed8;">Il tuo Cartello Digitale è pronto! 🖨️</h2>
          <p>Ciao,</p>
          <p>In allegato trovi il cartello da tavolo in formato PDF con il QR Code della tua struttura. Puoi stamparlo o inserirlo in una cornice.</p>
          <p>Inoltre, ecco il <strong>link diretto</strong> al tuo Assistente Virtuale. Puoi copiarlo e inviarlo ai tuoi ospiti via WhatsApp o Airbnb prima del loro arrivo:</p>
          <p style="background-color: #f3f4f6; padding: 10px; border-radius: 5px;">
            <a href="${link}" style="color: #2563eb; text-decoration: none;"><strong>${link}</strong></a>
          </p>
          <br>
          <p>Buon lavoro,<br><strong>Il team di HeyCico</strong></p>
        </div>
      `,
      attachments: [
        {
          filename: `Cartello_QR_${safePropertyName.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  } catch (err: unknown) {
    logger.error({ email: email.trim(), err }, "Invio email PDF fallito");
    res.status(500).json({ error: "Errore durante l'invio dell'email. Riprova più tardi." });
    return;
  }

  logger.info({ email: email.trim(), propertyName: safePropertyName }, "Email con PDF inviata (Resend)");
  res.status(200).json({
    success: true,
    message: "Email inviata.",
  });
});

export default router;
