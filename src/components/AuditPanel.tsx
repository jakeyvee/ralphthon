"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatSgt, nowSgtISO } from "@/lib/sgt";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { HandoffResources } from "@/components/HandoffResources";
import type { ServiceStatusMap } from "@/lib/env";
import type {
  CallSource,
  CallStatus,
  DeliveryAttempt,
  HandoffAction,
  MemorySummary,
  RuleEvaluation,
  TranscriptChunk,
  TriggerEvent,
  TriggerRule,
} from "@/lib/types";

type ControlKey = "real" | "simulator" | "telegram" | "reset";

type Toast = {
  id: number;
  tone: "info" | "warn" | "error" | "success";
  text: string;
};

type CallState = {
  status: CallStatus;
  source: CallSource | null;
  call_id: string | null;
};

export type AuditPanelInitial = {
  call: CallState;
  chunks: TranscriptChunk[];
  evaluations: Record<string, RuleEvaluation[]>; // keyed by chunk_id
  triggerEvents: TriggerEvent[];
  deliveries: DeliveryAttempt[];
  handoffs: HandoffAction[];
  memory: MemorySummary | null;
};

const EMPTY_INITIAL: AuditPanelInitial = {
  call: { status: "idle", source: null, call_id: null },
  chunks: [],
  evaluations: {},
  triggerEvents: [],
  deliveries: [],
  handoffs: [],
  memory: null,
};

const STATUS_TONE: Record<CallStatus, string> = {
  idle: "bg-zinc-100 text-zinc-700 border-zinc-200",
  queued: "bg-sky-50 text-sky-700 border-sky-200",
  ringing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  in_progress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-zinc-100 text-zinc-700 border-zinc-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};

