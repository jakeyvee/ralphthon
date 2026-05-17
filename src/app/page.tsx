import { ConfigPanel } from "@/components/ConfigPanel";
import { RulesEditor } from "@/components/RulesEditor";
import { AuditPanel, type AuditPanelInitial } from "@/components/AuditPanel";
import { FALLBACK_PRESET_RULES } from "@/components/fallback-rules";
import { RealDeploymentPanel } from "@/components/RealDeploymentPanel";
import { serviceStatus } from "@/lib/env";
import type { ElderConfig, TriggerRule } from "@/lib/types";
import { getOrCreateElderConfig, listRules } from "@/lib/db/repo";
import { pingDb } from "@/lib/db/health";
import { PRESET_RULES } from "@/lib/rules/preset";
import { computeReadiness, type Readiness } from "@/lib/deployment/readiness";

export const dynamic = "force-dynamic";

type LoadResult = {
  config: Omit<ElderConfig, "id"> | null;
  rules: TriggerRule[];
  audit: AuditPanelInitial | undefined;
  dbReady: boolean;
  rulesSource: "db" | "preset" | "fallback";
  readiness: Readiness;
};

async function loadInitialState(): Promise<LoadResult> {
  const health = await pingDb();
  const readiness = await computeReadiness();
  if (!health.ok) {
    return {
      config: null,
      rules: PRESET_RULES.length ? PRESET_RULES : FALLBACK_PRESET_RULES,
      audit: undefined,
      dbReady: false,
      rulesSource: PRESET_RULES.length ? "preset" : "fallback",
      readiness,
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
    readiness,
  };
}

export default async function Home() {
  const status = serviceStatus();
  const { config, rules, audit, dbReady, rulesSource, readiness } =
    await loadInitialState();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-5xl font-medium leading-[1.04] tracking-tight text-[#111827]">
            Nurse Joy <span aria-hidden>👩‍⚕️🌸</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[#4B5563]">
            🏥 One-screen nurse station for daily elder voice check-ins.
            Configure on the left, watch the call audit unfold on the right.
          </p>
          <p className="mt-2 max-w-2xl text-sm font-medium text-[#E65C00]">
            🛎️ The key is not just that it alerts. The family can see exactly why.
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
          <RealDeploymentPanel initialReadiness={readiness} elderName={config?.elder_name ?? ""} />
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
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F7F4EB] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider font-semibold ${
        ok ? "text-emerald-700" : "text-amber-700"
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
