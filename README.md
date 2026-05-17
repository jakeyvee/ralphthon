# Call-Check-Loop

Daily voice check-in MVP for elders. Twilio places an outbound call, ElevenLabs handles the conversation, transcript chunks flow through a transparent rules engine, and matches escalate to the family via Telegram (and optionally SMS). Built for a 3-hour hackathon — every external integration has a visible "not configured" fallback.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
- Supabase Postgres (ralphthon org, project `dsifjuoycrnubsmxidoc`, `ap-southeast-1`)
- Twilio voice + SMS, ElevenLabs Conversational AI, Telegram Bot API

## Local dev

```bash
cp .env.example .env.local   # fill in credentials you have; rest will show fallback states
npm run dev                  # http://localhost:3000
```

## Linear

All work tracked under the **Call-Check-Loop Hackathon MVP** project in the Voltr Linear workspace (`VOL-141`…`VOL-154`).
