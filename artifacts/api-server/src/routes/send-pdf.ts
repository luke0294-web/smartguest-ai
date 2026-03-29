import { Router, type IRouter, type Request, type Response } from "express";
import nodemailer from "nodemailer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface SendPdfBody {
  email?: string;
  propertyName?: string;
  pdfBase64?: string;
}

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.EMAIL_SMTP_PORT ?? 465),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * POST /api/send-pdf
 *
 * Riceve il PDF già generato dal frontend (come Data URI base64)
 * e lo invia via email all'host usando Nodemailer + Gmail SMTP.
 *
 * Credenziali configurate nelle variabili d'ambiente:
 *   EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM_NAME
 */
router.post("/send-pdf", async (req: Request<{}, {}, SendPdfBody>, res: Response): Promise<void> => {
  const { email, propertyName, pdfBase64 } = req.body;

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

  const fromName = process.env.EMAIL_FROM_NAME ?? "SmartGuest AI";
  const fromAddress = process.env.EMAIL_USER ?? "hello.smartguest@gmail.com";

  const base64Data = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
  const pdfBuffer = Buffer.from(base64Data, "base64");

  try {
    logger.info({ email, propertyName }, "📧 Invio email con PDF in corso...");

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: email.trim(),
      subject: "Il tuo Cartello QR SmartGuest AI è pronto! 🖨️",
      text: `Ciao!\n\nIn allegato trovi il cartello da tavolo con il QR Code della tua struttura "${propertyName}", pronto da stampare.\n\nIl team di SmartGuest AI`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">
          <div style="background: #2563eb; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 20px;">SmartGuest AI</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">Il tuo Portiere Digitale 24/7</p>
          </div>
          <div style="padding: 32px; background: #f9fafb; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 12px; font-size: 15px;">Ciao!</p>
            <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6;">
              In allegato trovi il <strong>Cartello da Tavolo</strong> con il QR Code della tua struttura
              <strong>"${propertyName}"</strong>, pronto da stampare e posizionare in camera.
            </p>
            <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
              Gli ospiti potranno inquadrarlo per accedere istantaneamente a tutte le informazioni.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center;">
              Il team di SmartGuest AI
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Cartello_QR_${propertyName.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    logger.info({ email, propertyName }, "✅ Email con PDF inviata con successo");

    res.status(200).json({
      success: true,
      message: "PDF inviato con successo",
      email,
    });
  } catch (err) {
    logger.error({ err, email }, "❌ Errore durante l'invio dell'email");
    res.status(500).json({
      error: "Impossibile inviare l'email. Controlla la connessione e riprova.",
    });
  }
});

export default router;
