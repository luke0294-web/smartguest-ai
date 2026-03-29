import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface SendPdfBody {
  email?: string;
  propertyName?: string;
  qrDataUrl?: string;
}

/**
 * POST /api/send-pdf
 * 
 * Endpoint per inviare il Cartello Benvenuto (PDF con QR) via email all'host.
 * 
 * Attualmente: SIMULAZIONE (console.log + ritardo 1.5s)
 * 
 * Per integrare Resend, SendGrid, o altro servizio email:
 * 1. Installa la libreria: `pnpm add resend` o simile
 * 2. Configura API key in .env: `EMAIL_API_KEY=...`
 * 3. Sostituisci la sezione "// TODO: Integrazione Email Reale" con il codice del provider
 * 4. Ricorda di generare il PDF lato backend se necessario (vedi commenti)
 * 
 * Esempio per Resend:
 * ```
 * import { Resend } from "resend";
 * const resend = new Resend(process.env.RESEND_API_KEY);
 * await resend.emails.send({
 *   from: "cartello@smartguest.ai",
 *   to: email,
 *   subject: "Il tuo Cartello Benvenuto SmartGuest AI",
 *   html: `<p>Allegato: Cartello_Benvenuto_SmartGuest.pdf</p>`,
 *   attachments: [{ filename: "Cartello_Benvenuto_SmartGuest.pdf", content: pdfBuffer }]
 * });
 * ```
 */
router.post("/send-pdf", async (req: Request<{}, {}, SendPdfBody>, res: Response): Promise<void> => {
  const { email, propertyName, qrDataUrl } = req.body;

  if (!email?.trim()) {
    res.status(400).json({ error: "Email obbligatoria." });
    return;
  }

  if (!propertyName?.trim()) {
    res.status(400).json({ error: "Nome proprietà obbligatorio." });
    return;
  }

  try {
    logger.info(
      { email, propertyName, hasQrData: !!qrDataUrl },
      "📧 Richiesta invio PDF ricevuta",
    );

    // ────────────────────────────────────────────────────────────────────────────────
    // 🔴 SIMULAZIONE: Ritardo di 1.5s per simulare l'invio
    // ────────────────────────────────────────────────────────────────────────────────
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // ────────────────────────────────────────────────────────────────────────────────
    // TODO: Integrazione Email Reale
    // ────────────────────────────────────────────────────────────────────────────────
    // 1. Genera il PDF lato backend (consigliato) usando jsPDF:
    //    - Copia la logica di handleDownload dal frontend
    //    - Restituisci un Buffer del PDF
    //
    // 2. Converti qrDataUrl in un buffer se lo ricevi dal frontend
    //    - const pdfBuffer = Buffer.from(qrDataUrl, 'base64');
    //
    // 3. Invia via Resend/SendGrid/Nodemailer:
    //    - await resend.emails.send({ ... attachments: [{ ... }] })
    //    - oppure richiama la API del provider scelto
    //
    // 4. Gestisci errori e log appropriatamente

    console.log(
      `\n📧 [SIMULATION] Email inviata a ${email} per ${propertyName}`,
    );
    console.log(`   - QR Data URL ricevuto: ${qrDataUrl ? "Sì" : "No"}`);
    console.log(
      `   - (In produzione: allegare PDF "Cartello_Benvenuto_SmartGuest.pdf")\n`,
    );

    logger.info(
      { email, propertyName },
      "✅ Invio PDF simulato con successo",
    );

    res.status(200).json({
      success: true,
      message: "PDF inviato con successo (simulazione)",
      email,
    });
  } catch (err) {
    logger.error({ err, email }, "❌ Errore durante l'invio del PDF");
    res.status(500).json({ error: "Errore durante l'invio del PDF." });
  }
});

export default router;
