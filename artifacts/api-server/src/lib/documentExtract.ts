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

export async function extractDocxText(buf: Buffer): Promise<string> {
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
