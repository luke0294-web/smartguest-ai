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

// IMPORTANT: We use English as the source language to prevent the AI from "leaking" Italian grammar.
// Local Italian labels are kept in brackets for guest clarity.
export const DEMO_MASTER_MANUAL = `[SOURCE OF TRUTH]: This manual is written in English for technical accuracy. 
ALWAYS provide your final response in the language specified in your system instructions.

Address: Via dei Condotti 123, Floor 2, Int. 5.
Host: Luca.

WELCOME TO "LA BELLEZZA DI ROMA" 🏛️

📶 CONNECTIONS & ENTERTAINMENT
Wi-Fi Name: Roma5G_HighSpeed
Password: Colosseo2026! (Note: "C" is capitalized, exclamation mark at the end).

Router: If the connection slows down, the router is in the small compartment above the entrance door. Just unplug and replug the black cable.

Smart TV: It's a 55" Samsung. It is already configured with Netflix and Disney+ on the "GUEST" profile. Please do not use your personal accounts.

🔑 ACCESS & HOUSE RULES
Check-in: From 3:00 PM (15:00). If you arrive early, you can leave your luggage in the common hallway.
Check-out: STRICTLY by 10:00 AM. The cleaning staff is very punctual and strict!

Keys: Upon check-out, leave both sets on the round marble table in the entrance. Close the door firmly by pulling it towards you (no need to lock with a key, but ensure it "clicks" shut).

Noise: This is a historic building and walls are thin. No loud music or shouting after 10:00 PM (22:00). Neighbors (especially Mrs. Maria downstairs) are very attentive.

🔎 WHERE TO FIND THINGS
Corkscrew & Bottle Opener: In the first kitchen drawer, under the induction hob, on the right.
Hairdryer: In the bottom drawer of the vanity unit in the main bathroom.
Iron & Ironing Board: Stored in the built-in wardrobe in the hallway, behind the long mirror.
Extra Blankets: In the trunk at the foot of the master bed.
Coffee Capsules: 10 capsules are in the glass jar next to the Nespresso. Extra stock is in the cabinet above the fridge.

🍳 APPLIANCES
Induction Hob: Works only with magnetic bottom pans (in the large drawer under the stove). To turn it on, hold the circular button for 3 seconds. If an "L" appears, it is child-locked: hold the key symbol button.
Air Conditioning: One remote per room. Please set it to 23°C in "Dry" mode (water drop symbol) for optimal comfort.

🗑️ TRASH RECYCLING (Rome AMA)
Bins are under the sink. Rome is very strict about recycling:
- YELLOW (GIALLO): Plastic and Metal (rinse the cans!).
- BLUE (BLU): Paper and Cardboard (flatten Amazon boxes!).
- BROWN (MARRONE): Organic waste.
- GREY (GRIGIO): Non-recyclable waste.
- GLASS (VETRO): Do NOT put glass in the bins under the sink. You must take it outside to the large GREEN (VERDE) container located 20 meters from the front door, around the corner to the right.

🍝 LUCA'S PERSONAL TIPS
Carbonara: "Trattoria Da Enzo al 29" (Trastevere). No reservations, go at 6:45 PM for the 7:30 PM shift.
Roman Breakfast: "Bar Roscioli". Order a coffee and a "Maritozzo con la panna".

🚨 EMERGENCIES
Power Trip: If the power goes out, the circuit breaker is behind the entrance door inside the wooden hatch. Flip up the largest black switch.
Pharmacy 24h: Farmacia Internazionale in Piazza di Spagna.
Host Contact: For urgent issues (leaks, lost keys), message me on WhatsApp. I respond almost immediately!`;
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
