import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";

/**
 * `chat_logs.property_slug` is plain text with no foreign key (see
 * supabase/chat_logs.sql), so the logs don't follow their property on their
 * own. Without these helpers, deleting or renaming a property left its guest
 * conversations behind under the old slug — and whoever got that slug next
 * saw them in their Diario.
 */

/** Rename: carry the Diario over to the property's new slug. */
export async function moveChatLogs(oldSlug: string, newSlug: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("chat_logs")
    .update({ property_slug: newSlug })
    .eq("property_slug", oldSlug);
  if (error) {
    logger.error({ err: error, oldSlug, newSlug }, "moveChatLogs — aggiornamento chat_logs fallito");
    return false;
  }
  return true;
}

/**
 * Delete every log stored under `slug`. Used when a property is deleted, and
 * before a NEW property takes a slug, so it never inherits leftovers.
 */
export async function deleteChatLogs(slug: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from("chat_logs").delete().eq("property_slug", slug);
  if (error) {
    logger.error({ err: error, slug }, "deleteChatLogs — eliminazione chat_logs fallita");
    return false;
  }
  return true;
}
