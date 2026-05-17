// VOL-151: Family-editable trigger rules — single-rule endpoint.
// DELETE -> remove a rule by id.
// Next.js 16: `params` is async and must be awaited.

import { NextResponse } from "next/server";
import { deleteRule } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing rule id" },
      { status: 400 },
    );
  }

  try {
    await deleteRule(id);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to delete rule",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
