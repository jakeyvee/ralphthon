// GET /api/calls/latest
//
// VOL-155: lightweight helper for the AuditPanel polling fallback. Returns
// the most-recently-created call id (or null if there are none yet) so the
// client can hydrate the audit bundle without needing Realtime to fire.
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, callId: null }, { status: 200 });
  }
  const { data } = await supabase
    .from("calls")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return NextResponse.json({ ok: true, callId: data?.id ?? null });
}
