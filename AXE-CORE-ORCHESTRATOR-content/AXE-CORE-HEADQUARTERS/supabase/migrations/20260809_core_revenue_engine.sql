-- Demand Fusion Engine state (backend/axe_api/revenue/).
--
-- The engine's working copy is a local JSON file on the VPS so a cycle always
-- completes even when Supabase is unreachable; these tables are the durable
-- mirror pushed by revenue/store.py::SupabaseStore.sync().
--
-- Each table is a thin id + payload envelope on purpose: the shapes live in
-- revenue/models.py and change as the lexicon and rungs are tuned, and a
-- migration per field change would be pure friction for state that is rewritten
-- every cycle anyway. The columns that ARE promoted out of the payload are the
-- ones queried for dashboards (score, revenue, channel, occurred_at).

create table if not exists public.core_revenue_signals (
  id            text primary key,           -- stable_id('sig', …) — dedupes re-harvests
  source        text,
  url           text,
  posted_at     timestamptz,
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_core_revenue_signals_posted on public.core_revenue_signals (posted_at desc);

create table if not exists public.core_revenue_clusters (
  id            text primary key,           -- stable_id('clu', …)
  label         text,
  fusion_score  numeric,
  signal_count  integer,
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_core_revenue_clusters_score on public.core_revenue_clusters (fusion_score desc);

create table if not exists public.core_revenue_offers (
  id            text primary key,           -- stable_id('off', cluster_id)
  cluster_id    text,
  product_name  text,
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.core_revenue_assets (
  id            text primary key,           -- stable_id('ast', …)
  offer_id      text,
  channel       text,
  status        text default 'draft',       -- draft | approved | published
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_core_revenue_assets_channel on public.core_revenue_assets (channel, status);

-- The one table that holds money. Settled revenue only — pending and refunded
-- sales must never be written here, because every kill/scale decision and every
-- projection is computed from this table and nothing else.
create table if not exists public.core_revenue_ledger (
  id             text primary key,
  offer_id       text,
  tier_id        text,
  channel        text,
  reach          integer default 0,
  clicks         integer default 0,
  sales          integer default 0,
  revenue_cents  integer default 0,
  cost_cents     integer default 0,
  occurred_at    timestamptz default now(),
  payload        jsonb not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_core_revenue_ledger_when on public.core_revenue_ledger (occurred_at desc);
create index if not exists idx_core_revenue_ledger_channel on public.core_revenue_ledger (channel);

-- Allow the scheduler to run a Demand Fusion cycle. core_schedules.action_type
-- carries a CHECK constraint, so a new action_type needs the constraint
-- rewritten or every 'revenue' schedule insert fails at the database.
alter table public.core_schedules drop constraint if exists core_schedules_action_type_check;
alter table public.core_schedules add constraint core_schedules_action_type_check
  check (action_type in ('prompt', 'exec', 'webhook', 'crew', 'revenue'));

-- RLS on, service_role only — same posture as core_schedules. The browser never
-- touches these directly; everything goes through axe_api, which holds the
-- service-role key. Revenue data is the last thing that should be readable by
-- an anon client.
do $$
declare t text;
begin
  foreach t in array array[
    'core_revenue_signals', 'core_revenue_clusters', 'core_revenue_offers',
    'core_revenue_assets', 'core_revenue_ledger'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'svc_' || t
    ) then
      execute format('create policy %I on public.%I using (true)', 'svc_' || t, t);
    end if;
  end loop;
end $$;
