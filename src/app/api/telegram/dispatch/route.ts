// POST /api/telegram/dispatch
//
// Drains pending Telegram delivery_attempts rows. Body may optionally include
// `{ callId }` to scope the drain to a single call (used by the live audit
// view; the demo control panel hits it un-scoped to flush everything queued
// during a simulator run).
import { NextResponse } from "next/server";
import { dispatchPendingTelegram } from "@/lib/telegram/dispatcher";

interface DispatchBody {
  callId?: string;
}

export async function POST(request: Request) {
  let body: DispatchBody = {};
  try {
    // Tolerate empty bodies — drain-all is a common case.
    const raw = await request.text();
    if (raw.trim().length > 0) {
      body = JSON.parse(raw) as DispatchBody;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const callId =
    typeof body.callId === "string" && body.callId.trim().length > 0
      ? body.callId.trim()
      : undefined;

  const result = await dispatchPendingTelegram({ callId });
  return NextResponse.json(result, { status: 200 });
}
