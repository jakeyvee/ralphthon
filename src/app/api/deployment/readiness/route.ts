// GET /api/deployment/readiness
//
// Returns the current deployment readiness payload combining service
// credentials, elder config, and consent acknowledgement. Always 200 — even
// when not ready — so the UI can render the checklist without error handling
// for the happy path.
import { NextResponse } from "next/server";
import { computeReadiness } from "@/lib/deployment/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await computeReadiness();
  return NextResponse.json({ ok: true, readiness });
}
