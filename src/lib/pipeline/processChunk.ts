// Trigger event pipeline — single entrypoint for ingesting one transcript chunk.
//
// Both the simulator (VOL-143) and the real voice path (VOL-147) feed chunks
// through here, so the persistence story stays in one place.
//
// Soft-error policy: each DB call is wrapped in try/catch so a single failure
// (e.g. Supabase outage on one insert) cannot crash the upstream stream.
// Failures surface as strings in the returned `errors` array.
import "server-only";
import {
  appendChunk,
  listRules,
  recordDelivery,
  recordEvaluation,
  recordTriggerEvent,
} from "@/lib/db/repo";
import { scanChunk } from "@/lib/scanner/scanner";
import { nowSgtISO } from "@/lib/sgt";
import type {
  ChunkSpeaker,
  DeliveryChannel,
  RuleEvaluation,
  TranscriptChunk,
  TriggerEvent,
} from "@/lib/types";

const CONTEXT_EXCERPT_MAX = 240;
const DELIVERY_CHANNELS: DeliveryChannel[] = ["telegram", "sms"];

export interface ProcessChunkInput {
  callId: string;
  source: ChunkSpeaker;
  text: string;
  sequence: number;
}

export interface PipelineDeliveryStub {
  id: string;
  trigger_event_id: string;
  channel: DeliveryChannel;
  status: "pending";
}

export interface ProcessChunkResult {
  chunkId: string;
  evaluations: RuleEvaluation[];
  triggerEvents: TriggerEvent[];
  deliveries: PipelineDeliveryStub[];
  errors: string[];
}

function clipContext(text: string): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= CONTEXT_EXCERPT_MAX) return trimmed;
  return `${trimmed.slice(0, CONTEXT_EXCERPT_MAX - 1).trimEnd()}…`;
}

function softError(errors: string[], scope: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  errors.push(`${scope}: ${msg}`);
}

export async function processIncomingChunk(
  input: ProcessChunkInput,
): Promise<ProcessChunkResult> {
  const result: ProcessChunkResult = {
    chunkId: "",
    evaluations: [],
    triggerEvents: [],
    deliveries: [],
    errors: [],
  };

  const timestamp = nowSgtISO();

  // 1. Persist the chunk.
  try {
    const persisted = await appendChunk({
      call_id: input.callId,
      source: input.source,
      text: input.text,
      sequence: input.sequence,
      timestamp_sgt: timestamp,
    });
    result.chunkId = persisted.id;
  } catch (err) {
    softError(result.errors, "appendChunk", err);
    // If we have no chunk_id we cannot store evaluations / events; bail.
    return result;
  }

  if (!result.chunkId) {
    result.errors.push(
      "appendChunk: returned empty id (likely missing Supabase config)",
    );
    return result;
  }

  // 2. Load active rules. A failure here means we cannot scan — return early
  // but keep the chunk_id so the caller knows it was persisted.
  let rules;
  try {
    rules = await listRules();
  } catch (err) {
    softError(result.errors, "listRules", err);
    return result;
  }

  // 3. Run the scanner on the new chunk.
  const chunk: TranscriptChunk = {
    id: result.chunkId,
    call_id: input.callId,
    source: input.source,
    text: input.text,
    sequence: input.sequence,
    timestamp_sgt: timestamp,
  };
  let evaluations: RuleEvaluation[];
  try {
    evaluations = scanChunk(chunk, rules);
  } catch (err) {
    softError(result.errors, "scanChunk", err);
    return result;
  }
  result.evaluations = evaluations;

  // 4. Persist evaluations (don't let one failure block the others).
  await Promise.all(
    evaluations.map(async (ev) => {
      try {
        await recordEvaluation({
          chunk_id: chunk.id,
          rule_id: ev.rule_id,
          matched: ev.matched,
          matched_text: ev.matched_text ?? null,
        });
      } catch (err) {
        softError(result.errors, `recordEvaluation:${ev.rule_id}`, err);
      }
    }),
  );

  // 5. For each matched evaluation, record a trigger event.
  const contextExcerpt = clipContext(input.text);
  for (const ev of evaluations) {
    if (!ev.matched) continue;
    const matchedText = ev.matched_text ?? "";
    const rule = rules.find((r) => r.id === ev.rule_id);
    const recommendedAction =
      rule?.recommended_action ?? "Review with caregiver.";

    let eventId = "";
    try {
      const persisted = await recordTriggerEvent({
        call_id: input.callId,
        chunk_id: chunk.id,
        rule_id: ev.rule_id,
        rule_name: ev.rule_name,
        matched_text: matchedText,
        context_excerpt: contextExcerpt,
        recommended_action: recommendedAction,
        timestamp_sgt: nowSgtISO(),
      });
      eventId = persisted.id;
    } catch (err) {
      softError(result.errors, `recordTriggerEvent:${ev.rule_id}`, err);
      continue;
    }

    if (!eventId) {
      result.errors.push(
        `recordTriggerEvent:${ev.rule_id}: returned empty id (likely missing Supabase config)`,
      );
      continue;
    }

    const triggerEvent: TriggerEvent = {
      id: eventId,
      call_id: input.callId,
      chunk_id: chunk.id,
      rule_id: ev.rule_id,
      rule_name: ev.rule_name,
      matched_text: matchedText,
      context_excerpt: contextExcerpt,
      recommended_action: recommendedAction,
      timestamp_sgt: nowSgtISO(),
    };
    result.triggerEvents.push(triggerEvent);

    // 6. Enqueue pending delivery placeholders for each channel.
    for (const channel of DELIVERY_CHANNELS) {
      try {
        const persisted = await recordDelivery({
          trigger_event_id: eventId,
          channel,
          status: "pending",
          error: null,
          payload: null,
        });
        if (persisted.id) {
          result.deliveries.push({
            id: persisted.id,
            trigger_event_id: eventId,
            channel,
            status: "pending",
          });
        } else {
          result.errors.push(
            `recordDelivery:${channel}: returned empty id (likely missing Supabase config)`,
          );
        }
      } catch (err) {
        softError(result.errors, `recordDelivery:${channel}`, err);
      }
    }
  }

  return result;
}
