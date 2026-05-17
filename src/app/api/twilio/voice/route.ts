// GET /api/twilio/voice — TwiML endpoint Twilio fetches when the elder picks up.
// When ElevenLabs is configured we hand the call off to the agent via
// <Connect><ConversationRelay>. When it isn't, we fall back to a brief
// scripted check-in over <Say>/<Gather> so the call still completes safely.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env, serviceStatus } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Escape XML special characters so caller-supplied names cannot break TwiML.
function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twimlResponse(body: string): NextResponse {
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
  return new NextResponse(xmlBody, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

const FALLBACK_QUESTIONS: { prompt: string }[] = [
  { prompt: "How is your body feeling today? Any pain anywhere?" },
  { prompt: "Have you had any falls or dizziness recently?" },
  { prompt: "How did you sleep last night?" },
  { prompt: "Have you eaten today, and how is your appetite?" },
  { prompt: "Have you taken your medication as usual?" },
  { prompt: "Have you spoken with anyone today, or been feeling lonely?" },
];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const elderName = (params.get("elderName") ?? "").trim();
  const familyName = (params.get("familyName") ?? "").trim();
  const callId = params.get("callId") ?? "";

  const greetedName = elderName.length > 0 ? elderName : "there";
  const onBehalfOf =
    familyName.length > 0 ? `on behalf of ${familyName}` : "from your family";
  const opening = `Hi ${greetedName}, this is your daily check-in calling ${onBehalfOf}. I'd like to see how you're doing today.`;

  const status = serviceStatus();

  // Happy path: hand the call to ElevenLabs ConversationRelay.
  if (status.elevenlabs.configured && env.elevenlabs.agentId) {
    const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(
      env.elevenlabs.agentId,
    )}`;
    const body =
      `<Response>` +
      `<Say voice="Polly.Joanna">${xml(opening)}</Say>` +
      `<Connect>` +
      `<ConversationRelay url="${xml(wsUrl)}" welcomeGreeting="${xml(
        opening,
      )}" />` +
      `</Connect>` +
      `</Response>`;
    return twimlResponse(body);
  }

  // Fallback path: scripted Q&A so the call still completes when ElevenLabs is missing.
  // Each <Gather> records the response and proceeds; final <Say> wraps up.
  const actionBase = (env.publicAppUrl ?? "").replace(/\/$/, "");
  const parts: string[] = [];
  parts.push(`<Say voice="Polly.Joanna">${xml(opening)}</Say>`);

  for (let i = 0; i < FALLBACK_QUESTIONS.length; i++) {
    const q = FALLBACK_QUESTIONS[i];
    // Gather speech but ignore the action result — Twilio falls through to
    // the next <Gather>/<Say> when no action is provided.
    parts.push(
      `<Gather input="speech" speechTimeout="auto" timeout="6"` +
        (actionBase
          ? ` action="${xml(
              `${actionBase}/api/twilio/voice?callId=${encodeURIComponent(
                callId,
              )}&amp;step=${i + 1}`,
            )}" method="GET"`
          : "") +
        `>` +
        `<Say voice="Polly.Joanna">${xml(q.prompt)}</Say>` +
        `</Gather>`,
    );
    // Stop after the first question when we're chaining via action URLs to
    // avoid duplicating questions on each callback.
    if (actionBase) break;
  }

  parts.push(
    `<Say voice="Polly.Joanna">Thank you for sharing. We'll check in again soon. Goodbye.</Say>`,
  );
  parts.push(`<Hangup/>`);

  return twimlResponse(`<Response>${parts.join("")}</Response>`);
}

// Twilio sometimes posts to action URLs; respond with a graceful hangup.
export async function POST(request: NextRequest) {
  return GET(request);
}
