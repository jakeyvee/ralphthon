// SMS sender — formatting + Twilio HTTP POST.
//
// Owned by VOL-146. Uses built-in fetch only (no SDK dependency).
// All error paths return a structured result rather than throwing so the
// dispatcher can record failures into delivery_attempts.
import "server-only";
import { env } from "@/lib/env";
import { formatSgt } from "@/lib/sgt";
import type { TriggerEvent } from "@/lib/types";

const SMS_MAX_CHARS = 320;

export interface SmsSendResult {
  ok: boolean;
  status?: number;
  error?: string;
  sid?: string;
}

export interface SmsSendArgs {
  to: string;
  body: string;
}

/**
 * Format a trigger event into a short SMS body (<=320 chars).
 *
 * Shape:
 *   "Call-Check-Loop alert: <rule_name>. Excerpt: '<excerpt>'. Action: <recommended_action>. (SGT <time>)"
 *
 * If the assembled string overflows SMS_MAX_CHARS we trim the excerpt first
 * (it is the variable-length field) and clip the whole string as a final
 * safety net.
 */
export function formatSmsMessage(event: TriggerEvent): string {
  const ruleName = (event.rule_name ?? "").trim() || "trigger";
  const action = (event.recommended_action ?? "").trim() || "Review with caregiver.";
  const excerptRaw = (event.context_excerpt ?? "").trim();
  const when = event.timestamp_sgt ? formatSgt(event.timestamp_sgt) : "";

  const suffix = when ? ` (SGT ${when})` : "";
  const head = `Call-Check-Loop alert: ${ruleName}. Excerpt: '`;
  const tail = `'. Action: ${action}.${suffix}`;

  const fixedLen = head.length + tail.length;
  const room = SMS_MAX_CHARS - fixedLen;

  let excerpt = excerptRaw;
  if (room <= 0) {
    // Fixed parts already overflow; assemble and clip below.
    excerpt = "";
  } else if (excerpt.length > room) {
    excerpt = excerpt.length > 1 ? `${excerpt.slice(0, Math.max(0, room - 1)).trimEnd()}…` : excerpt.slice(0, room);
  }

  const message = `${head}${excerpt}${tail}`;
  if (message.length <= SMS_MAX_CHARS) return message;
  return `${message.slice(0, SMS_MAX_CHARS - 1)}…`;
}

interface TwilioMessageResponse {
  sid?: string;
  message?: string;
  code?: number;
  status?: string;
}

/**
 * POST to Twilio's Messages REST endpoint.
 *
 * Returns a structured result; never throws.
 */
export async function sendTwilioSms(args: SmsSendArgs): Promise<SmsSendResult> {
  const { to, body } = args;
  const accountSid = env.twilio.accountSid;
  const authToken = env.twilio.authToken;
  const from = env.twilio.smsFrom;

  if (!accountSid || !authToken || !from) {
    return { ok: false, error: "Twilio SMS credentials missing" };
  }
  if (!to || !to.trim()) {
    return { ok: false, error: "Missing destination phone number" };
  }
  if (!body || !body.trim()) {
    return { ok: false, error: "Missing message body" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const params = new URLSearchParams();
  params.set("From", from);
  params.set("To", to);
  params.set("Body", body);

  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    let parsed: TwilioMessageResponse | null = null;
    try {
      parsed = (await resp.json()) as TwilioMessageResponse;
    } catch {
      parsed = null;
    }

    if (!resp.ok) {
      const msg =
        parsed?.message ??
        `Twilio responded with HTTP ${resp.status}${parsed?.code ? ` (code ${parsed.code})` : ""}`;
      return { ok: false, status: resp.status, error: msg };
    }

    return {
      ok: true,
      status: resp.status,
      sid: parsed?.sid,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `fetch failed: ${msg}` };
  }
}
