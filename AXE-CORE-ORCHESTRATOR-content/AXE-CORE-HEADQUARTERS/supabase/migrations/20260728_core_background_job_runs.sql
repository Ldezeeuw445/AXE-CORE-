-- Atomic claim table for server-side background jobs (memory decay, nightly
-- self-review) run from /cron/tick. Without this, two uvicorn workers can
-- both see a job as "due" on ticks a few seconds apart (the pass itself
-- takes ~90s, cron fires every 60s) and both run it concurrently — observed
-- in production on 2026-07-28: two workers hit Ollama and inserted duplicate
-- core_conversation_reviews rows for the same exchanges. A primary key
-- violation on (job_name, run_key) is a real atomic claim regardless of
-- which worker/connection gets there first — unlike a read-then-write
-- "does a marker exist" check, which has a race window between the read
-- and the write.
create table if not exists public.core_background_job_runs (
  job_name   text not null,
  run_key    text not null,
  claimed_at timestamptz not null default now(),
  primary key (job_name, run_key)
);

alter table public.core_background_job_runs enable row level security;

drop policy if exists "service_role_only" on public.core_background_job_runs;
create policy "service_role_only" on public.core_background_job_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
