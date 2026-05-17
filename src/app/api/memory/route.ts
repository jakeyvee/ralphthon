// GET /api/memory
//
// Returns the current longitudinal memory summary for the singleton elder.
// If no summary exists yet, triggers a one-shot compute via the updater so
// the panel always renders something useful on first load. See VOL-154.
import { NextResponse } from "next/server";
import { getOrCreateElderConfig, getOrUpdateMemorySummary } from "@/lib/db/repo";
import { updateMemoryForElder } from "@/lib/memory/updater";
import type { MemorySummary } from "@/lib/types";

export async function GET() {
  try {
    const elder = await getOrCreateElderConfig();
    if (!elder) {
      return NextResponse.json(
        { ok: true, memory: null as MemorySummary | null },
        { status: 200 },
      );
    }

    let memory = await getOrUpdateMemorySummary(elder.id);
    if (!memory) {
      const updated = await updateMemoryForElder(elder.id);
      if (updated.ok) {
        memory = await getOrUpdateMemorySummary(elder.id);
      }
    }

    return NextResponse.json(
      { ok: true, memory: memory ?? null },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, memory: null as MemorySummary | null },
      { status: 500 },
    );
  }
}
