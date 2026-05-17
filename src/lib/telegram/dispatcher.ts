// Drains pending Telegram delivery_attempts rows created by the pipeline
// (src/lib/pipeline/processChunk.ts). For each pending row we:
//
//   1. Load the matching trigger_events row.
//   2. Format the alert message.
//   3. POST it to the Telegram Bot API.
//   4. Update the delivery row with status (sent|failed), error, and the
//      payload that was actually sent.
//
// VOL-149 owns repo.ts and does not yet expose helpers for listing or
// updating delivery_attempts, so this module talks to Supabase directly via
// getServerSupabase(). Never throws — returns counts so the caller (the
// dispatch route, or a future cron) can surface progress.
import "server-only";
import { env } from "@/lib/env";
import { nowSgtISO } from "@/lib/sgt";
import { getServerSupabase } from "@/lib/supabase/server";
import type { TriggerEvent } from "@/lib/types";
import {
  formatAlertMessage,
  sendTelegramMessage,
  type SendResult,
} from "@/lib/telegram/sender";

// Mirror the columns we read from delivery_attempts / trigger_events.
interface PendingDeliveryRow {
  id: string;
  trigger_event_id: string;
}

interface TriggerEventRow {
  id: string;
  call_id: string;
  chunk_id: string;
  rule_id: string | null;
  rule_name: string;
  matched_text: string;
  context_excerpt: string;
  recommended_action: string;
  timestamp_sgt: string;
}

export interface DispatchResult {
  attempted: number;
  sent: number;
  failed: number;
}

// Trim the payload we persist on the delivery row; the column is text so we
// avoid stuffing huge blobs in case a downstream rule produces a long excerpt.
const PAYLOAD_PERSIST_MAX = 4096;

function buildAuditUrl(callId: string): string | undefined {
  const base = env.publicAppUrl?.trim();
  if (!base) return undefined;
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/calls/${callId}`;
}

function mapTriggerEvent(row: TriggerEventRow): TriggerEvent {
  return {
    id: row.id,
    call_id: row.call_id,
    chunk_id: row.chunk_id,
    rule_id: row.rule_id ?? "",
    rule_name: row.rule_name,
    matched_text: row.matched_text,
    context_excerpt: row.context_excerpt,
    recommended_action: row.recommended_action,
    timestamp_sgt: row.timestamp_sgt,
  };
}

function truncatePayload(text: string): string {
  if (text.length <= PAYLOAD_PERSIST_MAX) return text;
  return `${text.slice(0, PAYLOAD_PERSIST_MAX - 1)}…`;
}

export async function dispatchPendingTelegram(
  opts: { callId?: string } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = { attempted: 0, sent: 0, failed: 0 };
  const supabase = getServerSupabase();
  if (!supabase) return result;

  // 1. Load pending Telegram delivery rows, optionally scoped to a call.
  //    When scoped we filter via the joined trigger_events.call_id.
  let pending: PendingDeliveryRow[] = [];
  try {
    if (opts.callId) {
      const { data, error } = await supabase
        .from("delivery_attempts")
        .select("id, trigger_event_id, trigger_events!inner(call_id)")
        .eq("channel", "telegram")
        .eq("status", "pending")
        .eq("trigger_events.call_id", opts.callId);
      if (error) return result;
      pending = ((data ?? []) as unknown as PendingDeliveryRow[]).map((r) => ({
        id: r.id,
        trigger_event_id: r.trigger_event_id,
      }));
    } else {
      const { data, error } = await supabase
        .from("delivery_attempts")
        .select("id, trigger_event_id")
        .eq("channel", "telegram")
        .eq("status", "pending");
      if (error) return result;
      pending = (data ?? []) as PendingDeliveryRow[];
    }
  } catch {
    return result;
  }

  result.attempted = pending.length;
  if (pending.length === 0) return result;

  // 2. If Telegram creds are missing, mark all pending rows failed in one pass.
  const credsMissing = !env.telegram.botToken || !env.telegram.chatId;
  if (credsMissing) {
    for (const row of pending) {
      try {
        await supabase
          .from("delivery_attempts")
          .update({
            status: "failed",
            error: "telegram_not_configured",
            timestamp_sgt: nowSgtISO(),
          })
          .eq("id", row.id);
        result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  // 3. Batch-load trigger_events for the pending rows so we don't make N+1
  //    round trips.
  const eventIds = Array.from(new Set(pending.map((p) => p.trigger_event_id)));
  let eventsById = new Map<string, TriggerEvent>();
  try {
    const { data, error } = await supabase
      .from("trigger_events")
      .select(
        "id, call_id, chunk_id, rule_id, rule_name, matched_text, context_excerpt, recommended_action, timestamp_sgt",
      )
      .in("id", eventIds);
    if (!error && data) {
      eventsById = new Map(
        (data as TriggerEventRow[]).map((row) => [row.id, mapTriggerEvent(row)]),
      );
    }
  } catch {
    // fall through; missing events become per-row failures below
  }

  // 4. Send each, then update the row with the outcome.
  for (const row of pending) {
    const event = eventsById.get(row.trigger_event_id);
    if (!event) {
      try {
        await supabase
          .from("delivery_attempts")
          .update({
            status: "failed",
            error: "trigger_event_not_found",
            timestamp_sgt: nowSgtISO(),
          })
          .eq("id", row.id);
      } catch {
        // swallow — we already count it as failed
      }
      result.failed += 1;
      continue;
    }

    const auditUrl = buildAuditUrl(event.call_id);
    const message = formatAlertMessage(event, { auditUrl });
    let sendRes: SendResult;
    try {
      sendRes = await sendTelegramMessage(message);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      sendRes = { ok: false, error: `dispatcher_unexpected: ${detail}` };
    }

    const update = {
      status: sendRes.ok ? "sent" : "failed",
      error: sendRes.ok ? null : sendRes.error ?? "telegram_send_failed",
      payload: truncatePayload(message),
      timestamp_sgt: nowSgtISO(),
    } as const;

    try {
      await supabase.from("delivery_attempts").update(update).eq("id", row.id);
    } catch {
      // even if the update failed, we still know the send outcome
    }

    if (sendRes.ok) {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}
