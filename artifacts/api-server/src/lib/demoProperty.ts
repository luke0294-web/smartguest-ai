import { GetPropertyResponse } from "@workspace/api-zod";

export const DEMO_SLUG = "demo";

/** Dummy WA number so guest UI shows the button; not used for real chat in demo. */
export const DEMO_MOCK_WHATSAPP_NUMBER = "+390000000000";

/** Shape allineato a `GetPropertyResponse` / riga demo per la chat. */
export type DemoPropertyRow = {
  id: number;
  slug: string;
  name: string;
  content: string;
  whatsappNumber: string | null;
  hostPassword: null;
  email: null;
  pendingQuestionsCount: number;
  resetToken: null;
  resetRequestedAt: null;
  createdAt: Date;
  updatedAt: Date;
};

// IMPORTANT: The hardcoded demo content below is intentionally fictional/demo data. Do NOT use any real credentials or sensitive information.
export const DEMO_MASTER_MANUAL = `Indirizzo: Via dei Condotti 123, Piano 2, Interno 5.
Il tuo Host: Luca.

BENVENUTI A "LA BELLEZZA DI ROMA" 🏛️

📶 CONNESSIONI E INTRATTENIMENTO
Wi-Fi: Roma5G_HighSpeed

Password: Colosseo2026! (Attenzione: la "C" è maiuscola e il punto esclamativo è finale).

Router: Se la connessione dovesse rallentare, il router si trova nel piccolo vano sopra la porta d'ingresso. Basta staccare e riattaccare il cavo nero.

Smart TV: È una Samsung 55". È già configurata con Netflix e Disney+ sul profilo "GUEST". Vi preghiamo di non inserire i vostri account personali per evitare di dimenticarli loggati.

🔑 ACCESSO E REGOLE DELLA CASA
Check-in: Dalle 15:00. Se arrivate prima, potete lasciare i bagagli nel corridoio comune.

Check-out: TASSATIVAMENTE entro le 10:00. Le donne delle pulizie arrivano puntuali e sono molto rigide!

Chiavi: Al check-out lasciate entrambi i mazzi sul tavolo tondo di marmo all'ingresso. Chiudete bene la porta tirandola verso di voi (non serve mandata, ma assicuratevi che faccia "click").

Rumori: Il palazzo è storico e le mura sentono tutto. Niente musica alta o urla dopo le 22:00. I vicini (soprattutto la Signora Maria del piano di sotto) sono molto attenti.

🔎 DOVE TROVARE LE COSE (Piccola Caccia al Tesoro)
Cavatappi e Apribottiglie: Nel primo cassetto della cucina, sotto il piano a induzione, sulla destra.

Asciugacapelli: Si trova nel cassetto inferiore del mobile lavabo nel bagno principale. È un modello professionale da 2000W.

Ferro e Asse da stiro: Sono riposti nell'armadio a muro nel corridoio, dietro lo specchio lungo.

Coperte Extra: Se aveste freddo, ci sono due plaid di lana nel baule ai piedi del letto matrimoniale.

Capsule Caffè: Ne abbiamo lasciate 10 nel barattolo di vetro accanto alla Nespresso. Se finiscono, ne trovate una scorta nel pensile sopra il frigorifero.

Carta Igienica Extra: Ne trovate 4 rotoli nell'armadietto sotto il lavandino del bagno piccolo.

Kit di Cucito: Per piccoli rammendi, c'è una scatolina di latta nel primo cassetto del comodino sinistro.

🍳 ELETTRODOMESTICI E IMPIANTI
Piano Induzione: Funziona solo con le pentole dal fondo magnetico nero (nel cassettone sotto i fornelli). Per accenderlo, tenete premuto il tasto circolare per 3 secondi. Se appare una "L", vuol dire che è bloccato per i bambini: tenete premuto il tasto col simbolo della chiave.

Acqua Calda (Scaldabagno): È a gas ed è sempre acceso. Se l'acqua dovesse uscire fredda, controllate che la fiammella sia accesa nel vano in balcone. Non toccate i tasti del termostato, è già regolato a 45°C.

Aria Condizionata: C'è un telecomando per ogni stanza. Vi chiediamo di impostarla a 23°C in modalità "Dry" (il simbolo della goccia) per un comfort ottimale senza sprechi.

🗑️ RACCOLTA DIFFERENZIATA (Roma AMA)
I bidoni sono sotto il lavello. Roma è molto severa:

GIALLO: Plastica e Metallo (sciacquate le lattine!).

BLU: Carta e Cartone (schiacciate le scatole di Amazon!).

MARRONE: Umido (scarti organici).

GRIGIO: Indifferenziata.

Vetro: Non va nei bidoni sotto il lavello. Dovete portarlo fuori nel grande contenitore VERDE che si trova a 20 metri dal portone, girando l'angolo a destra.

🍝 CONSIGLI PERSONALI DI LUCA (Vivi Roma come un locale)
La Carbonara definitiva: "Trattoria Da Enzo al 29" (Trastevere). Non accettano prenotazioni, quindi andate alle 18:45 per il turno delle 19:30. Vale ogni minuto di attesa.

Pizza al Taglio: Per uno spuntino veloce, andate da "Alice Pizza" in Via delle Carrozze.

Colazione Romana: "Bar Roscioli". Ordinate un caffè e un maritozzo con la panna. Mangiatelo al bancone per sentirvi veri romani.

Cena Romantica: "Ad Hoc" (Via di Ripetta). Hanno una selezione di tartufi incredibile.

🚨 EMERGENZE
Salvalavita: Se salta la corrente perché avete acceso troppi elettrodomestici, il quadro elettrico è dietro la porta d'ingresso, dentro lo sportellino di legno. Alzate la levetta nera più grande.

Farmacia 24h: Farmacia Internazionale in Piazza di Spagna (5 minuti a piedi).

Contatto Host: Per problemi urgenti (perdite d'acqua, chiavi smarrite), scrivetemi su WhatsApp. Rispondo quasi subito!`;

/** Display name for the fictional demo listing (chat + GET /properties/demo). */
export const DEMO_PROPERTY_DISPLAY_NAME = "La Bellezza di Roma";

/** Same manual as chat; used for API GET demo and property row helpers. */
export const DEMO_PROPERTY_CONTENT = DEMO_MASTER_MANUAL;

export function parseDemoPropertyForGet() {
  const now = new Date();
  return GetPropertyResponse.parse({
    id: 0,
    slug: DEMO_SLUG,
    name: DEMO_PROPERTY_DISPLAY_NAME,
    content: DEMO_PROPERTY_CONTENT,
    whatsappNumber: DEMO_MOCK_WHATSAPP_NUMBER,
    pendingQuestionsCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function demoPropertyRowForChat(): DemoPropertyRow {
  const now = new Date();
  return {
    id: 0,
    slug: DEMO_SLUG,
    name: DEMO_PROPERTY_DISPLAY_NAME,
    content: DEMO_MASTER_MANUAL,
    whatsappNumber: DEMO_MOCK_WHATSAPP_NUMBER,
    hostPassword: null,
    email: null,
    pendingQuestionsCount: 0,
    resetToken: null,
    resetRequestedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Demo chat row: same rich manual for every city pill; cityId kept for API compatibility. */
export function demoPropertyRowForChatCity(_cityId?: string): DemoPropertyRow {
  return demoPropertyRowForChat();
}
