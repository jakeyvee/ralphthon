// POST /api/calls/start — kick off a real outbound voice call to the elder.
//
// Preferred path (when ELEVENLABS_AGENT_PHONE_NUMBER_ID is set): asks
// ElevenLabs to place the call via their native Twilio integration. The
// Nurse Joy agent then handles the audio bidirectionally without us
// bridging Twilio↔ElevenLabs ourselves (which only works through a
// protocol-correct bridge, not direct ConversationRelay→ElevenLabs WS).
//
// Fallback path: direct Twilio Calls API → our TwiML at /api/twilio/voice
// → Polly + Gather opener (no AI conversation, but no error either).
//
// Contract (consumed by src/components/AuditPanel.tsx):
// - Missing creds → 200 with `{ ok: false, status: 'not_configured', missing, error }`
// - Missing elder phone → 200 with `{ ok: false, error }`
// - Provider failure → 200 with `{ ok: false, error }`
// - Success → 200 with `{ ok: true, callId, twilioSid? , conversationId? , via }`
import { NextResponse } from "next/server";
import { env, serviceStatus } from "@/lib/env";
import { createCall, getOrCreateElderConfig, updateCallStatus } from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildCallbackUrl(
  base: string | undefined,
  path: string,
  params: Record<string, string>,
): string {
  const search = new URLSearchParams(params).toString();
  const root = (base ?? "").replace(/\/$/, "");
  return `${root}${path}${search ? `?${search}` : ""}`;
}

async function placeViaElevenLabs(args: {
  callId: string;
  toNumber: string;
}): Promise<{ ok: boolean; conversationId?: string | null; error?: string }> {
  const apiKey = env.elevenlabs.apiKey as string;
  const agentId = env.elevenlabs.agentId as string;
  const agentPhoneNumberId = env.elevenlabs.agentPhoneNumberId as string;

  const body = {
    agent_id: agentId,
    agent_phone_number_id: agentPhoneNumberId,
    to_number: args.toNumber,
    // Pass our internal call_id through so the agent's webhook events can
    // be correlated back to the right row even before we persist a
    // conversation_id mapping.
    conversation_initiation_client_data: {
      dynamic_variables: {
        call_id: args.callId,
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "ElevenLabs request failed",
    };
  }

  const rawText = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `ElevenLabs ${res.status}: ${rawText.slice(0, 500)}`,
    };
  }

  let conversationId: string | null = null;
  try {
    const parsed = JSON.parse(rawText) as {
      conversation_id?: string;
      callSid?: string;
    };
    conversationId = parsed.conversation_id ?? null;
  } catch {
    conversationId = null;
  }
  return { ok: true, conversationId };
}

async function placeViaTwilioDirect(args: {
  callId: string;
  elderName: string;
  familyName: string;
  toNumber: string;
}): Promise<{ ok: boolean; twilioSid?: string | null; error?: string }> {
  if (!env.publicAppUrl || env.publicAppUrl.trim().length === 0) {
    return {
      ok: false,
      error: "NEXT_PUBLIC_APP_URL must be set so Twilio can reach the voice/status webhooks.",
    };
  }
  const sid = env.twilio.accountSid as string;
  const token = env.twilio.authToken as string;
  const fromNumber = env.twilio.fromNumber as string;

  const voiceUrl = buildCallbackUrl(env.publicAppUrl, "/api/twilio/voice", {
    callId: args.callId,
    elderName: args.elderName,
    familyName: args.familyName,
  });
  const statusCallbackUrl = buildCallbackUrl(
    env.publicAppUrl,
    "/api/twilio/status",
    { callId: args.callId },
  );

  const body = new URLSearchParams();
  body.set("From", fromNumber);
  body.set("To", args.toNumber);
  body.set("Url", voiceUrl);
  body.set("StatusCallback", statusCallbackUrl);
  body.append("StatusCallbackEvent", "initiated");
  body.append("StatusCallbackEvent", "ringing");
  body.append("StatusCallbackEvent", "answered");
  body.append("StatusCallbackEvent", "completed");
  body.set("StatusCallbackMethod", "POST");

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`;

  let res: Response;
  try {
    res = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Twilio request failed",
    };
  }

  const rawText = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `Twilio ${res.status}: ${rawText.slice(0, 500)}`,
    };
  }
  let twilioSid: string | null = null;
  try {
    const parsed = JSON.parse(rawText) as { sid?: string };
    twilioSid = parsed.sid ?? null;
  } catch {
    twilioSid = null;
  }
  return { ok: true, twilioSid };
}

export async function POST() {
  const status = serviceStatus();
  const missing: string[] = [];
  if (!status.twilioVoice.configured) missing.push("Twilio Voice");
  if (!status.elevenlabs.configured) missing.push("ElevenLabs");

  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      status: "not_configured",
      missing,
      error: `Missing configuration for: ${missing.join(", ")}`,
    });
  }

  const elder = await getOrCreateElderConfig();
  if (!elder) {
    return NextResponse.json({
      ok: false,
      error: "Elder config unavailable (Supabase not reachable).",
    });
  }

  const elderPhone = (elder.elder_phone ?? "").trim();
  if (!elderPhone) {
    return NextResponse.json({
      ok: false,
      error: "Elder phone not configured",
    });
  }

  const created = await createCall({ source: "real", status: "queued" });
  if (!created.id) {
    return NextResponse.json({
      ok: false,
      error: "Failed to create call row (Supabase not reachable).",
    });
  }
  const callId = created.id;

  // Prefer the ElevenLabs native Twilio integration when the agent's phone
  // number id is configured — this is the only path where Nurse Joy actually
  // talks to the elder. Without it we fall back to Twilio direct dial +
  // Polly fallback TwiML so the call doesn't error.
  if (env.elevenlabs.agentPhoneNumberId) {
    const el = await placeViaElevenLabs({
      callId,
      toNumber: elderPhone,
    });
    if (el.ok) {
      await updateCallStatus(callId, "ringing");
      return NextResponse.json({
        ok: true,
        callId,
        conversationId: el.conversationId,
        via: "elevenlabs",
      });
    }
    await updateCallStatus(callId, "failed");
    return NextResponse.json({
      ok: false,
      callId,
      via: "elevenlabs",
      error: el.error ?? "ElevenLabs outbound call failed",
    });
  }

  const tw = await placeViaTwilioDirect({
    callId,
    elderName: elder.elder_name ?? "",
    familyName: elder.family_name ?? "",
    toNumber: elderPhone,
  });
  if (tw.ok) {
    await updateCallStatus(callId, "ringing");
    return NextResponse.json({
      ok: true,
      callId,
      twilioSid: tw.twilioSid,
      via: "twilio-direct",
    });
  }
  await updateCallStatus(callId, "failed");
  return NextResponse.json({
    ok: false,
    callId,
    via: "twilio-direct",
    error: tw.error ?? "Twilio outbound call failed",
  });
}
