// GET /api/elevenlabs/signed-url — return a short-lived signed conversation
// URL so downstream subscribers (e.g. VOL-150 transcript stream) can connect
// directly to the ElevenLabs agent WebSocket without exposing the API key.
import { NextResponse } from "next/server";
import { env, serviceStatus } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = serviceStatus();
  if (!status.elevenlabs.configured) {
    return NextResponse.json(
      { error: "ElevenLabs credentials missing" },
      { status: 503 },
    );
  }

  const apiKey = env.elevenlabs.apiKey as string;
  const agentId = env.elevenlabs.agentId as string;

  const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(
    agentId,
  )}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "ElevenLabs request failed",
      },
      { status: 502 },
    );
  }

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: `ElevenLabs ${res.status}: ${text.slice(0, 500)}` },
      { status: 502 },
    );
  }

  try {
    const parsed = JSON.parse(text) as { signed_url?: string };
    if (!parsed.signed_url) {
      return NextResponse.json(
        { error: "ElevenLabs response missing signed_url" },
        { status: 502 },
      );
    }
    return NextResponse.json({ signed_url: parsed.signed_url });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse ElevenLabs response" },
      { status: 502 },
    );
  }
}
