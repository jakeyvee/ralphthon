# Call-Check-Loop — agent notes

Shared conventions for worktree agents picking up Linear tickets in this project.

## Stack

- **Next.js 16** (App Router) — **breaking changes from your training data**. Skim `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` before writing routes. Key gotchas:
  - `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are **async** — must be `await`ed.
  - Turbopack is default; no `--turbopack` flag needed.
  - `middleware` is renamed to `proxy` (but we don't use it).
  - No `next lint` — use ESLint CLI directly if needed.
- **React 19.2** via Next 16.
- **Tailwind v4** with `@tailwindcss/postcss`.
- **Supabase** — JS client only. Use `getBrowserSupabase()` / `getServerSupabase()` from `src/lib/supabase/`.

## File ownership (avoid merge conflicts)

| Area | Owned by |
|------|----------|
| `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/(*)/`, `src/components/` | **VOL-141** UI shell |
| `src/lib/db/`, `src/lib/supabase/*` (extensions), Supabase migrations, seeded rules | **VOL-149** DB persistence |
| `src/lib/scanner/`, `src/lib/rules/` | **VOL-142** rule scanner |
| `src/app/api/twilio/*`, `src/app/api/elevenlabs/*`, `src/app/api/calls/start/*` | **VOL-147** Twilio + ElevenLabs voice |
| `src/app/api/calls/[id]/chunks/*`, `src/lib/pipeline/*` | **VOL-144** trigger event pipeline |
| `src/app/api/simulator/*`, `src/lib/simulator/*` | **VOL-143** simulator |
| `src/app/api/rules/*`, `src/components/RulesEditor.tsx` | **VOL-151** editable rules |
| `src/app/api/telegram/*` | **VOL-145** |
| `src/app/api/sms/*` | **VOL-146** |
| `src/app/api/admin/reset/*` | **VOL-149/VOL-148** (reset already wired in repo) |
| Shared: `src/lib/types.ts`, `src/lib/env.ts`, `src/lib/sgt.ts`, `CLAUDE.md` | **DO NOT rewrite** — extend additively only |

## Conventions

- All UI timestamps are **SGT (Asia/Singapore, UTC+8)** — use `formatSgt()` and `nowSgtISO()` from `src/lib/sgt.ts`.
- All integrations must check `serviceStatus()` first and show a visible "not configured" state rather than throwing.
- Never claim medical diagnosis or automated clinical referral in copy.
- No auth, no roles, no scheduling/retry/voicemail, no billing — out of scope.

## Commands

```bash
npm run dev      # next dev (Turbopack)
npm run build    # next build
npm start        # next start
```

## Linear / git workflow

- Ticket branches use the `gitBranchName` Linear provides (e.g. `shayn-shin/vol-141-...`).
- One ticket per worktree, commit + push to remote branch.
- Maintainer merges to `main` locally and resolves conflicts.
