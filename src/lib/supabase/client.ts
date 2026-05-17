// Browser/anon Supabase client. Safe to import from Client Components.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let _client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!env.supabase.url || !env.supabase.anonKey) return null;
  if (_client) return _client;
  _client = createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { persistSession: false },
  });
  return _client;
}
