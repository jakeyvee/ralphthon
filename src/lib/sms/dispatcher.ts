// SMS dispatcher — drains pending delivery_attempts rows on the `sms` channel,
// either by sending them through Twilio (when creds + recipients exist) or by
// marking them `preview` so the audit trail still shows what would have gone out.
//
// Owned by VOL-146. Queries Supabase directly because repo.ts has no
// updateDelivery helper (per ticket constraints — same as VOL-145).
import "server-only";
import { getOrCreateElderConfig } from "@/lib/db/repo";
import { getServerSupabase } from "@/lib/supabase/server";
import { serviceStatus } from "@/lib/env";
import type { TriggerEvent } from "@/lib/types";
import { formatSmsMessage, sendTwilioSms } from "@/lib/sms/sender";

export interface DispatchSmsOptions {
  callId?: string;
}

export interface DispatchSmsResult {
  attempted: number;
  sent: number;
  failed: number;
  previewed: number;
}

interface PendingDeliveryRow {
  id: string;
  trigger_event_id: string;
  channel: "sms";
  status: "pending";
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

function rowToTriggerEvent(row: TriggerEventRow): TriggerEvent {
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

/**
 * Drain pending SMS deliveries.
 *
 * - No recipients OR creds missing -> mark all pending rows as `preview`.
 * - Otherwise fan-out one Twilio POST per recipient per delivery; the row is
 *   marked `sent` only if every recipient succeeded, `failed` otherwise.
 *
 * Never throws — all failures surface in the per-row `error` field and in the
 * aggregate counts.
 */
export async function dispatchPendingSms(
  opts: DispatchSmsOptions = {},
): Promise<DispatchSmsResult> {
  const result: DispatchSmsResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    previewed: 0,
  };

  const supabase = getServerSupabase();
  if (!supabase) return result;

  // 1. Load pending SMS deliveries (optionally scoped to a single call).
  let pending: PendingDeliveryRow[] = [];
  try {
    let pendingIds: string[] | null = null;
    if (opts.callId) {
      const eventsQ = await supabase
        .from("trigger_events")
        .select("id")
        .eq("call_id", opts.callId);
      if (eventsQ.error) return result;
      pendingIds = ((eventsQ.data ?? []) as Array<{ id: string }>).map(
        (r) => r.id,
      );
      if (pendingIds.length === 0) return result;
    }

    let query = supabase
      .from("delivery_attempts")
      .select("id, trigger_event_id, channel, status")
      .eq("channel", "sms")
      .eq("status", "pending");
    if (pendingIds) query = query.in("trigger_event_id", pendingIds);

    const { data, error } = await query;
    if (error) return result;
    pending = (data ?? []) as PendingDeliveryRow[];
  } catch {
    return result;
  }

  if (pending.length === 0) return result;
  result.attempted = pending.length;

  // 2. Hydrate the trigger events referenced by those deliveries so we can
  // format the SMS body.
  const eventIds = Array.from(new Set(pending.map((d) => d.trigger_event_id)));
  const events = new Map<string, TriggerEvent>();
  try {
    const { data, error } = await supabase
      .from("trigger_events")
      .select(
        "id, call_id, chunk_id, rule_id, rule_name, matched_text, context_excerpt, recommended_action, timestamp_sgt",
      )
      .in("id", eventIds);
    if (!error && data) {
      for (const row of data as TriggerEventRow[]) {
        events.set(row.id, rowToTriggerEvent(row));
      }
    }
  } catch {
    // Continue — rows we can't hydrate will be marked failed below.
  }

  // 3. Decide preview vs send.
  const elder = await getOrCreateElderConfig().catch(() => null);
  const recipients = (elder?.sms_recipients ?? [])
    .map((r) => (typeof r === "string" ? r.trim() : ""))
    .filter((r) => r.length > 0);
  const credsOk = serviceStatus().twilioSms.configured;
  const previewMode = !credsOk || recipients.length === 0;

  // 4. Update each pending row.
  for (const delivery of pending) {
    const event = events.get(delivery.trigger_event_id);
    const body = event ? formatSmsMessage(event) : "";

    if (previewMode) {
      await updateDelivery(supabase, delivery.id, {
        status: "preview",
        payload: body || null,
        error: null,
      });
      result.previewed += 1;
      continue;
    }

    if (!event || !body) {
      await updateDelivery(supabase, delivery.id, {
        status: "failed",
        payload: null,
        error: "Trigger event not found for delivery",
      });
      result.failed += 1;
      continue;
    }

    let allOk = true;
    let firstError: string | null = null;

    for (const to of recipients) {
      const res = await sendTwilioSms({ to, body });
      if (!res.ok) {
        allOk = false;
        if (!firstError) firstError = res.error ?? `HTTP ${res.status ?? "?"}`;
      }
    }

    await updateDelivery(supabase, delivery.id, {
      status: allOk ? "sent" : "failed",
      payload: body,
      error: allOk ? null : firstError,
    });

    if (allOk) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}

async function updateDelivery(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
  id: string,
  patch: { status: "sent" | "failed" | "preview"; payload: string | null; error: string | null },
): Promise<void> {
  try {
    await supabase
      .from("delivery_attempts")
      .update({
        status: patch.status,
        payload: patch.payload,
        error: patch.error,
      })
      .eq("id", id);
  } catch {
    // Soft-error: the row stays `pending` and will be retried on the next dispatch.
  }
}
