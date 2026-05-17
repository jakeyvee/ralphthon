import { ConfigPanel } from "@/components/ConfigPanel";
import { RulesEditor } from "@/components/RulesEditor";
import { AuditPanel, type AuditPanelInitial } from "@/components/AuditPanel";
import { FALLBACK_PRESET_RULES } from "@/components/fallback-rules";
import { serviceStatus } from "@/lib/env";
import type { ElderConfig, TriggerRule } from "@/lib/types";
import { getOrCreateElderConfig, listRules } from "@/lib/db/repo";
import { pingDb } from "@/lib/db/health";
import { PRESET_RULES } from "@/lib/rules/preset";

export const dynamic = "force-dynamic";

type LoadResult = {
  config: Omit<ElderConfig, "id"> | null;
  rules: TriggerRule[];
  audit: AuditPanelInitial | undefined;
  dbReady: boolean;
  rulesSource: "db" | "preset" | "fallback";
};

async function loadInitialState(): Promise<LoadResult> {
  const health = await pingDb();
  if (!health.ok) {
    return {
      config: null,
      rules: PRESET_RULES.length ? PRESET_RULES : FALLBACK_PRESET_RULES,
      audit: undefined,
      dbReady: false,
      rulesSource: PRESET_RULES.length ? "preset" : "fallback",
    };
  }

  const [config, dbRules] = await Promise.all([
    getOrCreateElderConfig().catch(() => null),
    listRules().catch(() => [] as TriggerRule[]),
  ]);

  const rules = dbRules.length ? dbRules : PRESET_RULES;
  return {
    config,
    rules,
    audit: undefined,
    dbReady: true,
    rulesSource: dbRules.length ? "db" : "preset",
  };
}

export default async function Home() {
  const status = serviceStatus();
  const { config, rules, audit, dbReady, rulesSource } =
    await loadInitialState();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Call-Check-Loop
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            One-screen control room for daily elder voice check-ins. Configure
            on the left, watch the call audit unfold on the right.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            ok={dbReady}
            okText="DB ready"
            warnText="DB not ready"
          />
          <StatusBadge
            ok={rulesSource !== "fallback"}
            okText={rulesSource === "db" ? "Rules from DB" : "Preset rules loaded"}
            warnText="Using fallback rules"
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,_22rem)_minmax(0,_1fr)]">
        <aside className="space-y-4">
          <ConfigPanel initialConfig={config} serviceStatus={status} />
          <RulesEditor initialRules={rules} />
        </aside>
        <section>
          <AuditPanel
            rules={rules}
            serviceStatus={status}
            initial={audit}
          />
        </section>
      </div>
    </main>
  );
}

function StatusBadge({
  ok,
  okText,
  warnText,
}: {
  ok: boolean;
  okText: string;
  warnText: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ok ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      {ok ? okText : warnText}
    </span>
  );
}
