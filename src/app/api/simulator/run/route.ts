// POST /api/simulator/run
//
// Drives the demo / fallback transcript through the same persistence path
// as a real call. Tries to hand each chunk off to the VOL-144 pipeline
// endpoint (/api/calls/[id]/chunks) and falls back to running the scanner
// + repo writes inline if that endpoint isn't merged yet.

import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  appendChunk,
  createCall,
  listRules,
  recordEvaluation,
  recordTriggerEvent,
  updateCallStatus,
} from "@/lib/db/repo";
import { scanChunk } from "@/lib/scanner/scanner";
import { nowSgtISO } from "@/lib/sgt";
import { SCRIPTED_CHUNKS } from "@/lib/simulator/scriptedChunks";
import type { TranscriptChunk, TriggerRule } from "@/lib/types";

// Force the Node runtime so we can use setTimeout-based pacing and direct
// Supabase access. Avoids edge-runtime quirks.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildContextExcerpt(text: string, matched: string): string {
  const idx = text.toLowerCase().indexOf(matched.toLowerCase());
  if (idx < 0) return text;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + matched.length + 40);
  const slice = text.slice(start, end).trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

async function runInlineFallback(
  callId: string,
  chunkRecord: TranscriptChunk,
  rules: TriggerRule[],
): Promise<void> {
  const evaluations = scanChunk(chunkRecord, rules);
  for (const evaluation of evaluations) {
    await recordEvaluation({
      chunk_id: chunkRecord.id,
      rule_id: evaluation.rule_id,
      matched: evaluation.matched,
      matched_text: evaluation.matched_text ?? null,
    });
    if (evaluation.matched) {
      const rule = rules.find((r) => r.id === evaluation.rule_id);
      const matchedText = evaluation.matched_text ?? "";
      await recordTriggerEvent({
        call_id: callId,
        chunk_id: chunkRecord.id,
        rule_id: evaluation.rule_id,
        rule_name: rule?.name ?? evaluation.rule_name,
        matched_text: matchedText,
        context_excerpt: buildContextExcerpt(chunkRecord.text, matchedText),
        recommended_action:
          rule?.recommended_action ?? "Review the matched trigger.",
        timestamp_sgt: nowSgtISO(),
      });
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Create the call up-front so the UI can subscribe via Realtime.
  const { id: callId } = await createCall({
    source: "simulator",
    status: "in_progress",
  });

  if (!callId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not create call row — Supabase is likely not configured. Check NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  // Cache rules once — even in the inline fallback we want a single
  // authoritative snapshot for the run.
  const rules = await listRules();

  // Decide pipeline base URL. Prefer the explicit public URL; fall back to
  // the incoming request's origin so dev/preview deployments Just Work.
  const baseUrl = env.publicAppUrl ?? request.nextUrl.origin;
  const pipelineUrl = (id: string) => `${baseUrl}/api/calls/${id}/chunks`;

  let pipelineAvailable = true;
  let chunkCount = 0;

  try {
    for (let i = 0; i < SCRIPTED_CHUNKS.length; i++) {
      const scripted = SCRIPTED_CHUNKS[i];
      await sleep(scripted.delayMs);

      let pipelineHandled = false;

      if (pipelineAvailable) {
        try {
          const res = await fetch(pipelineUrl(callId), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: scripted.source,
              text: scripted.text,
              sequence: i,
            }),
            // Keep the fetch tight — if the pipeline hangs we still want
            // the simulator to finish quickly during a demo.
            cache: "no-store",
          });
          if (res.status === 404) {
            // VOL-144 not merged yet — fall back inline for the rest of the run.
            pipelineAvailable = false;
          } else if (!res.ok) {
            // Pipeline exists but errored on this chunk — surface to inline path
            // so we still persist the chunk + evaluations.
            pipelineAvailable = false;
          } else {
            pipelineHandled = true;
          }
        } catch {
          // Network / dev-server hiccup — fall back inline.
          pipelineAvailable = false;
        }
      }

      if (!pipelineHandled) {
        const inserted = await appendChunk({
          call_id: callId,
          source: scripted.source,
          text: scripted.text,
          sequence: i,
          timestamp_sgt: nowSgtISO(),
        });
        if (inserted.id) {
          const chunkRecord: TranscriptChunk = {
            id: inserted.id,
            call_id: callId,
            source: scripted.source,
            text: scripted.text,
            sequence: i,
            timestamp_sgt: nowSgtISO(),
          };
          await runInlineFallback(callId, chunkRecord, rules);
        }
      }

      chunkCount++;
    }

    await updateCallStatus(callId, "completed", nowSgtISO());

    return NextResponse.json({ ok: true, callId, chunkCount });
  } catch (err) {
    // Best-effort: mark the call failed so the UI doesn't show it as in-progress forever.
    try {
      await updateCallStatus(callId, "failed", nowSgtISO());
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, callId, chunkCount, error: message },
      { status: 500 },
    );
  }
}
