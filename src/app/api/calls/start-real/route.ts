// POST /api/calls/start-real
//
// Safety-gated wrapper around /api/calls/start. Computes deployment readiness
// first; if `ready` is false, returns the blockers without attempting any
// outbound Twilio request. Only forwards to the underlying /api/calls/start
// when every gate (creds + elder phone + consent) is satisfied.
//
// All responses are 200 — the `ok` field distinguishes success / blocked /
// downstream failure, matching the contract of /api/calls/start.
import { NextRequest, NextResponse } from "next/server";
import { computeReadiness } from "@/lib/deployment/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const readiness = await computeReadiness();
  if (!readiness.ready) {
    return NextResponse.json({
      ok: false,
      error: "Deployment readiness gate failed",
      blockers: readiness.blockers,
      mode: readiness.mode,
    });
  }

  const origin = request.nextUrl.origin;
  try {
    const upstream = await fetch(`${origin}/api/calls/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const data = (await upstream.json()) as Record<string, unknown>;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error:
        err instanceof Error
          ? `Failed to reach /api/calls/start: ${err.message}`
          : "Failed to reach /api/calls/start",
    });
  }
}
