// Lightweight Supabase health probe used by status endpoints / UI.
import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

export async function pingDb(): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return { ok: false, error: "Supabase not configured" };
  }
  try {
    const { error } = await supabase.from("rules").select("id").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: message };
  }
}
