// VOL-151: Family-editable trigger rules — collection endpoint.
// GET  -> list all rules (DB-backed)
// POST -> upsert a rule (validated with zod)

import { NextResponse } from "next/server";
import { z } from "zod";
import type { TriggerRule } from "@/lib/types";
import { listRules, upsertRule } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

const RuleSchema = z.object({
  id: z
    .string()
    .min(1, "id is required")
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/, "id may contain letters, numbers, _ or -"),
  name: z.string().min(1, "name is required").max(120),
  patterns: z
    .array(z.string().min(1).max(200))
    .min(1, "at least one pattern is required"),
  recommended_action: z
    .string()
    .min(1, "recommended_action is required")
    .max(500),
  enabled: z.boolean(),
  is_preset: z.boolean(),
});

export async function GET() {
  const rules = await listRules().catch(() => [] as TriggerRule[]);
  return NextResponse.json({ rules });
}

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

  const parsed = RuleSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        error: first
          ? `${first.path.join(".") || "rule"}: ${first.message}`
          : "Invalid rule",
      },
      { status: 400 },
    );
  }

  const rule: TriggerRule = {
    id: parsed.data.id.trim(),
    name: parsed.data.name.trim(),
    patterns: parsed.data.patterns
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
    recommended_action: parsed.data.recommended_action.trim(),
    enabled: parsed.data.enabled,
    is_preset: parsed.data.is_preset,
  };

  if (rule.patterns.length === 0) {
    return NextResponse.json(
      { ok: false, error: "patterns: at least one non-empty pattern required" },
      { status: 400 },
    );
  }

  try {
    await upsertRule(rule);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to save rule",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, rule });
}
