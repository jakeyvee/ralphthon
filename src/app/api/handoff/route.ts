// VOL-152: AIC/SAGE handoff actions.
// POST -> record a handoff (validated with zod).
// GET  -> recent handoffs for the audit panel.

import { NextResponse } from "next/server";
import { z } from "zod";
import { recordHandoff } from "@/lib/db/repo";
import { getServerSupabase } from "@/lib/supabase/server";
import { nowSgtISO } from "@/lib/sgt";

export const dynamic = "force-dynamic";

const HandoffSchema = z.object({
  trigger_event_id: z.string().min(1).max(120).optional(),
  resource_name: z.string().min(1, "resource_name is required").max(120),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = HandoffSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        error: first
          ? `${first.path.join(".") || "handoff"}: ${first.message}`
          : "Invalid handoff",
      },
      { status: 400 },
    );
  }

  try {
    const { id } = await recordHandoff({
      trigger_event_id: parsed.data.trigger_event_id ?? null,
      resource_name: parsed.data.resource_name,
      note: parsed.data.note ?? null,
      timestamp_sgt: nowSgtISO(),
    });
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Handoff not persisted (Supabase not configured?)" },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, handoffId: id });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to record handoff",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ handoffs: [] });
  }
  const { data, error } = await supabase
    .from("handoff_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, handoffs: [] },
      { status: 500 },
    );
  }
  return NextResponse.json({ handoffs: data ?? [] });
}
