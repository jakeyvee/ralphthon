// Pure summary compiler for the longitudinal memory feature (VOL-154).
//
// Produces a short, factual, non-clinical paragraph describing recent contact
// history. No medical diagnosis language — keep tone neutral.
import { formatSgt } from "@/lib/sgt";

export interface MemoryCallInput {
  id: string;
  status: string;
  source: "real" | "simulator" | string;
  started_at_sgt: string | null;
  created_at: string;
}

export interface MemoryEventInput {
  rule_name: string;
  call_id: string;
  created_at: string;
}

export interface BuildMemorySummaryArgs {
  recentCalls: MemoryCallInput[];
  recentEvents: MemoryEventInput[];
  completedLast7Days: number;
}

const MAX_LEN = 500;
const NO_HISTORY_MESSAGE =
  "No prior calls yet — memory will populate after the first call.";

function clip(text: string): string {
  if (text.length <= MAX_LEN) return text;
  return `${text.slice(0, MAX_LEN - 1).trimEnd()}…`;
}

export function buildMemorySummary(args: BuildMemorySummaryArgs): string {
  const { recentCalls, recentEvents, completedLast7Days } = args;

  if (!recentCalls || recentCalls.length === 0) {
    return NO_HISTORY_MESSAGE;
  }

  const lastCompleted = recentCalls.find((c) => c.status === "completed");

  // Distinct trigger event rule names from the last 3 calls (by created_at desc).
  const lastThreeCallIds = new Set(recentCalls.slice(0, 3).map((c) => c.id));
  const distinctRuleNames: string[] = [];
  const seenRules = new Set<string>();
  for (const ev of recentEvents) {
    if (!lastThreeCallIds.has(ev.call_id)) continue;
    if (!ev.rule_name) continue;
    if (seenRules.has(ev.rule_name)) continue;
    seenRules.add(ev.rule_name);
    distinctRuleNames.push(ev.rule_name);
  }

  const sentences: string[] = [];

  if (lastCompleted && lastCompleted.started_at_sgt) {
    const when = formatSgt(lastCompleted.started_at_sgt);
    const source = lastCompleted.source === "simulator" ? "simulated" : "real";
    sentences.push(`Last successful contact: ${when} SGT (${source} call).`);
  } else {
    sentences.push("No successful contact recorded yet.");
  }

  if (distinctRuleNames.length > 0) {
    sentences.push(
      `Most recent concern flags: ${distinctRuleNames.join(", ")}.`,
    );
  } else {
    sentences.push("No concern flags raised in recent calls.");
  }

  sentences.push(
    `Total calls completed in last 7 days: ${completedLast7Days}.`,
  );

  return clip(sentences.join(" "));
}
