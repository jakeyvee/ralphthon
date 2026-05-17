// POST /api/sms/dispatch — drain pending SMS deliveries. Returns aggregate
// counts so the caller can decide whether to surface a toast / refresh audit.
//
// Body: { callId?: string } — optional scope to a single call.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dispatchPendingSms } from "@/lib/sms/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DispatchBody {
  callId?: string;
}

export async function POST(request: NextRequest) {
  let parsed: DispatchBody = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") parsed = raw as DispatchBody;
  } catch {
    parsed = {};
  }

  const callId =
    typeof parsed.callId === "string" && parsed.callId.trim().length > 0
      ? parsed.callId.trim()
      : undefined;

  const result = await dispatchPendingSms({ callId });
  return NextResponse.json(result, { status: 200 });
}
