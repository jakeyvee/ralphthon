// Typed Supabase persistence helpers for Call-Check-Loop.
// Server-only. Mirrors columns defined in supabase/migrations/*.sql
// and shapes from src/lib/types.ts.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { nowSgtISO } from "@/lib/sgt";
import type {
  CallSource,
  CallStatus,
  ChunkSpeaker,
  DeliveryAttempt,
  DeliveryChannel,
  DeliveryStatus,
  ElderConfig,
  HandoffAction,
  MemorySummary,
  RuleEvaluation,
  TranscriptChunk,
  TriggerEvent,
  TriggerRule,
} from "@/lib/types";

// ---------- Preset rules (kept in sync with seed_default_rules migration) ----------
// We inline this rather than importing from src/lib/rules/preset.ts because
// VOL-149 does not own that path (see CLAUDE.md file-ownership map).
const PRESET_RULES: TriggerRule[] = [
  {
    id: "did_not_sleep",
    name: "Did not sleep",
    patterns: [
      "didn't sleep",
      "did not sleep",
      "no sleep",
      "couldn't sleep",
      "trouble sleeping",
    ],
    recommended_action:
      "Ask about sleep tonight; check medication and routine.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "pain",
    name: "Pain",
    patterns: [
      "back was hurting",
      "back hurts",
      "in pain",
      "my chest hurts",
      "headache",
      "stomach hurts",
      "hurting",
    ],
    recommended_action:
      "Check pain location and severity; consider clinic visit.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "fall_or_dizzy",
    name: "Fall or dizziness",
    patterns: [
      "fell down",
      "i fell",
      "dizzy",
      "lightheaded",
      "lost my balance",
    ],
    recommended_action:
      "Check for injury; consider GP/clinic if recent fall.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "not_eating",
    name: "Not eating",
    patterns: [
      "haven't eaten",
      "no appetite",
      "didn't eat",
      "skipping meals",
    ],
    recommended_action:
      "Encourage hydration and a light meal; check fridge during next visit.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "loneliness",
    name: "Loneliness",
    patterns: [
      "feel lonely",
      "feeling alone",
      "no one to talk to",
      "miss everyone",
    ],
    recommended_action:
      "Plan a visit or call this week; consider community programs.",
    enabled: true,
    is_preset: true,
  },
  {
    id: "medication_issue",
    name: "Medication issue",
    patterns: [
      "ran out of",
      "forgot to take",
      "missed my pills",
      "out of medicine",
    ],
    recommended_action: "Refill check; review medication list.",
    enabled: true,
    is_preset: true,
  },
];

// ---------- DB-row types (DB shape may differ slightly from UI types) ----------

interface ElderConfigRow {
  id: string;
  elder_name: string | null;
  elder_phone: string | null;
  family_name: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  sms_recipients: string[] | null;
  daily_call_time_sgt: string;
  consent_acknowledged: boolean;
}

interface RuleRow {
  id: string;
  name: string;
  patterns: string[] | null;
  recommended_action: string;
  enabled: boolean;
  is_preset: boolean;
}

interface CallRow {
  id: string;
  elder_id: string | null;
  source: CallSource;
  status: CallStatus | string;
  started_at_sgt: string;
  ended_at_sgt: string | null;
  twilio_call_sid: string | null;
  created_at: string;
}

interface TranscriptChunkRow {
  id: string;
  call_id: string;
  source: ChunkSpeaker;
  text: string;
  sequence: number;
  timestamp_sgt: string;
}

