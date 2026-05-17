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
  elder: "bg-[#FFB380]/30 text-[#9A3412] border border-[#FFB380]",
  agent: "bg-[#E65C00]/15 text-[#E65C00] border border-[#E65C00]/40",
  system: "bg-[#E5E7EB] text-[#4B5563] border border-[#E5E7EB]",
};

const DELIVERY_TONE: Record<DeliveryStatus, string> = {
  pending: "bg-[#E5E7EB] text-[#4B5563] border-[#E5E7EB]",
  sent: "bg-[#E65C00]/15 text-[#E65C00] border-[#E65C00]/40",
  failed: "bg-red-100 text-red-700 border-red-300",
  preview: "bg-[#FFB380]/30 text-[#9A3412] border-[#FFB380]",
};

const STATUS_TONE: Record<string, string> = {
  idle: "bg-[#E5E7EB] text-[#4B5563] border-[#E5E7EB]",
  queued: "bg-[#E65C00]/15 text-[#E65C00] border-[#E65C00]/40",
  ringing: "bg-[#E65C00]/15 text-[#E65C00] border-[#E65C00]/40",
  in_progress: "bg-emerald-100 text-emerald-700 border-emerald-300",
  completed: "bg-[#E5E7EB] text-[#4B5563] border-[#E5E7EB]",
  failed: "bg-red-100 text-red-700 border-red-300",
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
      ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : "bg-[#E5E7EB] text-[#4B5563] border-[#E5E7EB]";
  const statusTone =
    STATUS_TONE[call.status] ?? "bg-[#E5E7EB] text-[#4B5563] border-[#E5E7EB]";

  return (
    <main className="mx-auto w-full max-w-4xl bg-[#FDFBF7] px-4 py-6 sm:px-6">
      <div className="space-y-4">
        {/* Header */}
        <section className="rounded-2xl border border-[#E5E7EB] bg-[#F7F4EB] p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <Link
              href="/"
              className="text-xs font-medium text-[#4B5563] hover:text-[#111827]"
            >
              &larr; Back to Nurse Joy
            </Link>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4B5563]">
              🩺 Call audit
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
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#4B5563]">
              started {formatSgt(call.started_at_sgt)}
            </span>
            {call.ended_at_sgt ? (
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#4B5563]">
                · ended {formatSgt(call.ended_at_sgt)}
              </span>
            ) : null}
          </div>
          <p
            className="mt-2 truncate font-mono text-[11px] text-[#E65C00]"
            title={call.id}
          >
            id: {call.id}
          </p>
        </section>

        {/* Transcript chunks */}
        <section className="rounded-2xl border border-[#E5E7EB] bg-[#F7F4EB] p-6 shadow-sm">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
            💬 Transcript chunks
          </h2>
          {chunks.length === 0 ? (
            <EmptyState text="No transcript chunks yet." />
          ) : (
            <ol className="space-y-2">
              {chunks.map((chunk) => (
                <li
                  key={chunk.id}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${
                        SPEAKER_TONE[chunk.source]
                      }`}
                    >
                      {chunk.source}
                    </span>
                    <time className="font-mono text-[11px] uppercase tracking-wider text-[#4B5563]">
                      {formatSgt(chunk.timestamp_sgt)}
                    </time>
                  </div>
                  <p className="text-sm text-[#111827]">{chunk.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Trigger events */}
        <section className="rounded-2xl border border-[#E5E7EB] bg-[#F7F4EB] p-6 shadow-sm">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
            🚨 Trigger events
          </h2>
          {events.length === 0 ? (
            <EmptyState text="No triggers fired during this call." />
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-amber-300 bg-amber-50 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-amber-800">
                      {ev.rule_name}
                    </span>
                    <time className="font-mono text-[11px] uppercase tracking-wider text-amber-700/80">
                      {formatSgt(ev.timestamp_sgt)}
                    </time>
                  </div>
                  <p className="text-xs text-[#111827]">
                    <span className="font-semibold">Recommended:</span>{" "}
                    {ev.recommended_action}
                  </p>
                  <p className="mt-1 text-xs italic text-[#4B5563]">
                    Matched: {ev.matched_text || "(no excerpt)"}
                  </p>
                  {ev.context_excerpt ? (
                    <blockquote className="mt-2 border-l-2 border-amber-500/60 pl-3 text-xs text-[#4B5563]">
                      {ev.context_excerpt}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Delivery attempts */}
        <section className="rounded-2xl border border-[#E5E7EB] bg-[#F7F4EB] p-6 shadow-sm">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
            📬 Delivery attempts
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
        <section className="rounded-2xl border border-[#E5E7EB] bg-[#F7F4EB] p-6 shadow-sm">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
            🤝 Handoff actions
          </h2>
          {handoffs.length === 0 ? (
            <EmptyState text="No handoffs considered for this call." />
          ) : (
            <ul className="space-y-2">
              {handoffs.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#111827]">
                      {h.resource_name}
                    </span>
                    <time className="font-mono text-[11px] uppercase tracking-wider text-[#4B5563]">
                      {formatSgt(h.timestamp_sgt)}
                    </time>
                  </div>
                  {h.note ? (
                    <p className="mt-1 text-xs text-[#4B5563]">{h.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="px-1 pt-2 text-center text-[11px] text-[#4B5563]">
          Not a medical, emergency, or monitoring replacement.
        </p>
      </div>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-white p-4 text-center text-xs text-[#4B5563]">
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
    <li className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3">
      <span className="rounded-full border border-[#E5E7EB] bg-[#F7F4EB] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4B5563]">
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
        <p className="font-mono text-[11px] uppercase tracking-wider text-[#4B5563]">{formatSgt(attempt.timestamp_sgt)}</p>
        {preview ? (
          <p
            className={`mt-1 truncate text-xs ${
              attempt.error ? "text-red-700" : "text-[#111827]"
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
