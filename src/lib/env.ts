// Centralized credential/env detection. Used by UI status indicators
// and integration entrypoints so missing creds show a clear fallback.

export type ServiceStatus = {
  configured: boolean;
  reason?: string;
};

function present(...values: (string | undefined)[]): boolean {
  return values.every((v) => typeof v === "string" && v.trim().length > 0);
}

export const env = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    smsFrom: process.env.TWILIO_SMS_FROM,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agentId: process.env.ELEVENLABS_AGENT_ID,
    agentPhoneNumberId: process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  publicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
} as const;

export function serviceStatus() {
  return {
    supabase: present(env.supabase.url, env.supabase.anonKey)
      ? { configured: true }
      : { configured: false, reason: "NEXT_PUBLIC_SUPABASE_URL/ANON_KEY missing" },
    twilioVoice: present(
      env.twilio.accountSid,
      env.twilio.authToken,
      env.twilio.fromNumber,
    )
      ? { configured: true }
      : { configured: false, reason: "Twilio voice credentials missing" },
    elevenlabs: present(env.elevenlabs.apiKey, env.elevenlabs.agentId)
      ? { configured: true }
      : { configured: false, reason: "ElevenLabs credentials missing" },
    telegram: present(env.telegram.botToken, env.telegram.chatId)
      ? { configured: true }
      : { configured: false, reason: "Telegram bot token / chat id missing" },
    twilioSms: present(
      env.twilio.accountSid,
      env.twilio.authToken,
      env.twilio.smsFrom,
    )
      ? { configured: true }
      : { configured: false, reason: "Twilio SMS credentials missing" },
  } satisfies Record<string, ServiceStatus>;
}

export type ServiceStatusMap = ReturnType<typeof serviceStatus>;
