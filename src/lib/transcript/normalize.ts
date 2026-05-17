// Pure normalizer for ElevenLabs Conversational AI webhook events.
//
// ElevenLabs emits several event shapes over its webhook channel. We only
// care about the streamed-transcript events here (user_transcript and
// agent_response). Post-call summaries (post_call_transcription) and other
// event types are intentionally ignored — the simulator/pipeline handles
// summarisation downstream.
//
// This module is pure: no IO, no env access. It tolerates partial /
// malformed payloads and returns `null` for anything we can't classify so
// the webhook caller can respond 200 with `{ ignored: true }`.

import type { ChunkSpeaker } from "@/lib/types";

export type CallRefType = "callId" | "twilioSid" | "conversationId";

export interface NormalizedTranscriptEvent {
  source: ChunkSpeaker;
  text: string;
  sequence?: number;
  callRef?: {
    type: CallRefType;
    value: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

// Walks a few likely locations for a call reference, in priority order:
//   1. metadata.callId / metadata.call_id (our system passes this via dynamic vars)
//   2. dynamic_variables.callId / call_id
//   3. data.metadata.callId / call_id
//   4. twilio_call_sid (top-level, metadata, or data)
//   5. conversation_id (top-level or data)
function resolveCallRef(
  payload: Record<string, unknown>,
): NormalizedTranscriptEvent["callRef"] | undefined {
  const data = isRecord(payload.data) ? payload.data : undefined;
  const metadata = isRecord(payload.metadata)
    ? payload.metadata
    : data && isRecord(data.metadata)
      ? data.metadata
      : undefined;
  const dynamicVars = isRecord(payload.dynamic_variables)
    ? payload.dynamic_variables
    : isRecord(payload.conversation_initiation_client_data)
      ? (isRecord(
          (payload.conversation_initiation_client_data as Record<string, unknown>)
            .dynamic_variables,
        )
          ? ((
              payload.conversation_initiation_client_data as Record<string, unknown>
            ).dynamic_variables as Record<string, unknown>)
          : undefined)
      : metadata && isRecord(metadata.dynamic_variables)
        ? (metadata.dynamic_variables as Record<string, unknown>)
        : undefined;

  const callIdCandidate =
    (metadata && (asString(metadata.callId) ?? asString(metadata.call_id))) ??
    (dynamicVars &&
      (asString(dynamicVars.callId) ?? asString(dynamicVars.call_id))) ??
    asString(payload.callId) ??
    asString(payload.call_id);
  if (callIdCandidate) {
    return { type: "callId", value: callIdCandidate };
  }

  const twilioSidCandidate =
    asString(payload.twilio_call_sid) ??
    (metadata && asString(metadata.twilio_call_sid)) ??
    (data && asString(data.twilio_call_sid));
  if (twilioSidCandidate) {
    return { type: "twilioSid", value: twilioSidCandidate };
  }

  const conversationIdCandidate =
    asString(payload.conversation_id) ??
    (data && asString(data.conversation_id)) ??
    (metadata && asString(metadata.conversation_id));
  if (conversationIdCandidate) {
    return { type: "conversationId", value: conversationIdCandidate };
  }

  return undefined;
}

// Extract text from possibly-nested locations like:
//   data.user_transcription_event.user_transcript
//   data.agent_response_event.agent_response
//   data.text / data.message / event.text
function extractText(
  payload: Record<string, unknown>,
  speaker: ChunkSpeaker,
): string | undefined {
  const data = isRecord(payload.data) ? payload.data : undefined;

  if (speaker === "elder") {
    const event = data && isRecord(data.user_transcription_event)
      ? data.user_transcription_event
      : isRecord(payload.user_transcription_event)
        ? payload.user_transcription_event
        : undefined;
    const text =
      (event && asString(event.user_transcript)) ??
      (event && asString(event.transcript)) ??
      (event && asString(event.text)) ??
      (data && asString(data.user_transcript)) ??
      asString(payload.user_transcript) ??
      (data && asString(data.transcript)) ??
      (data && asString(data.text));
    return text;
  }

  if (speaker === "agent") {
    const event =
      data && isRecord(data.agent_response_event)
        ? data.agent_response_event
        : isRecord(payload.agent_response_event)
          ? payload.agent_response_event
          : undefined;
    const text =
      (event && asString(event.agent_response)) ??
      (event && asString(event.response)) ??
      (event && asString(event.text)) ??
      (data && asString(data.agent_response)) ??
      asString(payload.agent_response) ??
      (data && asString(data.text));
    return text;
  }

  return undefined;
}

function extractSequence(payload: Record<string, unknown>): number | undefined {
  const data = isRecord(payload.data) ? payload.data : undefined;
  return (
    asNumber(payload.sequence) ??
    (data && asNumber(data.sequence)) ??
    asNumber(payload.event_id) ??
    (data && asNumber(data.event_id)) ??
    asNumber(payload.message_index) ??
    (data && asNumber(data.message_index))
  );
}

export function normalizeElevenLabsEvent(
  event: unknown,
): NormalizedTranscriptEvent | null {
  if (!isRecord(event)) return null;

  const type = asString(event.type);
  if (!type) return null;

  let speaker: ChunkSpeaker | null = null;
  if (type === "user_transcript" || type === "user_transcription") {
    speaker = "elder";
  } else if (type === "agent_response" || type === "agent_response_event") {
    speaker = "agent";
  }
  if (!speaker) return null;

  const text = extractText(event, speaker);
  if (!text) return null;

  const result: NormalizedTranscriptEvent = {
    source: speaker,
    text,
  };

  const sequence = extractSequence(event);
  if (sequence !== undefined) result.sequence = sequence;

  const callRef = resolveCallRef(event);
  if (callRef) result.callRef = callRef;

  return result;
}
