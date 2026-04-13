/**
 * Normalizza il testo rimuovendo emoji, punteggiatura e spazi extra
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "") // Rimuovi emoji
    .replace(/[!?.,'";:\-()[\]{}]/g, "") // Rimuovi punteggiatura
    .replace(/\s+/g, " ") // Normalizza spazi
    .trim();
}

/**
 * Rileva se una risposta di Cico necessita attenzione (needs_attention: true)
 * Basato su: scuse, mancanza di informazioni, suggerimento di contattare l'host
 */
export function detectNeedsAttention(marcoReply: string): boolean {
  const normalized = normalizeText(marcoReply);

  // Array universale di "Negative Indicators" — radici del fallimento in multiple lingue
  const negativeIndicators = [
    // Scuse (radice universale)
    "sorry", "dispiace", "desolé", "désolé", "leid", "siento", "lo siento",
    "i apologize", "scusami", "scusa", "mi scusi", "entschuldigung", "excuse",

    // Mancanza di informazioni (radice universale)
    "don't have", "non ho", "no tengo", "dont have", "n'ai pas", "keine",
    "non ho questa", "no tengo esa", "nicht vorhanden", "not available",
    "not specified", "no information", "nessuna informazione",

    // Pattern di "non lo so"
    "don't know", "non lo so", "no sé", "no lo sé", "je ne sais pas",
    "weiß nicht", "non saprei", "no sabemos", "i don't know",

    // Pattern di fallimento specifico
    "non abbiamo", "we don't have", "no contamos", "we haven't",
    "unfortunately", "purtroppo", "desgraciadamente", "leider",

    // Suggerimenti di contattare (chiedi all'host)
    "ask the host", "contatta il proprietario", "contatta l'host", "preguntar al anfitrión",
    "preguntale al anfitrion", "ask the owner", "contacbar al owner", "contact host",
    "contact the host", "contact proprietario", "contact owner", "contact agenzia",
    "call the host", "call the owner", "chiama il proprietario", "whatsapp",
    "messaggio all'host", "mensaje al anfitrion", "message the host",
  ];

  // 1. Controlla se contiene Negative Indicators
  const hasNegativeIndicator = negativeIndicators.some(indicator =>
    normalized.includes(indicator)
  );

  if (hasNegativeIndicator) {
    return true;
  }

  // 2. Fallback: se è una risposta molto corta (< 60 caratteri) e inizia con scusa
  if (marcoReply.length < 60) {
    const apologyStarters = ["sorry", "mi dispiace", "dispiace", "scusa", "scusami"];
    if (apologyStarters.some(starter => normalized.startsWith(starter))) {
      return true;
    }
  }

  // 3. Pattern aggiuntivo: "I" + "sorry" (es: "I'm sorry, we...")
  if (normalized.includes("i") && normalized.includes("sorry")) {
    return true;
  }

  return false;
}
