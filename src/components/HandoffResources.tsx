"use client";

// VOL-152: AIC / SAGE handoff resources panel.
// Curated reference cards + per-trigger-event handoff logging.

import { useCallback, useMemo, useState } from "react";
import { formatSgt, nowSgtISO } from "@/lib/sgt";
import type { TriggerEvent } from "@/lib/types";

type Resource = {
  key: "AIC" | "SAGE";
  name: string;
  purpose: string;
  url: string;
  phone: string;
};

const RESOURCES: Record<"AIC" | "SAGE", Resource> = {
  AIC: {
    key: "AIC",
    name: "Agency for Integrated Care (AIC)",
    purpose: "Singapore's care coordination agency for seniors.",
    url: "https://www.aic.sg",
    phone: "1800-650-6060",
  },
  SAGE: {
    key: "SAGE",
    name: "SAGE — Seniors Helpline",
    purpose: "Free listening + signposting line for seniors.",
    url: "https://www.sagecc.org.sg",
    phone: "1800-555-5555",
  },
};

function pickResource(ruleName: string): Resource {
  const lower = ruleName.toLowerCase();
  if (lower.includes("loneliness") || lower.includes("lonely")) {
    return RESOURCES.SAGE;
  }
  return RESOURCES.AIC;
}

function buildHandoffNote(event: TriggerEvent, resource: Resource): string {
  return [
    `[SGT ${formatSgt(event.timestamp_sgt)}] ${event.rule_name} — ${event.recommended_action}`,
    `Excerpt: "${event.context_excerpt}"`,
    `Resource: ${resource.key} (${resource.url} / ${resource.phone})`,
  ].join("\n");
}

type LoggedHandoff = {
  resource_name: string;
  timestamp_sgt: string;
};

export function HandoffResources({
  triggerEvents,
}: {
  triggerEvents: TriggerEvent[];
}) {
  const [logged, setLogged] = useState<Record<string, LoggedHandoff>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((current) => (current === text ? null : current)), 1800);
  }, []);

  const eventRows = useMemo(
    () =>
      triggerEvents.map((event) => {
        const resource = pickResource(event.rule_name);
        return {
          event,
          resource,
          note: buildHandoffNote(event, resource),
        };
      }),
    [triggerEvents],
  );

  async function handleMark(
    event: TriggerEvent,
    resource: Resource,
    note: string,
  ) {
    if (pending[event.id] || logged[event.id]) return;
    setPending((p) => ({ ...p, [event.id]: true }));
    // Optimistic UI: stamp the row immediately.
    const optimistic: LoggedHandoff = {
      resource_name: resource.key,
      timestamp_sgt: nowSgtISO(),
    };
    setLogged((l) => ({ ...l, [event.id]: optimistic }));
    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trigger_event_id: event.id,
          resource_name: resource.key,
          note,
        }),
      });
      if (!res.ok) {
        showToast("Saved locally — server returned an error.");
      } else {
        showToast(`Handoff logged for ${resource.key}.`);
      }
    } catch {
      showToast("Saved locally — network error.");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[event.id];
        return next;
      });
    }
  }

  async function handleCopy(note: string) {
    try {
      await navigator.clipboard.writeText(note);
      showToast("Copied");
    } catch {
      showToast("Copy failed — clipboard unavailable.");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        AIC / SAGE handoff resources
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.values(RESOURCES) as Resource[]).map((r) => (
          <div
            key={r.key}
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
          >
            <p className="text-sm font-semibold text-zinc-900">{r.name}</p>
            <p className="mt-1 text-xs text-zinc-600">{r.purpose}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sky-700 hover:underline"
              >
                {r.url.replace(/^https?:\/\//, "")}
              </a>
              <span className="text-zinc-500">Tel: {r.phone}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {eventRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-3 text-center text-xs text-zinc-500">
            No trigger events yet — handoff actions will appear here when rules fire.
          </p>
        ) : (
          eventRows.map(({ event, resource, note }) => {
            const done = logged[event.id];
            const isPending = pending[event.id];
            return (
              <div
                key={event.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {event.rule_name}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatSgt(event.timestamp_sgt)} · matched resource{" "}
                    <span className="font-medium text-zinc-700">
                      {resource.key}
                    </span>
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-600">
                    &ldquo;{event.context_excerpt}&rdquo;
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {done ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Handoff logged · {formatSgt(done.timestamp_sgt)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleMark(event, resource, note)}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Mark handoff considered"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(note)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Copy handoff note
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {toast ? (
        <p className="mt-3 inline-block rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-800">
          {toast}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-zinc-500">
        Resource links only — not an automated clinical referral.
      </p>
    </div>
  );
}
