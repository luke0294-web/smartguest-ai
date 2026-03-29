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
