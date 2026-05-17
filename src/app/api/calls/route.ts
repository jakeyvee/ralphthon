// POST /api/calls
//
// Creates a new call row in `queued` status. Used by the simulator (VOL-143)
// and the real voice path (VOL-147) to obtain a call_id before streaming
// chunks through /api/calls/[id]/chunks.
import { NextResponse } from "next/server";
import { startCall } from "@/lib/pipeline/createCall";
import type { CallSource } from "@/lib/types";

interface CreateCallBody {
  source?: CallSource;
}

const VALID_SOURCES: CallSource[] = ["real", "simulator"];

export async function POST(request: Request) {
  try {
    let body: CreateCallBody;
    try {
      body = (await request.json()) as CreateCallBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const source = body.source;
    if (!source || !VALID_SOURCES.includes(source)) {
      return NextResponse.json(
        { ok: false, error: "Invalid source — expected real|simulator" },
        { status: 400 },
      );
    }

    const call = await startCall({ source, status: "queued" });
    if (!call.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Could not create call (Supabase likely not configured)",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(call, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
