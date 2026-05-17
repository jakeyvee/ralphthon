// POST /api/admin/reset
//
// Wipes all demo state (calls, chunks, evaluations, trigger events,
// deliveries, handoffs). Rules and elder config survive — see
// `resetDemoData` in src/lib/db/repo.ts.
import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/db/repo";

export async function POST() {
  try {
    await resetDemoData();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
