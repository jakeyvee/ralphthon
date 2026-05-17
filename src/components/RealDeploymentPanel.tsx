"use client";

// Client-side panel that surfaces the deployment readiness checklist and
// gates the "Start real elder call" action behind every check passing.
//
// Props are pre-loaded server-side from computeReadiness() so first paint
// shows the correct mode without a flash. The "Re-check readiness" button
// refetches GET /api/deployment/readiness.

import { useCallback, useState, useTransition } from "react";
import type {
  Readiness,
  ReadinessCheck,
  ReadinessMode,
} from "@/lib/deployment/readiness";

type CallState =
  | { kind: "idle" }
  | { kind: "calling" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; blockers?: ReadinessCheck[] };

const MODE_PILL: Record<ReadinessMode, { label: string; classes: string }> = {
  simulator: {
    label: "Simulator",
    classes: "border-zinc-700 bg-zinc-800 text-zinc-300",
  },
  "test-call": {
    label: "Test call",
    classes: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  },
  "real-elder": {
    label: "Real elder call",
    classes: "border-[#F472B6]/40 bg-[#F472B6]/15 text-[#F472B6]",
  },
};

export function RealDeploymentPanel({
  initialReadiness,
  elderName,
}: {
  initialReadiness: Readiness;
  elderName: string;
}) {
  const [readiness, setReadiness] = useState<Readiness>(initialReadiness);
  const [callState, setCallState] = useState<CallState>({ kind: "idle" });
  const [isRefreshing, startRefresh] = useTransition();
  const [isCalling, startCall] = useTransition();

  const refresh = useCallback(() => {
    startRefresh(async () => {
      try {
        const res = await fetch("/api/deployment/readiness", {
          method: "GET",
          cache: "no-store",
        });
        const data = (await res.json()) as { ok?: boolean; readiness?: Readiness };
        if (data?.readiness) {
          setReadiness(data.readiness);
        }
      } catch {
        // ignore — keep previous readiness
      }
    });
  }, []);

  const startRealCall = useCallback(() => {
    setCallState({ kind: "calling" });
    startCall(async () => {
      try {
        const res = await fetch("/api/calls/start-real", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          blockers?: ReadinessCheck[];
          callId?: string;
          twilioSid?: string | null;
        };
        if (data?.ok) {
          const who = elderName.trim().length > 0 ? elderName : "elder";
          setCallState({
            kind: "success",
            message: `Calling ${who} via Twilio…`,
          });
        } else {
          setCallState({
            kind: "error",
            message: data?.error ?? "Call could not be started.",
            blockers: data?.blockers,
          });
        }
      } catch (err) {
        setCallState({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Network error contacting /api/calls/start-real",
        });
      }
    });
  }, [elderName]);

  const pill = MODE_PILL[readiness.mode];
  const isReal = readiness.mode === "real-elder";
  const containerBorder = isReal
    ? "border-[#F472B6]/60"
    : "border-zinc-800";

  return (
    <section
      className={`rounded-2xl border bg-[#18181C] p-6 shadow-none ${containerBorder}`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Deployment mode
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${pill.classes}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              readiness.mode === "real-elder"
                ? "bg-[#F472B6]"
                : readiness.mode === "test-call"
                  ? "bg-amber-500"
                  : "bg-zinc-500"
            }`}
            aria-hidden
          />
          {pill.label}
        </span>
      </header>

      <ul className="mb-3 space-y-1.5">
        {[...readiness.passing, ...readiness.blockers].map((check) => (
          <li
            key={check.id}
            className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-[#0E0E10] px-2.5 py-1.5"
          >
            <span
              className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                check.ok ? "bg-emerald-500" : "bg-amber-500"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-zinc-100">
                {check.label}
              </div>
              {!check.ok && check.reason ? (
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {check.reason}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mb-3 text-[11px] italic text-zinc-500">
        Not a medical, emergency, or monitoring replacement. In a life-threatening
        emergency, call your local emergency line first.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={startRealCall}
          disabled={!readiness.ready || isCalling}
          className="rounded-lg bg-[#818CF8] px-3 py-2 text-sm font-medium text-zinc-950 shadow-sm hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {isCalling ? "Starting…" : "Start real elder call"}
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className="rounded-lg border border-zinc-800 bg-transparent px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/50 disabled:opacity-60"
        >
          {isRefreshing ? "Checking…" : "Re-check readiness"}
        </button>
      </div>

      {callState.kind === "calling" ? (
        <p className="mt-3 text-xs text-zinc-400">Starting outbound call…</p>
      ) : null}
      {callState.kind === "success" ? (
        <p className="mt-3 rounded-md border border-[#818CF8]/40 bg-[#818CF8]/15 px-2.5 py-2 text-xs font-medium text-[#818CF8]">
          {callState.message}
        </p>
      ) : null}
      {callState.kind === "error" ? (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 py-2 text-xs text-red-300">
          <p className="font-medium">{callState.message}</p>
          {callState.blockers && callState.blockers.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {callState.blockers.map((b) => (
                <li key={b.id}>
                  <span className="font-medium">{b.label}</span>
                  {b.reason ? `: ${b.reason}` : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-zinc-500">
        If services fail mid-call, switch back to Run simulated transcript
        above.
      </p>
    </section>
  );
}
