// POST /api/memory/update
//
// Recomputes the longitudinal memory summary for an elder (singleton in MVP)
// and persists it via the shared repo helper. See VOL-154.
import { NextResponse } from "next/server";
import { updateMemoryForElder } from "@/lib/memory/updater";

interface UpdateMemoryBody {
  elderId?: string;
}

export async function POST(request: Request) {
  let body: UpdateMemoryBody = {};
  try {
    const parsed = (await request.json()) as UpdateMemoryBody | null;
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    // Empty / non-JSON bodies are fine — fall through with defaults.
  }

  const result = await updateMemoryForElder(body.elderId);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
