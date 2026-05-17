// Memory updater for VOL-154.
//
// Pulls recent call activity from Supabase, compiles a non-clinical summary
// via `buildMemorySummary`, and persists it through the shared
// `getOrUpdateMemorySummary` helper. Never throws — failures surface as
// `{ ok: false, error }` for callers (API routes / future schedulers).
import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { getOrCreateElderConfig, getOrUpdateMemorySummary } from "@/lib/db/repo";
import {
  buildMemorySummary,
  type MemoryCallInput,
  type MemoryEventInput,
} from "@/lib/memory/summarizer";

const RECENT_CALL_LIMIT = 5;
const RECENT_EVENT_LIMIT = 50;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface UpdateMemoryResult {
  ok: boolean;
  summary: string;
  elderId?: string;
  error?: string;
}

interface CallRecentRow {
  id: string;
  status: string;
  source: string;
  started_at_sgt: string | null;
  created_at: string;
}

interface TriggerEventRecentRow {
  rule_name: string;
  call_id: string;
  created_at: string;
}

export async function updateMemoryForElder(
  elderId?: string,
): Promise<UpdateMemoryResult> {
  try {
    let resolvedElderId = elderId;
    if (!resolvedElderId) {
      const elder = await getOrCreateElderConfig();
      if (!elder) {
        return {
          ok: false,
          summary: "",
          error: "Elder config unavailable (Supabase likely not configured)",
        };
      }
      resolvedElderId = elder.id;
    }

    const supabase = getServerSupabase();
    if (!supabase) {
      return {
        ok: false,
        summary: "",
        elderId: resolvedElderId,
        error: "Supabase not configured",
      };
    }

    const sevenDaysAgoIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    const callsQ = supabase
      .from("calls")
      .select("id,status,source,started_at_sgt,created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_CALL_LIMIT);

    const eventsQ = supabase
      .from("trigger_events")
      .select("rule_name,call_id,created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_EVENT_LIMIT);

    const completedQ = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("created_at", sevenDaysAgoIso);

    const [callsRes, eventsRes, completedRes] = await Promise.all([
      callsQ,
      eventsQ,
      completedQ,
    ]);

    if (callsRes.error) {
      return {
        ok: false,
        summary: "",
        elderId: resolvedElderId,
        error: callsRes.error.message,
      };
    }
    if (eventsRes.error) {
      return {
        ok: false,
        summary: "",
        elderId: resolvedElderId,
        error: eventsRes.error.message,
      };
    }
    if (completedRes.error) {
      return {
        ok: false,
        summary: "",
        elderId: resolvedElderId,
        error: completedRes.error.message,
      };
    }

    const recentCalls: MemoryCallInput[] = ((callsRes.data ?? []) as CallRecentRow[]).map(
      (row) => ({
        id: row.id,
        status: row.status,
        source: row.source,
        started_at_sgt: row.started_at_sgt,
        created_at: row.created_at,
      }),
    );
    const recentEvents: MemoryEventInput[] = (
      (eventsRes.data ?? []) as TriggerEventRecentRow[]
    ).map((row) => ({
      rule_name: row.rule_name,
      call_id: row.call_id,
      created_at: row.created_at,
    }));
    const completedLast7Days = completedRes.count ?? 0;

    const summary = buildMemorySummary({
      recentCalls,
      recentEvents,
      completedLast7Days,
    });

    const persisted = await getOrUpdateMemorySummary(resolvedElderId, summary);
    if (!persisted) {
      return {
        ok: false,
        summary,
        elderId: resolvedElderId,
        error: "Failed to persist memory summary",
      };
    }

    return {
      ok: true,
      summary: persisted.summary,
      elderId: resolvedElderId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, summary: "", elderId, error: message };
  }
}
