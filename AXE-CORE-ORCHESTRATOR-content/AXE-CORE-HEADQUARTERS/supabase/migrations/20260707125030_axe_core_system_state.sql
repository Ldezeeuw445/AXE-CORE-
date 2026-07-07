-- ============================================================
-- core_system_state
-- Real-time health registry for every service CORE depends on.
-- CORE reads this to answer "is LiveKit online?", etc.
-- ============================================================

create table if not exists public.core_system_state (
  id          uuid primary key default gen_random_uuid(),
  service     text not null unique,          -- e.g. 'livekit', 'n8n', 'supabase'
  display     text not null,                 -- e.g. 'LiveKit Cloud'
  status      text not null default 'unknown'
              check (status in ('online','degraded','offline','unknown')),
  health      jsonb default '{}'::jsonb,     -- extra health data (latency, version, etc.)
  version     text,
  last_seen   timestamptz,
  latency_ms  integer,
  enabled     boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- RLS: readable by authenticated users, writable by service role only
alter table public.core_system_state enable row level security;

create policy "read system state" on public.core_system_state
  for select using (auth.role() = 'authenticated');

-- Index for quick lookups
create index if not exists idx_system_state_service
  on public.core_system_state (service);

-- ── Seed initial services ────────────────────────────────────────────────
insert into public.core_system_state (service, display, status, enabled) values
  ('supabase',       'Supabase',          'unknown', true),
  ('livekit',        'LiveKit Cloud',     'unknown', true),
  ('n8n',            'n8n Automation',    'unknown', true),
  ('github',         'GitHub API',        'unknown', true),
  ('ollama',         'Ollama (VPS)',       'unknown', true),
  ('openrouter',     'OpenRouter',        'unknown', true),
  ('gemini',         'Gemini',            'unknown', true),
  ('axe_companion',  'AXE Companion OS',  'unknown', true),
  ('axe_intel',      'AXE Intel',         'unknown', true),
  ('trading_os',     'Trading OS',        'unknown', true)
on conflict (service) do nothing;

-- ── Updated_at trigger ────────────────────────────────────────────────────
create or replace function public.touch_system_state()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_system_state_updated
  before update on public.core_system_state
  for each row execute function public.touch_system_state();
