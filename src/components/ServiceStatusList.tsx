import type { ServiceStatusMap } from "@/lib/env";

const LABELS: Record<keyof ServiceStatusMap, string> = {
  supabase: "Supabase",
  twilioVoice: "Twilio Voice",
  elevenlabs: "ElevenLabs",
  telegram: "Telegram",
  twilioSms: "Twilio SMS",
};

export function ServiceStatusList({ status }: { status: ServiceStatusMap }) {
  const entries = Object.entries(status) as Array<
    [keyof ServiceStatusMap, ServiceStatusMap[keyof ServiceStatusMap]]
  >;
  return (
    <ul className="space-y-2">
      {entries.map(([key, value]) => (
        <li
          key={key}
          className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2"
        >
          <span
            className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              value.configured ? "bg-emerald-500" : "bg-amber-500"
            }`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-900">
                {LABELS[key]}
              </span>
              <span
                className={`text-xs font-medium ${
                  value.configured ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {value.configured ? "Configured" : "Not configured"}
              </span>
            </div>
            {!value.configured && value.reason ? (
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {value.reason}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
