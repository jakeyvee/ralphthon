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
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  normalizeElevenLabsEvent,
  type NormalizedTranscriptEvent,
} from "@/lib/transcript/normalize";

// ElevenLabs signs webhooks with a Stripe-style header:
//   ElevenLabs-Signature: t=<unix_ts>,v0=<hex_sha256>
// where v0 = HMAC-SHA256(`${t}.${rawBody}`, secret).
// We verify when the secret is configured. On mismatch we LOG and still
// accept the payload (hackathon robustness) so a header-format quirk
// doesn't kill a live demo.
function verifyElevenLabsSignature(
  rawBody: string,
  headerValue: string | null,
  secret: string,
): { ok: boolean; reason: string } {
  if (!headerValue) return { ok: false, reason: "no_signature_header" };
  const parts = headerValue.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sigPart = parts.find((p) => /^v0?=/.test(p))?.split("=")[1];
  if (!tPart || !sigPart) return { ok: false, reason: "malformed_signature_header" };
  const mac = createHmac("sha256", secret);
  mac.update(`${tPart}.${rawBody}`);
  const expected = mac.digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(sigPart, "hex");
    if (a.length !== b.length) return { ok: false, reason: "signature_length_mismatch" };
    return timingSafeEqual(a, b)
      ? { ok: true, reason: "ok" }
      : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_compare_error" };
  }
}

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

function originFromRequest(_request: NextRequest): string {
  // Internal self-loopback to /api/calls/[id]/chunks must use localhost so
  // we don't round-trip back out through Cloudflare. The tunnel URL is only
  // for external traffic (ElevenLabs POSTing in, Telegram audit links).
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}

export async function POST(request: NextRequest) {
  // Read the raw body FIRST so HMAC is computed over the exact bytes sent.
  const rawBody = await request.text();

  // HMAC verification (logged-but-accepted on mismatch — see helper).
  const secret = env.elevenlabs.webhookSecret;
  if (secret) {
    const sigHeader =
      request.headers.get("elevenlabs-signature") ??
      request.headers.get("ElevenLabs-Signature");
    const verdict = verifyElevenLabsSignature(rawBody, sigHeader, secret);
    if (!verdict.ok) {
      console.warn(
        `[elevenlabs-webhook] signature check failed: ${verdict.reason} — accepting payload anyway for hackathon demo`,
      );
    } else {
      console.log("[elevenlabs-webhook] signature verified");
    }
  }

  // DEBUG: log the raw payload (full) so we can confirm event shape.
  console.log(
    "[elevenlabs-webhook] raw body length:",
    rawBody.length,
  );
  console.log("[elevenlabs-webhook] raw body (full):", rawBody);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "invalid_json" },
      { status: 200 },
    );
  }

  // ── post_call_transcription handler ──────────────────────────────────
  // ElevenLabs's default webhook is the end-of-call summary. It carries
  // the FULL conversation as `data.transcript[]`. We fan it out: forward
  // every turn through the same /api/calls/[id]/chunks pipeline as if it
  // had arrived live. The audit panel populates a few seconds after hang-up
  // and the family gets Telegram + SMS alerts for any rule that matched.
  if (
    body &&
    typeof body === "object" &&
    (body as { type?: string }).type === "post_call_transcription"
  ) {
    const data = (body as { data?: Record<string, unknown> }).data ?? {};
    console.log(
      "[elevenlabs-webhook] post_call data keys:",
      Object.keys(data ?? {}).join(","),
    );
    // Try several known field locations for the transcript array.
    const candidateLocations: unknown[] = [
      (data as { transcript?: unknown }).transcript,
      (data as { messages?: unknown }).messages,
      (data as { turns?: unknown }).turns,
      ((data as { conversation?: { transcript?: unknown } }).conversation ?? {})
        .transcript,
      ((data as { result?: { transcript?: unknown } }).result ?? {})
        .transcript,
    ];
    const pickedRaw = candidateLocations.find((c) => Array.isArray(c));
    const transcript = Array.isArray(pickedRaw)
      ? (pickedRaw as Array<Record<string, unknown>>)
      : [];
    console.log(
      "[elevenlabs-webhook] resolved transcript array length:",
      transcript.length,
    );
    if (transcript.length > 0) {
      console.log(
        "[elevenlabs-webhook] first turn keys:",
        Object.keys(transcript[0] ?? {}).join(","),
      );
      console.log(
        "[elevenlabs-webhook] first turn sample:",
        JSON.stringify(transcript[0]).slice(0, 400),
      );
    }

    // Resolve our internal call_id. Prefer the dynamic variable we passed
    // in the outbound call; fall back to the most recent active real call.
    const dyn =
      (
        (data as {
          conversation_initiation_client_data?: {
            dynamic_variables?: Record<string, unknown>;
          };
        }).conversation_initiation_client_data?.dynamic_variables ?? {}
      ) ?? {};
    const explicitCallId =
      typeof (dyn as { call_id?: unknown }).call_id === "string"
        ? ((dyn as { call_id: string }).call_id as string)
        : null;

    const resolved = explicitCallId
      ? { callId: explicitCallId }
      : await resolveCallId(undefined);

    if (!resolved.callId) {
      return NextResponse.json(
        { ok: false, ignored: true, reason: "no_active_real_call_for_post_call" },
        { status: 200 },
      );
    }

    const origin = originFromRequest(request);
    const forwardUrl = `${origin}/api/calls/${encodeURIComponent(
      resolved.callId,
    )}/chunks`;

    let forwardedChunks = 0;
    let firstError: string | undefined;
    let seq = await nextSequence(resolved.callId);

    for (const turn of transcript) {
      const role = String(
        (turn as { role?: unknown }).role ?? "",
      ).toLowerCase();
      const text = String(
        (turn as { message?: unknown; text?: unknown }).message ??
          (turn as { text?: unknown }).text ??
          "",
      ).trim();
      if (!text) continue;
      const source: "elder" | "agent" | "system" =
        role === "user" || role === "human"
          ? "elder"
          : role === "agent" || role === "assistant"
            ? "agent"
            : "system";

      try {
        const res = await fetch(forwardUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, text, sequence: seq }),
        });
        if (res.ok) {
          forwardedChunks++;
        } else if (!firstError) {
          firstError = `pipeline ${res.status}`;
        }
      } catch (err) {
        if (!firstError) {
          firstError = err instanceof Error ? err.message : String(err);
        }
      }
      seq++;
    }

    return NextResponse.json(
      {
        ok: !firstError,
        callId: resolved.callId,
        type: "post_call_transcription",
        forwardedChunks,
        totalTurns: transcript.length,
        error: firstError,
      },
      { status: 200 },
    );
  }
  // ─────────────────────────────────────────────────────────────────────

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
