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
 * Rileva se la risposta è quella di "fallimento sicuro" (host needs to respond)
 */
export function isHostFallbackResponse(reply: string): boolean {
  const marker = "non ho istruzioni specifiche per questo nel manuale";
  return reply.toLowerCase().includes(marker);
}