const DELIVERY_TONE: Record<DeliveryAttempt["status"], string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  preview: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function AuditPanel({
  rules,
  serviceStatus,
  initial = EMPTY_INITIAL,
}: {
  rules: TriggerRule[];
  serviceStatus: ServiceStatusMap;
  initial?: AuditPanelInitial;
}) {
  const [state, setState] = useState<AuditPanelInitial>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<ControlKey | null>(null);
  const [realtimeOn, setRealtimeOn] = useState(false);

  const pushToast = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  // VOL-154: hydrate memory summary on mount when not provided server-side.
  useEffect(() => {
    if (state.memory) return;
    let cancelled = false;
    fetch("/api/memory")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { memory?: MemorySummary | null } | null) => {
        if (cancelled || !data?.memory) return;
        setState((s) => (s.memory ? s : { ...s, memory: data.memory! }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state.memory]);

  // Realtime subscription (best-effort)
  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) {
      setRealtimeOn(false);
      return;
    }
    setRealtimeOn(true);
    const channel = client
      .channel("call-check-loop-audit")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        () => {
          /* downstream tickets will refine — flag a refresh */
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transcript_chunks" },
        () => {},
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trigger_events" },
        () => {},
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_attempts" },
        () => {},
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, []);

  const callBlockers = useMemo(() => {
    const missing: string[] = [];
    if (!serviceStatus.supabase.configured) missing.push("Supabase");
    if (!serviceStatus.twilioVoice.configured) missing.push("Twilio Voice");
    if (!serviceStatus.elevenlabs.configured) missing.push("ElevenLabs");
    return missing;
  }, [serviceStatus]);

  async function callApi(
    key: ControlKey,
    url: string,
    fallbackTicket: string,
  ) {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 404) {
        pushToast("warn", fallbackTicket);
        return;
      }
      if (!res.ok) {
        pushToast(
          "error",
          `Request failed (${res.status}) — see server logs.`,
        );
        return;
      }
      pushToast("success", "Request accepted.");
    } catch (err) {
      pushToast(
        "warn",
        err instanceof Error
          ? `${fallbackTicket} (${err.message})`
          : fallbackTicket,
      );
    } finally {
      setBusy(null);
    }
  }

  async function startReal() {
    if (callBlockers.length > 0) return;
    await callApi(
      "real",
      "/api/calls/start",
      "Voice path not wired (VOL-147)",
    );
  }

  async function runSimulator() {
    await callApi(
      "simulator",
      "/api/simulator/run",
      "Simulator not wired (VOL-143)",
    );
  }

  async function sendTelegramTest() {
    await callApi(
      "telegram",
      "/api/telegram/test",
      "Telegram path not wired (VOL-145)",
    );
  }

  async function resetDemo() {
    if (!window.confirm("Reset all demo state? This cannot be undone.")) return;
    await callApi(
      "reset",
      "/api/admin/reset",
      "Reset endpoint not wired (VOL-152)",
    );
    setState(EMPTY_INITIAL);
  }

  function markHandoffLocally(resourceName: string) {
    const action: HandoffAction = {
      id: `local-${Date.now()}`,
      resource_name: resourceName,
      note: "Logged locally — server handoff arrives in VOL-152.",
      timestamp_sgt: nowSgtISO(),
    };
    setState((s) => ({ ...s, handoffs: [...s.handoffs, action] }));
    pushToast("info", `Handoff considered: ${resourceName} (logged locally).`);
  }

  const callDisabledReason =
    callBlockers.length > 0
      ? `Configure ${callBlockers.join(", ")} to enable a real call.`
      : null;

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null || callBlockers.length > 0}
            onClick={startReal}
            title={callDisabledReason ?? "Start a real voice check-in"}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "real" ? "Starting..." : "Start real test call"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={runSimulator}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy === "simulator" ? "Running..." : "Run simulated transcript"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={sendTelegramTest}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy === "telegram" ? "Sending..." : "Send Telegram test"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={resetDemo}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy === "reset" ? "Resetting..." : "Reset demo state"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                realtimeOn
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 bg-zinc-100 text-zinc-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  realtimeOn ? "bg-emerald-500" : "bg-zinc-400"
                }`}
              />
              {realtimeOn ? "Realtime live" : "Realtime disabled"}
            </span>
          </div>
        </div>
        {callDisabledReason ? (
          <p className="mt-2 text-xs text-amber-700">{callDisabledReason}</p>
        ) : null}
        <ToastStack toasts={toasts} />
      </div>

      <SectionCard title="Call status">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              STATUS_TONE[state.call.status]
            }`}
          >
            {state.call.status}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs text-zinc-600">
            source: {state.call.source ?? "—"}
          </span>
          <span className="text-xs text-zinc-500">
            call id: {state.call.call_id ?? "—"}
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Live transcript">
        {state.chunks.length === 0 ? (
          <EmptyState text="No transcript yet. Start a real call or run the simulator to see chunks stream in." />
        ) : (
          <ol className="space-y-2">
            {state.chunks.map((chunk) => (
              <li
                key={chunk.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <SpeakerChip speaker={chunk.source} />
                  <time className="text-xs text-zinc-500">
                    {formatSgt(chunk.timestamp_sgt)}
                  </time>
                </div>
                <p className="text-sm text-zinc-800">{chunk.text}</p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <SectionCard title="Rule evaluations">
        {state.chunks.length === 0 ? (
          <EmptyState text="Rule checks appear here as each transcript chunk arrives." />
        ) : (
          <ul className="space-y-2">
            {state.chunks.map((chunk) => {
              const evals = state.evaluations[chunk.id] ?? buildPlaceholderEvals(rules);
              return (
                <li
                  key={chunk.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <p className="mb-2 truncate text-xs text-zinc-500">
                    Chunk #{chunk.sequence}: {chunk.text}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {evals.map((ev) => (
                      <span
                        key={ev.rule_id}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          ev.matched
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-zinc-200 bg-zinc-50 text-zinc-500"
                        }`}
                        title={
                          ev.matched
                            ? `Matched: ${ev.matched_text ?? ""}`
                            : "No match"
                        }
                      >
                        {ev.rule_name}: {ev.matched ? "match" : "—"}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Fired trigger events">
        {state.triggerEvents.length === 0 ? (
          <EmptyState
            text={`No triggers fired yet. Loaded rules: ${rules.length}.`}
          />
        ) : (
          <ul className="space-y-3">
            {state.triggerEvents.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-rose-200 bg-rose-50/40 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-rose-800">
                    {ev.rule_name}
                  </span>
                  <time className="text-xs text-rose-700">
                    {formatSgt(ev.timestamp_sgt)}
                  </time>
                </div>
                <p className="text-xs text-zinc-700">
                  Matched text: <span className="font-mono">{ev.matched_text}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  &ldquo;{ev.context_excerpt}&rdquo;
                </p>
                <p className="mt-2 text-xs text-zinc-800">
                  <span className="font-semibold">Recommended:</span>{" "}
                  {ev.recommended_action}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Telegram delivery">
        <DeliveryList
          attempts={state.deliveries.filter((d) => d.channel === "telegram")}
          emptyText="No Telegram alerts sent yet."
        />
      </SectionCard>

      <SectionCard title="SMS delivery">
        <DeliveryList
          attempts={state.deliveries.filter((d) => d.channel === "sms")}
          emptyText="No SMS alerts sent yet. Preview-only attempts render as gray badges."
        />
      </SectionCard>

      <HandoffResources triggerEvents={state.triggerEvents} />

      <SectionCard title="Memory summary">
        {state.memory ? (
          <div className="space-y-1">
            <p className="text-sm text-zinc-800 whitespace-pre-wrap">
              {state.memory.summary}
            </p>
            <p className="text-xs text-zinc-500">
              Updated {formatSgt(state.memory.updated_at_sgt)}
            </p>
          </div>
        ) : (
          <EmptyState text="No prior calls yet." />
        )}
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-4 text-center text-xs text-zinc-500">
      {text}
    </div>
  );
}

function SpeakerChip({ speaker }: { speaker: TranscriptChunk["source"] }) {
  const tone = {
    elder: "bg-sky-100 text-sky-800",
    agent: "bg-violet-100 text-violet-800",
    system: "bg-zinc-200 text-zinc-700",
  }[speaker];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`}
    >
      {speaker}
    </span>
  );
}

function DeliveryList({
  attempts,
  emptyText,
}: {
  attempts: DeliveryAttempt[];
  emptyText: string;
}) {
  if (attempts.length === 0) return <EmptyState text={emptyText} />;
  return (
    <ul className="space-y-2">
      {attempts.map((a) => (
        <li
          key={a.id}
          className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3"
        >
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              DELIVERY_TONE[a.status]
            }`}
          >
            {a.status === "preview" ? "Preview only" : a.status}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-500">
              {formatSgt(a.timestamp_sgt)}
            </p>
            {a.payload ? (
              <p className="mt-1 truncate text-sm text-zinc-800">{a.payload}</p>
            ) : null}
            {a.error ? (
              <p className="mt-1 text-xs text-rose-700">{a.error}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function HandoffCard({
  name,
  purpose,
  onMark,
}: {
  name: string;
  purpose: string;
  onMark: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-semibold text-zinc-900">{name}</p>
      <p className="mt-1 text-xs text-zinc-600">{purpose}</p>
      <button
        type="button"
        onClick={onMark}
        className="mt-3 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Mark handoff considered
      </button>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <ul className="mt-3 space-y-1">
      {toasts.map((t) => (
        <li
          key={t.id}
          className={`rounded-md border px-2 py-1 text-xs ${tones[t.tone]}`}
        >
          {t.text}
        </li>
      ))}
    </ul>
  );
}

function buildPlaceholderEvals(rules: TriggerRule[]): RuleEvaluation[] {
  return rules.map((r) => ({
    rule_id: r.id,
    rule_name: r.name,
    matched: false,
  }));
}
