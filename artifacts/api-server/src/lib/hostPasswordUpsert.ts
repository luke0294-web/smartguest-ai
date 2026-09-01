import { supabaseAdmin } from "./supabase";

export type UpsertHostPasswordResult =
  | { ok: true }
  | { ok: false; error: unknown; op: "update" | "insert" };

/**
 * `hosts` rows are keyed by email, not by property — a host managing multiple
 * properties shares one row. Update it if present, otherwise create it.
 */
export async function upsertHostPassword(
  email: string,
  hashedPassword: string,
): Promise<UpsertHostPasswordResult> {
  const { data: existingHost } = await supabaseAdmin
    .from("hosts")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (existingHost) {
    const { error } = await supabaseAdmin
      .from("hosts")
      .update({ host_password: hashedPassword })
      .eq("email", email);
    if (error) return { ok: false, error, op: "update" };
  } else {
    const { error } = await supabaseAdmin
      .from("hosts")
      .insert({ email, host_password: hashedPassword });
    if (error) return { ok: false, error, op: "insert" };
  }

  return { ok: true };
}
