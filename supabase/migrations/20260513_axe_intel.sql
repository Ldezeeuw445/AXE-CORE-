-- AXE Intel mirror table for Trading OS
-- Run in Supabase Studio (SQL Editor) or via `supabase db push`.
-- This table stores each AXE Intelligence sweep snapshot so the Trading OS
-- Intel tab can read the latest intelligence even if the AXE backend is
-- temporarily offline. Designed to be append-only with idempotent upsert
-- on sweep_id; old rows are pruned by a scheduled cron.

create table if not exists public.axe_intel (
    id              uuid primary key default gen_random_uuid(),
    sweep_id        text not null unique,
    created_at      timestamptz not null default now(),
    sweep_started_at timestamptz,
    -- structured intel (every field is jsonb for forward-compat)
    agent_status    jsonb not null default '{}'::jsonb,
    market_impact   jsonb not null default '{}'::jsonb,
    correlation     jsonb,
    intel_digest    jsonb not null default '{}'::jsonb,
    source_health   jsonb not null default '{}'::jsonb,
    raw_counts      jsonb not null default '{}'::jsonb,
    -- full snapshot for any future use
    payload         jsonb not null
);

comment on table public.axe_intel is
    'AXE Intelligence Terminal snapshots mirrored from the Emergent backend.';

create index if not exists axe_intel_created_at_idx
    on public.axe_intel (created_at desc);

create index if not exists axe_intel_alert_level_idx
    on public.axe_intel ((market_impact ->> 'alert_level'));

-- Convenience view: latest snapshot only
create or replace view public.axe_intel_latest as
select *
from public.axe_intel
order by created_at desc
limit 1;

comment on view public.axe_intel_latest is
    'Always-fresh latest AXE Intel snapshot, used by the Trading OS Intel tab.';

-- Helper function — fetch latest with optional region filter
create or replace function public.axe_intel_get_latest()
returns axe_intel
language sql
stable
security definer
as $$
    select *
    from public.axe_intel
    order by created_at desc
    limit 1
$$;

-- Row Level Security — read for anon, no writes from anon
alter table public.axe_intel enable row level security;

drop policy if exists axe_intel_read_anon on public.axe_intel;
create policy axe_intel_read_anon on public.axe_intel
    for select
    using (true);

-- Retention: keep last 500 snapshots, prune older
-- (Run as scheduled cron from Supabase 'Database -> Cron')
create or replace function public.axe_intel_prune()
returns void
language plpgsql
as $$
begin
    delete from public.axe_intel
    where id in (
        select id from public.axe_intel
        order by created_at desc
        offset 500
    );
end
$$;

-- Realtime: enable for Trading OS to subscribe to live updates
alter publication supabase_realtime add table public.axe_intel;
