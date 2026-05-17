// POST /api/sms/test — send a one-off test SMS so the family can verify the
// Twilio creds and recipient list before any real alert fires.
//
// Body: { to?: string }. If `to` is omitted we pull the first recipient from
// elder_config. Returns a "not_configured" status when Twilio creds are absent
// rather than throwing.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getOrCreateElderConfig } from "@/lib/db/repo";
import { serviceStatus } from "@/lib/env";
import { nowSgtISO, formatSgt } from "@/lib/sgt";
import { sendTwilioSms } from "@/lib/sms/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestSmsBody {
  to?: string;
}

export async function POST(request: NextRequest) {
  let parsed: TestSmsBody = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") parsed = raw as TestSmsBody;
  } catch {
    parsed = {};
  }

  let to = typeof parsed.to === "string" ? parsed.to.trim() : "";
  if (!to) {
    const elder = await getOrCreateElderConfig().catch(() => null);
    const first = (elder?.sms_recipients ?? []).find(
      (r) => typeof r === "string" && r.trim().length > 0,
    );
    to = first ? first.trim() : "";
  }

  const message = `Nurse Joy SMS test at ${formatSgt(nowSgtISO())}.`;

  if (!serviceStatus().twilioSms.configured) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        message,
      },
      { status: 200 },
    );
  }

  if (!to) {
    return NextResponse.json(
      {
        ok: false,
        status: "no_recipient",
        message,
        error: "No `to` provided and no SMS recipients configured",
      },
      { status: 400 },
    );
  }

  const result = await sendTwilioSms({ to, body: message });
  return NextResponse.json(
    {
      ok: result.ok,
      status: result.ok ? "sent" : "failed",
      twilioSid: result.sid,
      httpStatus: result.status,
      error: result.error,
      message,
    },
    { status: 200 },
  );
}
