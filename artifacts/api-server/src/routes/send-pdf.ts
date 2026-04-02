import { Router, type IRouter, type Request, type Response } from "express";
import nodemailer from "nodemailer";
import { logger } from "../lib/logger";
import { requireCeoSession } from "../lib/ceo-session";

const router: IRouter = Router();

interface SendPdfBody {
  email?: string;
  propertyName?: string;
  pdfBase64?: string;
  chatLink?: string;
}

const smtpUser = process.env.EMAIL_USER?.trim();
const smtpPass = process.env.EMAIL_PASS?.trim();
const smtpPort = Number(process.env.EMAIL_SMTP_PORT ?? 465);

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST ?? "smtp.gmail.com",
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
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

  const fromName = process.env.EMAIL_FROM_NAME ?? "SmartGuest AI";
  const fromAddress = smtpUser ?? "hello.smartguest@gmail.com";

  const base64Data = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
  const normalizedPdf = base64Data.trim();
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(normalizedPdf)) {
    res.status(400).json({ error: "PDF non valido. Riprova." });
    return;
  }

  try {
    logger.info({ email, propertyName, pdfSize: normalizedPdf.length }, "📧 Invio email con PDF in corso...");

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: email.trim(),
      subject: "Il tuo Cartello QR SmartGuest AI è pronto! 🖨️",
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.5;">
          <h2 style="color: #1d4ed8;">Il tuo Cartello Digitale è pronto! 🖨️</h2>
          <p>Ciao,</p>
          <p>In allegato trovi il cartello da tavolo in formato PDF con il QR Code della tua struttura. Puoi stamparlo o inserirlo in una cornice.</p>
          <p>Inoltre, ecco il <strong>link diretto</strong> al tuo Assistente Virtuale. Puoi copiarlo e inviarlo ai tuoi ospiti via WhatsApp o Airbnb prima del loro arrivo:</p>
          <p style="background-color: #f3f4f6; padding: 10px; border-radius: 5px;">
            <a href="${chatLink ?? ""}" style="color: #2563eb; text-decoration: none;"><strong>${chatLink ?? ""}</strong></a>
          </p>
          <br>
          <p>Buon lavoro,<br><strong>Il team di SmartGuest AI</strong></p>
        </div>
      `,
      attachments: [
        {
          filename: `Cartello_QR_${propertyName.replace(/\s+/g, "_")}.pdf`,
          content: Buffer.from(normalizedPdf, "base64"),
          encoding: "base64",
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
  } catch (err: unknown) {
    console.error("[ERRORE CRITICO] send-pdf:", err);
    logger.error({ err, email }, "❌ Errore durante l'invio dell'email");
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "EAUTH"
    ) {
      res.status(500).json({
        error: "Servizio email non configurato correttamente. Controlla le credenziali SMTP.",
      });
      return;
    }
    res.status(500).json({
      error: "Errore durante l'invio dell'email. Riprova più tardi.",
    });
  }
});

export default router;
