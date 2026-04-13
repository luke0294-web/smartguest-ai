import QRCode from "qrcode";

export async function generateGuestQrDataUrl(slug: string): Promise<string> {
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl) {
    throw new Error("FRONTEND_URL mancante: impossibile generare il QR code.");
  }

  const base = frontendUrl.replace(/\/$/, "");
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error("FRONTEND_URL non è un URL valido.");
  }
  if (process.env.NODE_ENV === "production" && u.protocol !== "https:") {
    throw new Error("FRONTEND_URL deve usare https in produzione per generare il QR.");
  }

  const guestUrl = `${base}/guest/${slug}`;

  return QRCode.toDataURL(guestUrl, {
    type: "image/png",
    errorCorrectionLevel: "M",
    width: 300,
    margin: 2,
  });
}
