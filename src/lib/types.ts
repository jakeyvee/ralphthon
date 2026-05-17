// Shared types used across UI, scanner, persistence, and integrations.
// Keep this file authoritative — worktrees should import from here.

export type CallSource = "real" | "simulator";

export type CallStatus =
  | "idle"
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed";

export type ChunkSpeaker = "elder" | "agent" | "system";

export interface TranscriptChunk {
  id: string;
  call_id: string;
  source: ChunkSpeaker;
  text: string;
  sequence: number;
  timestamp_sgt: string;
}

export interface TriggerRule {
  id: string;
  name: string;
  patterns: string[];
  recommended_action: string;
  enabled: boolean;
  is_preset: boolean;
}

export interface RuleEvaluation {
  rule_id: string;
  rule_name: string;
  matched: boolean;
  matched_text?: string;
}

export interface TriggerEvent {
  id: string;
  call_id: string;
  chunk_id: string;
  rule_id: string;
  rule_name: string;
  matched_text: string;
  context_excerpt: string;
  recommended_action: string;
  timestamp_sgt: string;
}

export type DeliveryChannel = "telegram" | "sms";
export type DeliveryStatus = "pending" | "sent" | "failed" | "preview";

export interface DeliveryAttempt {
  id: string;
  trigger_event_id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  error?: string;
  payload?: string;
  timestamp_sgt: string;
}

export interface HandoffAction {
  id: string;
  trigger_event_id?: string;
  resource_name: string;
  note?: string;
  timestamp_sgt: string;
}

export interface MemorySummary {
  elder_id: string;
  summary: string;
  updated_at_sgt: string;
}

export interface ElderConfig {
  id: string;
  elder_name: string;
  elder_phone: string;
  family_name: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  sms_recipients: string[];
  daily_call_time_sgt: string; // "HH:MM"
  consent_acknowledged: boolean;
}