interface RuleEvaluationRow {
  id: string;
  chunk_id: string;
  rule_id: string;
  matched: boolean;
  matched_text: string | null;
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

interface DeliveryAttemptRow {
  id: string;
  trigger_event_id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  error: string | null;
  payload: string | null;
  timestamp_sgt: string;
}

interface HandoffActionRow {
  id: string;
  trigger_event_id: string | null;
  resource_name: string;
  note: string | null;
  timestamp_sgt: string;
}

interface MemorySummaryRow {
  elder_id: string;
  summary: string;
  updated_at_sgt: string;
}

// ---------- Helpers ----------

function client(): SupabaseClient | null {
  return getServerSupabase();
}

function mapElder(row: ElderConfigRow): ElderConfig {
  return {
    id: row.id,
    elder_name: row.elder_name ?? "",
    elder_phone: row.elder_phone ?? "",
    family_name: row.family_name ?? "",
    telegram_bot_token: row.telegram_bot_token ?? undefined,
    telegram_chat_id: row.telegram_chat_id ?? undefined,
    sms_recipients: row.sms_recipients ?? [],
    daily_call_time_sgt: row.daily_call_time_sgt,
    consent_acknowledged: row.consent_acknowledged,
  };
}

function mapRule(row: RuleRow): TriggerRule {
  return {
    id: row.id,
    name: row.name,
    patterns: row.patterns ?? [],
    recommended_action: row.recommended_action,
    enabled: row.enabled,
    is_preset: row.is_preset,
  };
}

function mapChunk(row: TranscriptChunkRow): TranscriptChunk {
  return {
    id: row.id,
    call_id: row.call_id,
    source: row.source,
    text: row.text,
    sequence: row.sequence,
    timestamp_sgt: row.timestamp_sgt,
  };
}

function mapEvaluation(
  row: RuleEvaluationRow & { rule_name?: string },
): RuleEvaluation {
  return {
    rule_id: row.rule_id,
    rule_name: row.rule_name ?? row.rule_id,
    matched: row.matched,
    matched_text: row.matched_text ?? undefined,
  };
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

function mapDelivery(row: DeliveryAttemptRow): DeliveryAttempt {
  return {
    id: row.id,
    trigger_event_id: row.trigger_event_id,
    channel: row.channel,
    status: row.status,
    error: row.error ?? undefined,
    payload: row.payload ?? undefined,
    timestamp_sgt: row.timestamp_sgt,
  };
}

function mapHandoff(row: HandoffActionRow): HandoffAction {
  return {
    id: row.id,
    trigger_event_id: row.trigger_event_id ?? undefined,
    resource_name: row.resource_name,
    note: row.note ?? undefined,
    timestamp_sgt: row.timestamp_sgt,
  };
}

function mapMemory(row: MemorySummaryRow): MemorySummary {
  return {
    elder_id: row.elder_id,
    summary: row.summary,
    updated_at_sgt: row.updated_at_sgt,
  };
}

// ---------- elder_config (singleton-row pattern) ----------

export async function getOrCreateElderConfig(): Promise<ElderConfig | null> {
  const supabase = client();
  if (!supabase) return null;

  const existing = await supabase
    .from("elder_config")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ElderConfigRow>();

  if (existing.error) return null;
  if (existing.data) return mapElder(existing.data);

  const defaults = {
    elder_name: "",
    elder_phone: "",
    family_name: "",
    telegram_bot_token: null,
    telegram_chat_id: null,
    sms_recipients: [] as string[],
    daily_call_time_sgt: "08:30",
    consent_acknowledged: false,
  };

  const inserted = await supabase
    .from("elder_config")
    .insert(defaults)
    .select("*")
    .single<ElderConfigRow>();

  if (inserted.error || !inserted.data) return null;
  return mapElder(inserted.data);
}

export async function updateElderConfig(
  patch: Partial<ElderConfig>,
): Promise<ElderConfig | null> {
  const supabase = client();
  if (!supabase) return null;

  const current = await getOrCreateElderConfig();
  if (!current) return null;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.elder_name !== undefined) update.elder_name = patch.elder_name;
  if (patch.elder_phone !== undefined) update.elder_phone = patch.elder_phone;
  if (patch.family_name !== undefined) update.family_name = patch.family_name;
  if (patch.telegram_bot_token !== undefined)
    update.telegram_bot_token = patch.telegram_bot_token || null;
  if (patch.telegram_chat_id !== undefined)
    update.telegram_chat_id = patch.telegram_chat_id || null;
  if (patch.sms_recipients !== undefined)
    update.sms_recipients = patch.sms_recipients;
  if (patch.daily_call_time_sgt !== undefined)
    update.daily_call_time_sgt = patch.daily_call_time_sgt;
  if (patch.consent_acknowledged !== undefined)
    update.consent_acknowledged = patch.consent_acknowledged;

  const updated = await supabase
    .from("elder_config")
    .update(update)
    .eq("id", current.id)
    .select("*")
    .single<ElderConfigRow>();

  if (updated.error || !updated.data) return null;
  return mapElder(updated.data);
}

// ---------- rules ----------

export async function listRules(): Promise<TriggerRule[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("rules")
    .select("*")
    .order("is_preset", { ascending: false })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return (data as RuleRow[]).map(mapRule);
}

export async function upsertRule(rule: TriggerRule): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  await supabase.from("rules").upsert(
    {
      id: rule.id,
      name: rule.name,
      patterns: rule.patterns,
      recommended_action: rule.recommended_action,
      enabled: rule.enabled,
      is_preset: rule.is_preset,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  await supabase.from("rules").delete().eq("id", id);
}

export async function resetRulesToPreset(): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  // Wipe everything (cascades to rule_evaluations); then reinsert presets.
  await supabase.from("rules").delete().neq("id", "__never__");
  await supabase.from("rules").upsert(
    PRESET_RULES.map((r) => ({
      id: r.id,
      name: r.name,
      patterns: r.patterns,
      recommended_action: r.recommended_action,
      enabled: r.enabled,
      is_preset: r.is_preset,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" },
  );
}

// ---------- calls + chunks ----------

export async function createCall(args: {
  source: CallSource;
  status: CallStatus;
  elder_id?: string | null;
  started_at_sgt?: string;
  twilio_call_sid?: string | null;
}): Promise<{ id: string }> {
  const supabase = client();
  if (!supabase) return { id: "" };
  const insert = await supabase
    .from("calls")
    .insert({
      elder_id: args.elder_id ?? null,
      source: args.source,
      status: args.status,
      started_at_sgt: args.started_at_sgt ?? nowSgtISO(),
      twilio_call_sid: args.twilio_call_sid ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (insert.error || !insert.data) return { id: "" };
  return { id: insert.data.id };
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus,
  endedAtSgt?: string,
): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  const patch: Record<string, unknown> = { status };
  if (endedAtSgt) patch.ended_at_sgt = endedAtSgt;
  await supabase.from("calls").update(patch).eq("id", callId);
}

export async function appendChunk(args: {
  call_id: string;
  source: ChunkSpeaker;
  text: string;
  sequence: number;
  timestamp_sgt?: string;
}): Promise<{ id: string }> {
  const supabase = client();
  if (!supabase) return { id: "" };
  const insert = await supabase
    .from("transcript_chunks")
    .insert({
      call_id: args.call_id,
      source: args.source,
      text: args.text,
      sequence: args.sequence,
      timestamp_sgt: args.timestamp_sgt ?? nowSgtISO(),
    })
    .select("id")
    .single<{ id: string }>();
  if (insert.error || !insert.data) return { id: "" };
  return { id: insert.data.id };
}

// ---------- evaluations / trigger events / deliveries / handoffs ----------

export async function recordEvaluation(args: {
  chunk_id: string;
  rule_id: string;
  matched: boolean;
  matched_text?: string | null;
}): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  await supabase.from("rule_evaluations").insert({
    chunk_id: args.chunk_id,
    rule_id: args.rule_id,
    matched: args.matched,
    matched_text: args.matched_text ?? null,
  });
}

export async function recordTriggerEvent(args: {
  call_id: string;
  chunk_id: string;
  rule_id: string;
  rule_name: string;
  matched_text: string;
  context_excerpt: string;
  recommended_action: string;
  timestamp_sgt?: string;
}): Promise<{ id: string }> {
  const supabase = client();
  if (!supabase) return { id: "" };
  const insert = await supabase
    .from("trigger_events")
    .insert({
      call_id: args.call_id,
      chunk_id: args.chunk_id,
      rule_id: args.rule_id,
      rule_name: args.rule_name,
      matched_text: args.matched_text,
      context_excerpt: args.context_excerpt,
      recommended_action: args.recommended_action,
      timestamp_sgt: args.timestamp_sgt ?? nowSgtISO(),
    })
    .select("id")
    .single<{ id: string }>();
  if (insert.error || !insert.data) return { id: "" };
  return { id: insert.data.id };
}

export async function recordDelivery(args: {
  trigger_event_id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  error?: string | null;
  payload?: string | null;
  timestamp_sgt?: string;
}): Promise<{ id: string }> {
  const supabase = client();
  if (!supabase) return { id: "" };
  const insert = await supabase
    .from("delivery_attempts")
    .insert({
      trigger_event_id: args.trigger_event_id,
      channel: args.channel,
      status: args.status,
      error: args.error ?? null,
      payload: args.payload ?? null,
      timestamp_sgt: args.timestamp_sgt ?? nowSgtISO(),
    })
    .select("id")
    .single<{ id: string }>();
  if (insert.error || !insert.data) return { id: "" };
  return { id: insert.data.id };
}

export async function recordHandoff(args: {
  trigger_event_id?: string | null;
  resource_name: string;
  note?: string | null;
  timestamp_sgt?: string;
}): Promise<{ id: string }> {
  const supabase = client();
  if (!supabase) return { id: "" };
  const insert = await supabase
    .from("handoff_actions")
    .insert({
      trigger_event_id: args.trigger_event_id ?? null,
      resource_name: args.resource_name,
      note: args.note ?? null,
      timestamp_sgt: args.timestamp_sgt ?? nowSgtISO(),
    })
    .select("id")
    .single<{ id: string }>();
  if (insert.error || !insert.data) return { id: "" };
  return { id: insert.data.id };
}

// ---------- audit / read ----------

export interface CallAudit {
  call: CallRow | null;
  chunks: TranscriptChunk[];
  evaluations: RuleEvaluation[];
  events: TriggerEvent[];
  deliveries: DeliveryAttempt[];
  handoffs: HandoffAction[];
}

export async function getCallAudit(callId: string): Promise<CallAudit> {
  const empty: CallAudit = {
    call: null,
    chunks: [],
    evaluations: [],
    events: [],
    deliveries: [],
    handoffs: [],
  };
  const supabase = client();
  if (!supabase) return empty;

  const callQ = supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle<CallRow>();
  const chunksQ = supabase
    .from("transcript_chunks")
    .select("*")
    .eq("call_id", callId)
    .order("sequence", { ascending: true });
  const eventsQ = supabase
    .from("trigger_events")
    .select("*")
    .eq("call_id", callId)
    .order("created_at", { ascending: true });

  const [callRes, chunksRes, eventsRes] = await Promise.all([
    callQ,
    chunksQ,
    eventsQ,
  ]);

  const chunkIds = ((chunksRes.data ?? []) as TranscriptChunkRow[]).map(
    (c) => c.id,
  );
  const eventIds = ((eventsRes.data ?? []) as TriggerEventRow[]).map((e) => e.id);

  const evaluationsQ = chunkIds.length
    ? supabase
        .from("rule_evaluations")
        .select("*, rules(name)")
        .in("chunk_id", chunkIds)
    : Promise.resolve({ data: [], error: null });

  const deliveriesQ = eventIds.length
    ? supabase
        .from("delivery_attempts")
        .select("*")
        .in("trigger_event_id", eventIds)
        .order("created_at", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const handoffsQ = eventIds.length
    ? supabase
        .from("handoff_actions")
        .select("*")
        .in("trigger_event_id", eventIds)
        .order("created_at", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const [evaluationsRes, deliveriesRes, handoffsRes] = await Promise.all([
    evaluationsQ,
    deliveriesQ,
    handoffsQ,
  ]);

  type EvalWithRule = RuleEvaluationRow & { rules?: { name: string } | null };
  const evaluations = (
    (evaluationsRes.data ?? []) as unknown as EvalWithRule[]
  ).map((row) =>
    mapEvaluation({ ...row, rule_name: row.rules?.name ?? row.rule_id }),
  );

  return {
    call: callRes.data ?? null,
    chunks: ((chunksRes.data ?? []) as TranscriptChunkRow[]).map(mapChunk),
    evaluations,
    events: ((eventsRes.data ?? []) as TriggerEventRow[]).map(mapTriggerEvent),
    deliveries: ((deliveriesRes.data ?? []) as DeliveryAttemptRow[]).map(
      mapDelivery,
    ),
    handoffs: ((handoffsRes.data ?? []) as HandoffActionRow[]).map(mapHandoff),
  };
}

// ---------- memory summary ----------

export async function getOrUpdateMemorySummary(
  elderId: string,
  summary?: string,
): Promise<MemorySummary | null> {
  const supabase = client();
  if (!supabase) return null;

  if (summary === undefined) {
    const { data, error } = await supabase
      .from("memory_summaries")
      .select("*")
      .eq("elder_id", elderId)
      .maybeSingle<MemorySummaryRow>();
    if (error || !data) return null;
    return mapMemory(data);
  }

  const upsert = await supabase
    .from("memory_summaries")
    .upsert(
      {
        elder_id: elderId,
        summary,
        updated_at_sgt: nowSgtISO(),
      },
      { onConflict: "elder_id" },
    )
    .select("*")
    .single<MemorySummaryRow>();
  if (upsert.error || !upsert.data) return null;
  return mapMemory(upsert.data);
}

// ---------- demo reset ----------

export async function resetDemoData(): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  // Order matters when cascades are not used: delete leaves first.
  // (handoff_actions and delivery_attempts cascade from trigger_events,
  // but we delete explicitly to keep behaviour obvious.)
  await supabase.from("handoff_actions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("delivery_attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("trigger_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("rule_evaluations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("transcript_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("calls").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
