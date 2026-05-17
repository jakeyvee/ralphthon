// POST /api/telegram/test
//
// Static-message smoke test for the Telegram integration. Used by the
// settings UI (VOL-141) and during demo to verify creds before going live.
// Never throws — credential or transport failures come back as JSON so the
// caller can render a clear "not configured" / "Telegram said X" state.
import { NextResponse } from "next/server";
import { serviceStatus } from "@/lib/env";
import { formatSgt, nowSgtISO } from "@/lib/sgt";
import { sendTelegramMessage } from "@/lib/telegram/sender";

export async function POST() {
  const status = serviceStatus().telegram;
  if (!status.configured) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        reason: status.reason ?? "Telegram bot token / chat id missing",
      },
      { status: 200 },
    );
  }

  const when = formatSgt(nowSgtISO());
  const message = `Call-Check-Loop test alert — sent at ${when}. This is a delivery test from the family control room.`;

  const telegramResult = await sendTelegramMessage(message);

  return NextResponse.json(
    {
      ok: telegramResult.ok,
      status: telegramResult.ok ? "sent" : "failed",
      telegramResult,
    },
    { status: 200 },
  );
}
