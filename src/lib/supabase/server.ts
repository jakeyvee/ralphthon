// Server-side Supabase client (service role when available, anon otherwise).
// Server-only — never import from Client Components.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let _serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (!env.supabase.url) return null;
  const key = env.supabase.serviceRoleKey ?? env.supabase.anonKey;
  if (!key) return null;
  if (_serverClient) return _serverClient;
  _serverClient = createClient(env.supabase.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serverClient;
}
