import QRCode from "qrcode";

export async function generateGuestQrDataUrl(slug: string): Promise<string> {
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl) {
    throw new Error("FRONTEND_URL mancante: impossibile generare il QR code.");
  }

  const guestUrl = `${frontendUrl.replace(/\/$/, "")}/guest/${slug}`;

  return QRCode.toDataURL(guestUrl, {
    type: "image/png",
    errorCorrectionLevel: "M",
    width: 300,
    margin: 2,
  });
}
