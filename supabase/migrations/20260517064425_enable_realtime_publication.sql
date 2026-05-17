-- VOL-155: ensure the supabase_realtime publication exists and broadcasts the
-- tables AuditPanel subscribes to. Idempotent — safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  t text;
  targets text[] := array[
    'calls',
    'transcript_chunks',
    'rule_evaluations',
    'trigger_events',
    'delivery_attempts',
    'handoff_actions',
    'memory_summaries'
  ];
begin
  foreach t in array targets loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
