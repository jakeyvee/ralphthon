-- Call-Check-Loop: initial schema
-- Hackathon project: no auth, permissive RLS for the anon role.

create extension if not exists "pgcrypto";

-- elder_config: singleton-row config table.
create table if not exists public.elder_config (
  id uuid primary key default gen_random_uuid(),
  elder_name text,
  elder_phone text,
  family_name text,
  telegram_bot_token text,
  telegram_chat_id text,
  sms_recipients text[] not null default '{}',
  daily_call_time_sgt text not null default '08:30',
  consent_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- calls: one row per phone (or simulator) call.
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid references public.elder_config(id) on delete set null,
  source text not null check (source in ('real','simulator')),
  status text not null,
  started_at_sgt text not null,
  ended_at_sgt text,
  twilio_call_sid text,
  created_at timestamptz not null default now()
);

-- transcript_chunks: ordered transcript per call.
create table if not exists public.transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  source text not null check (source in ('elder','agent','system')),
  text text not null,
  sequence int not null,
  timestamp_sgt text not null,
  created_at timestamptz not null default now()
);

-- rules: trigger rules (presets + user-defined).
create table if not exists public.rules (
  id text primary key,
  name text not null,
  patterns text[] not null default '{}',
  recommended_action text not null,
  enabled boolean not null default true,
  is_preset boolean not null default false,
  updated_at timestamptz not null default now()
);

-- rule_evaluations: per-chunk per-rule outcome.
create table if not exists public.rule_evaluations (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.transcript_chunks(id) on delete cascade,
  rule_id text not null references public.rules(id) on delete cascade,
  matched boolean not null,
  matched_text text,
  created_at timestamptz not null default now()
);

-- trigger_events: materialized "this rule fired on this chunk" events.
create table if not exists public.trigger_events (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  chunk_id uuid not null references public.transcript_chunks(id) on delete cascade,
  rule_id text references public.rules(id) on delete set null,
  rule_name text not null,
  matched_text text not null,
  context_excerpt text not null,
  recommended_action text not null,
  timestamp_sgt text not null,
  created_at timestamptz not null default now()
);

-- delivery_attempts: per-channel delivery audit.
create table if not exists public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  trigger_event_id uuid not null references public.trigger_events(id) on delete cascade,
  channel text not null check (channel in ('telegram','sms')),
  status text not null check (status in ('pending','sent','failed','preview')),
  error text,
  payload text,
  timestamp_sgt text not null,
  created_at timestamptz not null default now()
);

-- handoff_actions: human-facing follow-up resources (clinic call, etc.).
create table if not exists public.handoff_actions (
  id uuid primary key default gen_random_uuid(),
  trigger_event_id uuid references public.trigger_events(id) on delete cascade,
  resource_name text not null,
  note text,
  timestamp_sgt text not null,
  created_at timestamptz not null default now()
);

-- memory_summaries: rolling per-elder summary (one row per elder).
create table if not exists public.memory_summaries (
  elder_id uuid primary key references public.elder_config(id) on delete cascade,
  summary text not null,
  updated_at_sgt text not null
);

-- Indexes
create index if not exists transcript_chunks_call_seq_idx
  on public.transcript_chunks (call_id, sequence);
create index if not exists trigger_events_call_created_idx
  on public.trigger_events (call_id, created_at);
create index if not exists delivery_attempts_trigger_idx
  on public.delivery_attempts (trigger_event_id);

-- Enable RLS + permissive "allow all anon" policies (hackathon scope).
alter table public.elder_config       enable row level security;
alter table public.calls              enable row level security;
alter table public.transcript_chunks  enable row level security;
alter table public.rules              enable row level security;
alter table public.rule_evaluations   enable row level security;
alter table public.trigger_events     enable row level security;
alter table public.delivery_attempts  enable row level security;
alter table public.handoff_actions    enable row level security;
alter table public.memory_summaries   enable row level security;

create policy "allow all anon" on public.elder_config       for all to anon using (true) with check (true);
create policy "allow all anon" on public.calls              for all to anon using (true) with check (true);
create policy "allow all anon" on public.transcript_chunks  for all to anon using (true) with check (true);
create policy "allow all anon" on public.rules              for all to anon using (true) with check (true);
create policy "allow all anon" on public.rule_evaluations   for all to anon using (true) with check (true);
create policy "allow all anon" on public.trigger_events     for all to anon using (true) with check (true);
create policy "allow all anon" on public.delivery_attempts  for all to anon using (true) with check (true);
create policy "allow all anon" on public.handoff_actions    for all to anon using (true) with check (true);
create policy "allow all anon" on public.memory_summaries   for all to anon using (true) with check (true);

-- Also allow authenticated + service_role full access (matches anon).
create policy "allow all authenticated" on public.elder_config       for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.calls              for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.transcript_chunks  for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.rules              for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.rule_evaluations   for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.trigger_events     for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.delivery_attempts  for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.handoff_actions    for all to authenticated using (true) with check (true);
create policy "allow all authenticated" on public.memory_summaries   for all to authenticated using (true) with check (true);
