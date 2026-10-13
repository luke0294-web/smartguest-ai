import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { logger } from "./logger";

/** Below this length, treat extraction as failed — most likely a scanned/image-only PDF with no real text layer. */
const MIN_EXTRACTED_TEXT_LENGTH = 20;

/** Thrown for any extraction failure the route should report back to the host with a clear, user-facing message. */
export class DocumentExtractionError extends Error {}

export async function extractPdfText(buf: Buffer): Promise<string> {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    const text = result.pages
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
      throw new DocumentExtractionError(
        'Non è stato possibile estrarre testo da questo PDF (probabilmente è una scansione o una foto). Usa "Scansiona Foto" per i documenti stampati o fotografati.',
      );
    }
    return text;
  } catch (err) {
    if (err instanceof DocumentExtractionError) throw err;
    logger.warn({ err }, "extractPdfText failed");
    throw new DocumentExtractionError(
      "Non è stato possibile leggere questo PDF. Verifica che non sia danneggiato o protetto da password.",
    );
  } finally {
    await parser?.destroy();
  }
}

/** A real house manual .docx unpacks to a few MB at most. */
export const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 5000;

/**
 * Sum of the uncompressed sizes declared in a ZIP's central directory, or
 * null if the archive can't be read (or uses ZIP64, which no legitimate
 * house manual needs). mammoth/JSZip inflates `word/document.xml` fully in
 * memory, so a 15 MB "zip bomb" could otherwise expand to gigabytes and take
 * the whole server down. The declared sizes can lie, so this is a first,
 * cheap line of defence — not a complete one.
 */
export function zipDeclaredUncompressedSize(buf: Buffer): number | null {
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const minEocd = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || offset === 0xffffffff || entries > MAX_DOCX_ENTRIES) return null;

  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) return null;
    const uncompressed = buf.readUInt32LE(offset + 24);
    if (uncompressed === 0xffffffff) return null;
    total += uncompressed;
    offset += 46 + buf.readUInt16LE(offset + 28) + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
  }
  return total;
}

export async function extractDocxText(buf: Buffer): Promise<string> {
  const declared = zipDeclaredUncompressedSize(buf);
  if (declared === null || declared > MAX_DOCX_UNCOMPRESSED_BYTES) {
    throw new DocumentExtractionError(
      "Questo file Word è troppo grande o danneggiato. Prova a salvarlo di nuovo come .docx o a incollare il testo.",
    );
  }
  try {
    const result = await mammoth.extractRawText({ buffer: buf });
    const text = result.value.trim();

    if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
      throw new DocumentExtractionError("Il documento Word non contiene testo utilizzabile.");
    }
    return text;
  } catch (err) {
    if (err instanceof DocumentExtractionError) throw err;
    logger.warn({ err }, "extractDocxText failed");
    throw new DocumentExtractionError(
      "Non è stato possibile leggere questo file Word. Verifica che sia un file .docx valido.",
    );
  }
}
