/** Righe `properties` come restituite da PostgREST (snake_case). */
export type PropertyRowSnake = {
  id: number;
  slug: string;
  name: string;
  content: string;
  whatsapp_number: string | null;
  host_password?: string | null;
  email: string | null;
  pending_questions_count: number;
  reset_token?: string | null;
  reset_requested_at?: string | null;
  created_at: string;
  updated_at: string;
};

function rowDate(v: string | null | undefined, fallbackMs: number): Date {
  if (v == null || v === "") return new Date(fallbackMs);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date(fallbackMs) : d;
}

export function propertyRowToCamel(
  r: PropertyRowSnake,
  fallbackMs = Date.now(),
): {
  id: number;
  slug: string;
  name: string;
  content: string;
  whatsappNumber: string | null;
  hostPassword: string | null;
  email: string | null;
  pendingQuestionsCount: number;
  resetToken: string | null;
  resetRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    content: r.content,
    whatsappNumber: r.whatsapp_number,
    hostPassword: r.host_password ?? null,
    email: r.email,
    pendingQuestionsCount: Number(r.pending_questions_count ?? 0),
    resetToken: r.reset_token ?? null,
    resetRequestedAt: r.reset_requested_at ? rowDate(r.reset_requested_at, fallbackMs) : null,
    createdAt: rowDate(r.created_at, fallbackMs),
    updatedAt: rowDate(r.updated_at, fallbackMs),
  };
}

export type ChatLogRowSnake = {
  id: number;
  property_slug: string;
  guest_message: string;
  marco_reply: string;
  created_at: string;
  resolved: boolean;
};

/** Formato atteso dal frontend (`diario.tsx`). */
export function chatLogRowToApi(r: ChatLogRowSnake) {
  return {
    id: r.id,
    propertySlug: r.property_slug,
    guestMessage: r.guest_message,
    marcoReply: r.marco_reply,
    createdAt: r.created_at,
    resolved: r.resolved,
  };
}
