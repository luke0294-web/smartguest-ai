/**
 * Categorizza il messaggio dell'ospite in: "tourism", "house", o "mixed"
 */
export function categorizeMessage(message: string): "tourism" | "house" | "mixed" {
  const lowerMsg = message.toLowerCase();

  // Pattern per Turismo e Cultura
  const tourismPatterns = [
    "ristorante", "restaurant", "restaurante",
    "monumento", "monument", "monumento",
    "storia", "history", "historia",
    "verona", "attractions", "cosa vedere",
    "cosa visitare", "tour", "sightseeing",
    "museo", "museum", "arte", "art",
    "chiesa", "church", "piazza", "square",
    "parco", "park", "zona", "area",
    "consiglio", "recommend", "recomendacion",
    "suggerisci", "suggest", "cosa fare",
  ];

  // Pattern per Gestione Casa
  const housePatterns = [
    "appartamento", "apartment", "apartamento",
    "wifi", "password", "chiave", "key", "puerta",
    "check-in", "check-out", "checkout", "checkin",
    "letto", "bed", "cama", "bagno", "bathroom",
    "cucina", "kitchen", "cocina", "doccia", "shower",
    "ascensore", "elevator", "ascensor",
    "parcheggio", "parking", "estacionamiento",
    "regole", "rules", "normas", "condizioni",
    "riscaldamento", "heating", "calefaccion",
    "aria condizionata", "ac", "aire acondicionado",
    "lavatrice", "washing machine", "lavadora",
    "televisione", "tv", "televisión",
    "frigorifero", "fridge", "refrigerador",
    "forno", "oven", "horno", "piano cottura",
    "portone", "gate", "puerta de entrada",
    "orario", "time", "ora", "quando",
    "strumenti", "tools", "utensili", "cosa c'è",
  ];

  const hasTourism = tourismPatterns.some(p => lowerMsg.includes(p));
  const hasHouse = housePatterns.some(p => lowerMsg.includes(p));

  if (hasTourism && !hasHouse) return "tourism";
  if (hasHouse && !hasTourism) return "house";
  return "mixed";
}

/**
 * Rileva se la risposta è quella di "allarme silenzioso" — host deve intervenire.
 * Marco usa SOLO la frase esatta: "Scusa, non ho questa info! Puoi chiedere direttamente all'host dal tasto WhatsApp qui sopra. 👆"
 */
export function isHostFallbackResponse(reply: string): boolean {
  const lower = reply.toLowerCase();
  // Rileva la frase canonica esatta (normalizzata) — marco non può variare questa frase
  if (lower.includes("non ho questa info") && lower.includes("tasto whatsapp")) {
    return true;
  }
  // Fallback legacy: vecchie risposte nel DB (accidenti, caught me, ecc.)
  const legacyPatterns = [
    "accidenti, mi cogli impreparato",
    "caught me unprepared",
    "no tengo esa información a mano",
    "mando subito un promemoria all'host",
  ];
  return legacyPatterns.some(p => lower.includes(p));
}

/**
 * Phrases that indicate the model could not answer from the manual and is deferring or
 * admitting uncertainty — use for pending-question increment. Intentionally excludes bare
 * "host" / "whatsapp" so polite closings after a factual answer do not match.
 */
const UNCERTAINTY_FALLBACK_PHRASES: string[] = [
  // English
  "i don't have this information",
  "i don't have that information",
  "i don't have information about",
  "don't have this information",
  "don't have that information",
  "no information about",
  "no information on",
  "not in the house manual",
  "not in the manual",
  "isn't in the manual",
  "is not in the manual",
  "i am not sure",
  "i'm not sure",
  "not sure i can",
  "i cannot find",
  "i can't find",
  "can't find this in",
  "cannot find this in",
  "unable to find",
  "unable to answer",
  "i cannot answer",
  "i don't know",
  "i dont know",
  "can't answer that",
  "not something i can",
  "please ask the host because",
  "you'll need to ask the host",
  "you will need to ask the host",
  "i wasn't able to find",
  "couldn't find anything in",
  "cannot fix this remotely",
  "can't fix this remotely",
  "contact the host for this",
  // Italian
  "non ho questa informazione",
  "non ho informazioni su",
  "non ho informazioni a",
  "non c'è nel manuale",
  "non è nel manuale",
  "non sono sicuro",
  "non sono sicura",
  "non posso rispondere",
  "non posso aiutarti con",
  "non lo so",
  "non so se",
  "non ho questa info",
  "non posso risolvere da remoto",
  // German
  "diese information habe ich nicht",
  "habe ich keine information",
  "nicht im hausmanual",
  "bin ich mir nicht sicher",
  "kann ich nicht beantworten",
  // French
  "je n'ai pas cette information",
  "pas d'information sur",
  "pas dans le manuel",
  "je ne suis pas sûr",
  "je ne suis pas sure",
  "impossible de répondre",
  // Spanish
  "no tengo esa información",
  "no tengo informacion sobre",
  "no está en el manual",
  "no estoy seguro",
  "no estoy segura",
];

/**
 * True when the reply indicates host follow-up because the AI lacked an answer — used for
 * `pending_questions_count` and `resolved`. Aligns with refresh-all.
 */
export function shouldIncrementPendingQuestions(reply: string): boolean {
  if (isHostFallbackResponse(reply)) return true;
  const lower = reply.toLowerCase();
  return UNCERTAINTY_FALLBACK_PHRASES.some((phrase) => lower.includes(phrase));
}
