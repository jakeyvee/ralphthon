// VOL-158: read-only /calls/[id] audit deep-link page.
// Server Component that renders the full audit trail for a single call,
// suitable for being deep-linked from a Telegram alert. Read-only — no
// mutations, no client subscriptions.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCallAudit } from "@/lib/db/repo";
import { formatSgt } from "@/lib/sgt";
import type {
  ChunkSpeaker,
  DeliveryAttempt,
  DeliveryStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const SPEAKER_TONE: Record<ChunkSpeaker, string> = {
  elder: "bg-[#F472B6]/15 text-[#F472B6] border border-[#F472B6]/40",
  agent: "bg-[#818CF8]/15 text-[#818CF8] border border-[#818CF8]/40",
  system: "bg-zinc-800 text-zinc-300 border border-zinc-700",
};

const DELIVERY_TONE: Record<DeliveryStatus, string> = {
  pending: "bg-zinc-800 text-zinc-300 border-zinc-700",
  sent: "bg-[#818CF8]/15 text-[#818CF8] border-[#818CF8]/40",
  failed: "bg-red-500/15 text-red-300 border-red-500/40",
  preview: "bg-[#F472B6]/15 text-[#F472B6] border-[#F472B6]/40",
};

const STATUS_TONE: Record<string, string> = {
  idle: "bg-zinc-800 text-zinc-300 border-zinc-700",
  queued: "bg-[#818CF8]/15 text-[#818CF8] border-[#818CF8]/40",
  ringing: "bg-[#818CF8]/15 text-[#818CF8] border-[#818CF8]/40",
  in_progress: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  completed: "bg-zinc-800 text-zinc-300 border-zinc-700",
  failed: "bg-red-500/15 text-red-300 border-red-500/40",
};

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export default async function CallAuditPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const audit = await getCallAudit(id).catch(() => null);
  if (!audit || !audit.call) notFound();

  const { call, chunks, events, deliveries, handoffs } = audit;
  const sourceTone =
    call.source === "real"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : "bg-zinc-800 text-zinc-300 border-zinc-700";
  const statusTone =
    STATUS_TONE[call.status] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";

  return (
    <main className="mx-auto w-full max-w-4xl bg-[#0E0E10] px-4 py-6 sm:px-6">
      <div className="space-y-4">
        {/* Header */}
        <section className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none">
          <div className="mb-3 flex items-center justify-between">
            <Link
              href="/"
              className="text-xs font-medium text-zinc-400 hover:text-white"
            >
              &larr; Back to dashboard
            </Link>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Call audit
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${sourceTone}`}
            >
              source: {call.source}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${statusTone}`}
            >
              {call.status}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              started {formatSgt(call.started_at_sgt)}
            </span>
            {call.ended_at_sgt ? (
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                · ended {formatSgt(call.ended_at_sgt)}
              </span>
            ) : null}
          </div>
          <p
            className="mt-2 truncate font-mono text-[11px] text-[#818CF8]"
            title={call.id}
          >
            id: {call.id}
          </p>
        </section>

        {/* Transcript chunks */}
        <section className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Transcript chunks
          </h2>
          {chunks.length === 0 ? (
            <EmptyState text="No transcript chunks yet." />
          ) : (
            <ol className="space-y-2">
              {chunks.map((chunk) => (
                <li
                  key={chunk.id}
                  className="rounded-xl border border-zinc-800 bg-[#0E0E10] p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${
                        SPEAKER_TONE[chunk.source]
                      }`}
                    >
                      {chunk.source}
                    </span>
                    <time className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      {formatSgt(chunk.timestamp_sgt)}
                    </time>
                  </div>
                  <p className="text-sm text-zinc-100">{chunk.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Trigger events */}
        <section className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Trigger events
          </h2>
          {events.length === 0 ? (
            <EmptyState text="No triggers fired during this call." />
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-amber-200">
                      {ev.rule_name}
                    </span>
                    <time className="font-mono text-[11px] uppercase tracking-wider text-amber-300/80">
                      {formatSgt(ev.timestamp_sgt)}
                    </time>
                  </div>
                  <p className="text-xs text-zinc-200">
                    <span className="font-semibold">Recommended:</span>{" "}
                    {ev.recommended_action}
                  </p>
                  <p className="mt-1 text-xs italic text-zinc-300">
                    Matched: {ev.matched_text || "(no excerpt)"}
                  </p>
                  {ev.context_excerpt ? (
                    <blockquote className="mt-2 border-l-2 border-amber-500/60 pl-3 text-xs text-zinc-400">
                      {ev.context_excerpt}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Delivery attempts */}
        <section className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Delivery attempts
          </h2>
          {deliveries.length === 0 ? (
            <EmptyState text="No delivery attempts recorded." />
          ) : (
            <ul className="space-y-2">
              {deliveries.map((d) => (
                <DeliveryRow key={d.id} attempt={d} />
              ))}
            </ul>
          )}
        </section>

        {/* Handoff actions */}
        <section className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Handoff actions
          </h2>
          {handoffs.length === 0 ? (
            <EmptyState text="No handoffs considered for this call." />
          ) : (
            <ul className="space-y-2">
              {handoffs.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border border-zinc-800 bg-[#0E0E10] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                      {h.resource_name}
                    </span>
                    <time className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      {formatSgt(h.timestamp_sgt)}
                    </time>
                  </div>
                  {h.note ? (
                    <p className="mt-1 text-xs text-zinc-400">{h.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="px-1 pt-2 text-center text-[11px] text-zinc-500">
          Not a medical, emergency, or monitoring replacement.
        </p>
      </div>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-[#0E0E10] p-4 text-center text-xs text-zinc-500">
      {text}
    </div>
  );
}

function DeliveryRow({ attempt }: { attempt: DeliveryAttempt }) {
  const preview = attempt.error
    ? attempt.error
    : attempt.payload
      ? attempt.payload
      : "";
  return (
    <li className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-[#0E0E10] p-3">
      <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        {attempt.channel}
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${
          DELIVERY_TONE[attempt.status]
        }`}
      >
        {attempt.status}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{formatSgt(attempt.timestamp_sgt)}</p>
        {preview ? (
          <p
            className={`mt-1 truncate text-xs ${
              attempt.error ? "text-red-300" : "text-zinc-200"
            }`}
            title={preview}
          >
            {truncate(preview, 80)}
          </p>
        ) : null}
      </div>
    </li>
  );
}
