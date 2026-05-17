// Telegram Bot API sender for Call-Check-Loop alert deliveries.
//
// Used by the dispatcher (drains pending delivery_attempts rows) and by the
// /api/telegram/test endpoint. Never throws — missing creds or transport
// failures surface as `{ ok: false, error }` so callers can persist the
// failure on the delivery row.
import "server-only";
import { env } from "@/lib/env";
import { formatSgt, nowSgtISO } from "@/lib/sgt";
import type { TriggerEvent } from "@/lib/types";

const TELEGRAM_MESSAGE_MAX = 4096;

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface FormatAlertOptions {
  auditUrl?: string;
}

/**
 * Markdown-formatted alert message for a trigger event.
 *
 * Keeps the body under Telegram's 4096-char hard limit. Markdown special
 * characters in matched/context text are not escaped here because preset
 * rule output is plain-language text; if a future user-defined rule injects
 * an unbalanced `*` or `_` the message may render plain — that's acceptable
 * for the MVP and avoids an escape pass that could mangle real punctuation.
 */
export function formatAlertMessage(
  event: TriggerEvent,
  opts: FormatAlertOptions = {},
): string {
  const when = formatSgt(event.timestamp_sgt ?? nowSgtISO());
  const lines: string[] = [
    `*Call-Check-Loop alert — ${event.rule_name}*`,
    "",
    `Matched: _${event.matched_text || "(no excerpt)"}_`,
    `Context: ${event.context_excerpt || "(no context)"}`,
    "",
    `Recommended action: ${event.recommended_action || "Review with caregiver."}`,
    `Time (SGT): ${when}`,
  ];

  if (opts.auditUrl) {
    lines.push(`Audit: ${opts.auditUrl}`);
  }

  let message = lines.join("\n");
  if (message.length > TELEGRAM_MESSAGE_MAX) {
    message = `${message.slice(0, TELEGRAM_MESSAGE_MAX - 1)}…`;
  }
  return message;
}

/**
 * Posts a message to the configured Telegram chat via the Bot API.
 *
 * Never throws — credential or transport failures resolve to `{ ok: false }`.
 */
export async function sendTelegramMessage(text: string): Promise<SendResult> {
  const token = env.telegram.botToken;
  const chatId = env.telegram.chatId;

  if (!token || !chatId) {
    return { ok: false, error: "telegram_not_configured" };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const payload = (await res.json()) as { description?: string };
        detail = payload?.description ?? "";
      } catch {
        try {
          detail = await res.text();
        } catch {
          detail = "";
        }
      }
      const error = detail
        ? `telegram_http_${res.status}: ${detail}`
        : `telegram_http_${res.status}`;
      return { ok: false, status: res.status, error };
    }

    return { ok: true, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `telegram_fetch_failed: ${message}` };
  }
}
