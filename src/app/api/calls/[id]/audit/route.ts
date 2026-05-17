// GET /api/calls/[id]/audit
//
// Returns the full persisted audit bundle for a single call.
// Next.js 16 — params is async, must be awaited.
import { NextResponse } from "next/server";
import { getCallAudit } from "@/lib/db/repo";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const callId = params.id;
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: "Missing call id" },
        { status: 400 },
      );
    }

    const audit = await getCallAudit(callId);
    if (!audit.call) {
      return NextResponse.json(
        { ok: false, error: "Call not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        call: audit.call,
        chunks: audit.chunks,
        evaluations: audit.evaluations,
        events: audit.events,
        deliveries: audit.deliveries,
        handoffs: audit.handoffs,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
