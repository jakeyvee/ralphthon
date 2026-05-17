"use client";

import { useEffect, useState, useTransition } from "react";
import type { ElderConfig } from "@/lib/types";
import type { ServiceStatusMap } from "@/lib/env";
import { saveConfig } from "@/app/actions/config";
import { ServiceStatusList } from "./ServiceStatusList";

const LOCAL_KEY = "ccl.elderConfig.v1";

type FlashState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

function defaultConfig(): Omit<ElderConfig, "id"> {
  return {
    elder_name: "",
    elder_phone: "",
    family_name: "",
    telegram_bot_token: "",
    telegram_chat_id: "",
    sms_recipients: [],
    daily_call_time_sgt: "08:30",
    consent_acknowledged: false,
  };
}

export function ConfigPanel({
  initialConfig,
  serviceStatus,
}: {
  initialConfig: Omit<ElderConfig, "id"> | null;
  serviceStatus: ServiceStatusMap;
}) {
  const [config, setConfig] = useState<Omit<ElderConfig, "id">>(
    initialConfig ?? defaultConfig(),
  );
  const [flash, setFlash] = useState<FlashState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  // Hydrate from localStorage if no server-side config arrived.
  useEffect(() => {
    if (initialConfig) return;
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Omit<ElderConfig, "id">;
        setConfig({ ...defaultConfig(), ...parsed });
      }
    } catch {
      // ignore
    }
  }, [initialConfig]);

  function update<K extends keyof Omit<ElderConfig, "id">>(
    key: K,
    value: Omit<ElderConfig, "id">[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setFlash({ kind: "saving" });
    startTransition(async () => {
      const result = await saveConfig(form);
      if (!result.ok) {
        setFlash({ kind: "error", message: result.error });
        return;
      }
      try {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(result.config));
      } catch {
        // ignore
      }
      setConfig(result.config);
      if (result.persisted) {
        setFlash({ kind: "success", message: "Config saved." });
      } else {
        setFlash({
          kind: "warning",
          message: "DB pending — values stored locally.",
        });
      }
    });
  }

  const smsText = config.sms_recipients.join("\n");

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Elder">
        <Field label="Elder name" htmlFor="elder_name">
          <input
            id="elder_name"
            name="elder_name"
            value={config.elder_name}
            onChange={(e) => update("elder_name", e.target.value)}
            type="text"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
            placeholder="e.g. Mdm Tan"
          />
        </Field>
        <Field label="Elder phone (E.164 preferred)" htmlFor="elder_phone">
          <input
            id="elder_phone"
            name="elder_phone"
            value={config.elder_phone}
            onChange={(e) => update("elder_phone", e.target.value)}
            type="tel"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
            placeholder="+6591234567"
          />
        </Field>
      </Section>

      <Section title="Family">
        <Field label="Family contact name" htmlFor="family_name">
          <input
            id="family_name"
            name="family_name"
            value={config.family_name}
            onChange={(e) => update("family_name", e.target.value)}
            type="text"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
            placeholder="e.g. Wei Ling"
          />
        </Field>
      </Section>

      <Section title="Telegram">
        <Field label="Bot token" htmlFor="telegram_bot_token">
          <input
            id="telegram_bot_token"
            name="telegram_bot_token"
            value={config.telegram_bot_token ?? ""}
            onChange={(e) => update("telegram_bot_token", e.target.value)}
            type="password"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
            placeholder="123456:ABC-..."
          />
        </Field>
        <Field label="Chat ID" htmlFor="telegram_chat_id">
          <input
            id="telegram_chat_id"
            name="telegram_chat_id"
            value={config.telegram_chat_id ?? ""}
            onChange={(e) => update("telegram_chat_id", e.target.value)}
            type="text"
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
            placeholder="-100..."
          />
        </Field>
      </Section>

      <Section title="SMS">
        <Field
          label="SMS recipients (one phone per line)"
          htmlFor="sms_recipients"
        >
          <textarea
            id="sms_recipients"
            name="sms_recipients"
            value={smsText}
            onChange={(e) =>
              update(
                "sms_recipients",
                e.target.value
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            rows={3}
            className="w-full rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
            placeholder={"+6591234567\n+6598765432"}
          />
        </Field>
      </Section>

      <Section title="Schedule">
        <Field
          label="Daily call time (SGT)"
          htmlFor="daily_call_time_sgt"
        >
          <input
            id="daily_call_time_sgt"
            name="daily_call_time_sgt"
            value={config.daily_call_time_sgt}
            onChange={(e) => update("daily_call_time_sgt", e.target.value)}
            type="time"
            className="rounded-lg border border-zinc-800 bg-[#0E0E10] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-[#818CF8] focus:outline-none"
          />
        </Field>
        <label className="mt-2 flex items-start gap-2 rounded-xl border border-zinc-800 bg-[#0E0E10] p-3 text-sm">
          <input
            type="checkbox"
            name="consent_acknowledged"
            checked={config.consent_acknowledged}
            onChange={(e) =>
              update("consent_acknowledged", e.target.checked)
            }
            className="mt-0.5"
          />
          <span className="text-zinc-300">
            I have explained to the elder and family that this tool makes
            voice check-ins, transcribes them, and notifies designated family
            contacts when listed phrases occur. This is not a medical,
            emergency, or monitoring replacement.
          </span>
        </label>
      </Section>

      <Section title="Service status">
        <ServiceStatusList status={serviceStatus} />
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-[#818CF8] px-4 py-2 text-sm font-medium text-zinc-950 shadow-sm hover:bg-indigo-400 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save config"}
        </button>
        <FlashBadge state={flash} />
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#18181C] p-6 shadow-none">
      <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function FlashBadge({ state }: { state: FlashState }) {
  if (state.kind === "idle" || state.kind === "saving") return null;
  const tone = {
    success: "bg-[#818CF8]/15 text-[#818CF8] border-[#818CF8]/40",
    warning: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    error: "bg-red-500/15 text-red-300 border-red-500/40",
  }[state.kind];
  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs font-medium ${tone}`}
      role="status"
    >
      {state.message}
    </span>
  );
}
