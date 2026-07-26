-- AXE self-hosted scheduler (replaces the n8n dependency for cron).
-- Schedules live in Postgres; a CRON_KEY-secured /cron/tick on the VPS runs the
-- due ones. No third-party account, no n8n API-key 401 — AXE owns it end to end.

create table if not exists public.core_schedules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  cron_expr       text not null,                 -- standard 5-field cron (min hour dom mon dow)
  timezone        text not null default 'UTC',
  action_type     text not null default 'prompt'
                  check (action_type in ('prompt', 'exec', 'webhook', 'crew')),
  action_payload  jsonb not null default '{}'::jsonb,
  enabled         boolean not null default true,
  next_run_at     timestamptz,                   -- computed by the API from cron_expr
  last_run_at     timestamptz,
  last_status     text,                          -- 'ok' | 'fail'
  last_result     text,                          -- truncated output of the last run
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_schedules_due
  on public.core_schedules (enabled, next_run_at);

-- keep updated_at fresh (reuse the pattern from the control-plane migration)
create or replace function public.touch_core_schedules_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_core_schedules_updated_at on public.core_schedules;
create trigger trg_core_schedules_updated_at
  before update on public.core_schedules
  for each row execute function public.touch_core_schedules_updated_at();

alter table public.core_schedules enable row level security;

-- service_role (the axe_api key) bypasses RLS; this policy is a no-op guard so
-- the anon/authed browser client can't read schedules directly. All access is
-- through the axe_api proxy, which uses the service role.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'core_schedules' and policyname = 'svc_core_schedules'
  ) then
    create policy svc_core_schedules on public.core_schedules using (true);
  end if;
end $$;
