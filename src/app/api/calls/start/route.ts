// POST /api/calls/start — kick off a real outbound Twilio call to the elder
// that bridges into the ElevenLabs voice agent when picked up.
//
// Contract (consumed by src/components/AuditPanel.tsx):
// - Missing creds → 200 with `{ ok: false, status: 'not_configured', missing, error }`
// - Missing elder phone → 200 with `{ ok: false, error }`
// - Twilio failure → 200 with `{ ok: false, error }`
// - Success → 200 with `{ ok: true, callId, twilioSid }`
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
  // Falls back to a relative path if NEXT_PUBLIC_APP_URL is not set;
  // Twilio requires an absolute URL, so missing base is fatal — caller
  // should treat that case as unconfigured. We surface the relative URL
  // for clearer error logging.
  const search = new URLSearchParams(params).toString();
  const root = (base ?? "").replace(/\/$/, "");
  return `${root}${path}${search ? `?${search}` : ""}`;
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

  if (!env.publicAppUrl || env.publicAppUrl.trim().length === 0) {
    return NextResponse.json({
      ok: false,
      status: "not_configured",
      missing: ["NEXT_PUBLIC_APP_URL"],
      error: "NEXT_PUBLIC_APP_URL must be set so Twilio can reach the voice/status webhooks.",
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

  const voiceUrl = buildCallbackUrl(env.publicAppUrl, "/api/twilio/voice", {
    callId,
    elderName: elder.elder_name ?? "",
    familyName: elder.family_name ?? "",
  });
  const statusCallbackUrl = buildCallbackUrl(
    env.publicAppUrl,
    "/api/twilio/status",
    { callId },
  );

  const sid = env.twilio.accountSid as string;
  const token = env.twilio.authToken as string;
  const fromNumber = env.twilio.fromNumber as string;

  const body = new URLSearchParams();
  body.set("From", fromNumber);
  body.set("To", elderPhone);
  body.set("Url", voiceUrl);
  body.set("StatusCallback", statusCallbackUrl);
  body.append("StatusCallbackEvent", "initiated");
  body.append("StatusCallbackEvent", "ringing");
  body.append("StatusCallbackEvent", "answered");
  body.append("StatusCallbackEvent", "completed");
  body.set("StatusCallbackMethod", "POST");

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`;

  let twilioRes: Response;
  try {
    twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (err) {
    await updateCallStatus(callId, "failed");
    return NextResponse.json({
      ok: false,
      callId,
      error: err instanceof Error ? err.message : "Twilio request failed",
    });
  }

  const rawText = await twilioRes.text();
  if (!twilioRes.ok) {
    await updateCallStatus(callId, "failed");
    return NextResponse.json({
      ok: false,
      callId,
      error: `Twilio ${twilioRes.status}: ${rawText.slice(0, 500)}`,
    });
  }

  let twilioSid: string | null = null;
  try {
    const parsed = JSON.parse(rawText) as { sid?: string };
    twilioSid = parsed.sid ?? null;
  } catch {
    twilioSid = null;
  }

  await updateCallStatus(callId, "ringing");

  return NextResponse.json({ ok: true, callId, twilioSid });
}
