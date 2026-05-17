// POST /api/calls/[id]/chunks
//
// Ingests a single transcript chunk for a call and runs it through the
// VOL-144 trigger pipeline. Next.js 16 — params is async, must be awaited.
import { NextResponse } from "next/server";
import { processIncomingChunk } from "@/lib/pipeline/processChunk";
import { dispatchPendingTelegram } from "@/lib/telegram/dispatcher";
import { dispatchPendingSms } from "@/lib/sms/dispatcher";
import type { ChunkSpeaker } from "@/lib/types";

interface ChunkPostBody {
  source?: ChunkSpeaker;
  text?: string;
  sequence?: number;
}

const VALID_SOURCES: ChunkSpeaker[] = ["elder", "agent", "system"];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let callId = "";
  try {
    const params = await context.params;
    callId = params.id;
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: "Missing call id" },
        { status: 400 },
      );
    }

    let body: ChunkPostBody;
    try {
      body = (await request.json()) as ChunkPostBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const source = body.source;
    if (!source || !VALID_SOURCES.includes(source)) {
      return NextResponse.json(
        { ok: false, error: "Invalid source — expected elder|agent|system" },
        { status: 400 },
      );
    }
    if (typeof body.text !== "string" || body.text.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing text" },
        { status: 400 },
      );
    }
    if (typeof body.sequence !== "number" || !Number.isFinite(body.sequence)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid sequence" },
        { status: 400 },
      );
    }

    const result = await processIncomingChunk({
      callId,
      source,
      text: body.text,
      sequence: body.sequence,
    });

    // Drain pending Telegram + SMS deliveries this chunk produced.
    let telegram = { attempted: 0, sent: 0, failed: 0 };
    let sms = { attempted: 0, sent: 0, failed: 0, previewed: 0 };
    if (result.triggerEvents.length > 0) {
      [telegram, sms] = await Promise.all([
        dispatchPendingTelegram({ callId }).catch(() => telegram),
        dispatchPendingSms({ callId }).catch(() => sms),
      ]);
    }

    return NextResponse.json(
      { ok: true, ...result, deliveries: { telegram, sms } },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, callId },
      { status: 500 },
    );
  }
}
