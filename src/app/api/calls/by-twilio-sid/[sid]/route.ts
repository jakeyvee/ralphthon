// GET /api/calls/by-twilio-sid/[sid]
//
// Helper for the ElevenLabs webhook and other inbound integrations that only
// know Twilio's CallSid — they can resolve the internal call_id without
// needing Supabase credentials of their own.
//
// Next.js 16 — params is async, must be awaited.
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sid: string }> },
) {
  try {
    const params = await context.params;
    const sid = (params.sid ?? "").trim();
    if (!sid) {
      return NextResponse.json(
        { ok: false, error: "Missing Twilio call SID" },
        { status: 400 },
      );
    }

    const supabase = getServerSupabase();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Supabase not configured", ignored: true },
        { status: 503 },
      );
    }

    const { data, error } = await supabase
      .from("calls")
      .select("id")
      .eq("twilio_call_sid", sid)
      .maybeSingle<{ id: string }>();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Call not found for Twilio SID" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, callId: data.id }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
