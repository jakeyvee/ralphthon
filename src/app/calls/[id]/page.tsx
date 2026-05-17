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
  elder: "bg-sky-100 text-sky-800",
  agent: "bg-violet-100 text-violet-800",
  system: "bg-zinc-200 text-zinc-700",
};

const DELIVERY_TONE: Record<DeliveryStatus, string> = {
  pending: "bg-zinc-100 text-zinc-700 border-zinc-200",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  preview: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const STATUS_TONE: Record<string, string> = {
  idle: "bg-zinc-100 text-zinc-700 border-zinc-200",
  queued: "bg-sky-50 text-sky-700 border-sky-200",
  ringing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  in_progress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-zinc-100 text-zinc-700 border-zinc-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
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
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-zinc-100 text-zinc-700 border-zinc-200";
  const statusTone =
    STATUS_TONE[call.status] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="space-y-4">
        {/* Header */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <Link
              href="/"
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              &larr; Back to dashboard
            </Link>
            <span className="text-[11px] uppercase tracking-wide text-zinc-400">
              Call audit
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${sourceTone}`}
            >
              source: {call.source}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusTone}`}
            >
              {call.status}
            </span>
            <span className="text-xs text-zinc-500">
              started {formatSgt(call.started_at_sgt)}
            </span>
            {call.ended_at_sgt ? (
              <span className="text-xs text-zinc-500">
                · ended {formatSgt(call.ended_at_sgt)}
              </span>
            ) : null}
          </div>
          <p
            className="mt-2 truncate font-mono text-[11px] text-zinc-500"
            title={call.id}
          >
            id: {call.id}
          </p>
        </section>

        {/* Transcript chunks */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Transcript chunks
          </h2>
          {chunks.length === 0 ? (
            <EmptyState text="No transcript chunks yet." />
          ) : (
            <ol className="space-y-2">
              {chunks.map((chunk) => (
                <li
                  key={chunk.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                        SPEAKER_TONE[chunk.source]
                      }`}
                    >
                      {chunk.source}
                    </span>
                    <time className="text-xs text-zinc-500">
                      {formatSgt(chunk.timestamp_sgt)}
                    </time>
                  </div>
                  <p className="text-sm text-zinc-800">{chunk.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Trigger events */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Trigger events
          </h2>
          {events.length === 0 ? (
            <EmptyState text="No triggers fired during this call." />
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/60 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-amber-900">
                      {ev.rule_name}
                    </span>
                    <time className="text-xs text-amber-800">
                      {formatSgt(ev.timestamp_sgt)}
                    </time>
                  </div>
                  <p className="text-xs text-zinc-800">
                    <span className="font-semibold">Recommended:</span>{" "}
                    {ev.recommended_action}
                  </p>
                  <p className="mt-1 text-xs italic text-zinc-700">
                    Matched: {ev.matched_text || "(no excerpt)"}
                  </p>
                  {ev.context_excerpt ? (
                    <blockquote className="mt-2 border-l-2 border-amber-300 pl-3 text-xs text-zinc-600">
                      {ev.context_excerpt}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Delivery attempts */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
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
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Handoff actions
          </h2>
          {handoffs.length === 0 ? (
            <EmptyState text="No handoffs considered for this call." />
          ) : (
            <ul className="space-y-2">
              {handoffs.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900">
                      {h.resource_name}
                    </span>
                    <time className="text-xs text-zinc-500">
                      {formatSgt(h.timestamp_sgt)}
                    </time>
                  </div>
                  {h.note ? (
                    <p className="mt-1 text-xs text-zinc-600">{h.note}</p>
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
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-4 text-center text-xs text-zinc-500">
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
    <li className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3">
      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium uppercase text-zinc-700">
        {attempt.channel}
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          DELIVERY_TONE[attempt.status]
        }`}
      >
        {attempt.status}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500">{formatSgt(attempt.timestamp_sgt)}</p>
        {preview ? (
          <p
            className={`mt-1 truncate text-xs ${
              attempt.error ? "text-rose-700" : "text-zinc-800"
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
