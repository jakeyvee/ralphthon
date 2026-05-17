// POST /api/twilio/status — Twilio status callback. Maps Twilio call states
// onto our internal CallStatus and updates the corresponding row.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateCallStatus } from "@/lib/db/repo";
import { nowSgtISO } from "@/lib/sgt";
import type { CallStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapStatus(twilioStatus: string): CallStatus | null {
  switch (twilioStatus) {
    case "queued":
    case "initiated":
      return "queued";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "answered":
      return "in_progress";
    case "completed":
      return "completed";
    case "failed":
    case "busy":
    case "no-answer":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  const callId = request.nextUrl.searchParams.get("callId");
  if (!callId) return new NextResponse(null, { status: 200 });

  let twilioStatus = "";
  try {
    const body = await request.formData();
    twilioStatus = String(body.get("CallStatus") ?? "").trim();
  } catch {
    twilioStatus = "";
  }

  const mapped = mapStatus(twilioStatus);
  if (mapped) {
    const endedAt =
      mapped === "completed" || mapped === "failed" ? nowSgtISO() : undefined;
    await updateCallStatus(callId, mapped, endedAt);
  }

  return new NextResponse(null, { status: 200 });
}
