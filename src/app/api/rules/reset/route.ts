// VOL-151: Family-editable trigger rules — reset endpoint.
// POST -> wipe rules table and reinsert preset rules.

import { NextResponse } from "next/server";
import { listRules, resetRulesToPreset } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await resetRulesToPreset();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to reset rules",
      },
      { status: 500 },
    );
  }

  // Report the preset count by reading fresh state — keeps us decoupled from
  // the preset list (owned by other tickets per CLAUDE.md ownership map).
  const rules = await listRules().catch(() => []);
  return NextResponse.json({ ok: true, count: rules.length });
}
