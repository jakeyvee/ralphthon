// POST /api/elevenlabs/webhook
//
// Receives ElevenLabs Conversational AI transcript events (user_transcript /
// agent_response). Normalises the payload, resolves the matching internal
// call_id, and forwards each transcript chunk into the canonical
// /api/calls/[id]/chunks pipeline so it flows through the scanner + trigger
// pipeline like any other source.
//
// The webhook is deliberately tolerant: any unrecognised, malformed, or
// uncallable payload returns HTTP 200 with `{ ok: ..., ignored: true }` so
// ElevenLabs does not retry-storm us.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  normalizeElevenLabsEvent,
  type NormalizedTranscriptEvent,
} from "@/lib/transcript/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResolvedCall {
  callId: string | null;
  reason?: string;
}

async function resolveCallId(
  callRef: NormalizedTranscriptEvent["callRef"],
): Promise<ResolvedCall> {
  if (callRef?.type === "callId") {
    return { callId: callRef.value };
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return { callId: null, reason: "supabase_not_configured" };
  }

  if (callRef?.type === "twilioSid") {
    const { data, error } = await supabase
      .from("calls")
      .select("id")
      .eq("twilio_call_sid", callRef.value)
      .maybeSingle<{ id: string }>();
    if (error || !data) {
      return { callId: null, reason: "call_not_found_for_twilio_sid" };
    }
    return { callId: data.id };
  }

  // Hackathon fallback: pick the most recent in-progress real call.
  // Order by started_at_sgt desc so we get the freshest active call.
  const { data, error } = await supabase
    .from("calls")
    .select("id")
    .eq("source", "real")
    .in("status", ["in_progress", "ringing", "queued"])
    .order("started_at_sgt", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error || !data) {
    return { callId: null, reason: "no_active_real_call" };
  }
  return { callId: data.id };
}

async function nextSequence(callId: string): Promise<number> {
  const supabase = getServerSupabase();
  if (!supabase) return 1;
  const { count } = await supabase
    .from("transcript_chunks")
    .select("id", { count: "exact", head: true })
    .eq("call_id", callId);
  return (count ?? 0) + 1;
}

function originFromRequest(request: NextRequest): string {
  const configured = env.publicAppUrl?.replace(/\/$/, "");
  if (configured) return configured;
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "invalid_json" },
      { status: 200 },
    );
  }

  let normalised: NormalizedTranscriptEvent | null;
  try {
    normalised = normalizeElevenLabsEvent(body);
  } catch {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "normalize_error" },
      { status: 200 },
    );
  }
  if (!normalised) {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "unrecognised_event" },
      { status: 200 },
    );
  }

  let resolved: ResolvedCall;
  try {
    resolved = await resolveCallId(normalised.callRef);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        ignored: true,
        reason: "resolve_failed",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 },
    );
  }

  if (!resolved.callId) {
    return NextResponse.json(
      {
        ok: false,
        ignored: true,
        reason: resolved.reason ?? "call_not_resolvable",
      },
      { status: 200 },
    );
  }

  let sequence = normalised.sequence;
  if (typeof sequence !== "number" || !Number.isFinite(sequence)) {
    try {
      sequence = await nextSequence(resolved.callId);
    } catch {
      sequence = 1;
    }
  }

  const origin = originFromRequest(request);
  const forwardUrl = `${origin}/api/calls/${encodeURIComponent(
    resolved.callId,
  )}/chunks`;

  let forwarded = 0;
  let pipelineError: string | undefined;
  try {
    const res = await fetch(forwardUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: normalised.source,
        text: normalised.text,
        sequence,
      }),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave parsed null
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "triggerEvents" in parsed &&
      Array.isArray((parsed as { triggerEvents: unknown }).triggerEvents)
    ) {
      forwarded = (
        (parsed as { triggerEvents: unknown[] }).triggerEvents
      ).length;
    }
    if (!res.ok) {
      pipelineError = `pipeline ${res.status}: ${text.slice(0, 240)}`;
    }
  } catch (err) {
    pipelineError = err instanceof Error ? err.message : String(err);
  }

  if (pipelineError) {
    return NextResponse.json(
      {
        ok: false,
        callId: resolved.callId,
        forwarded,
        error: pipelineError,
        ignored: true,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      callId: resolved.callId,
      forwarded,
      source: normalised.source,
      sequence,
    },
    { status: 200 },
  );
}
