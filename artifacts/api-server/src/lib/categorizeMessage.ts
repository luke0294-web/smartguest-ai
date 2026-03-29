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
 * Matching: scuse naturali + menzione di avvisare l'host + menzione WhatsApp
 */
export function isHostFallbackResponse(reply: string): boolean {
  const lower = reply.toLowerCase();
  
  // Pattern di fallimento — scuse + avviso host + WhatsApp button
  const fallbackPatterns = [
    // Italian
    "accidenti, mi cogli impreparato",
    "mi cogli impreparato",
    "mando subito un promemoria all'host",
    "aviso al anfitrión",
    "non ho questa informazione precisa",
    "avviso l'host",
    "avviso all'host",
    "aviso al host",
    
    // English
    "caught me unprepared",
    "alerting the host",
    "texting him directly",
    "whatsapp button",
    
    // Spanish
    "no tengo esa información a mano",
    "aviso al anfitrión",
    "botón whatsapp",
    
    // Generic
    "whatsapp",
    "pulsante whatsapp",
    "tasto whatsapp",
    "button whatsapp",
  ];
  
  // Se contiene una combinazione di: scusa + menzione host/avviso + WhatsApp
  const hasApology = lower.includes("accidenti") || 
                     lower.includes("scusami") || 
                     lower.includes("mi dispiace") ||
                     lower.includes("caught me") ||
                     lower.includes("unprepared") ||
                     lower.includes("no tengo");
  
  const hasHostMention = lower.includes("host") || 
                         lower.includes("anfitrión") || 
                         lower.includes("owner") ||
                         lower.includes("proprietario");
  
  const hasWhatsappMention = lower.includes("whatsapp") || 
                             lower.includes("tasto") ||
                             lower.includes("button") ||
                             lower.includes("pulsante");
  
  // Se ha l'apologia naturale + menzione host = fallimento sicuro
  if (hasApology && hasHostMention) {
    return true;
  }
  
  // O se hai apologia + WhatsApp button mention
  if (hasApology && hasWhatsappMention) {
    return true;
  }
  
  // Fallback: controlla i pattern esatti
  return fallbackPatterns.some(p => lower.includes(p));
}
