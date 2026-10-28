-- Usage & Credits: per-app dagbudget en per-stoel caps, voor de load balancer.
--
-- NIET toepassen op live tot Luka het zegt. De API valt zonder deze tabel
-- terug op de catalogus in usage_credits.py, dus de view werkt al.
--
-- RLS: zelfde core_owner()-patroon als 20261028120000_core_anon_dicht.sql.
-- Geen anon-toegang. service_role (BYPASSRLS) leest via axe_api.

create or replace function public.core_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid
      and u.id = (select auth.uid())
      and u.is_anonymous is not true
  );
$$;

revoke all on function public.core_owner() from public;
revoke all on function public.core_owner() from anon;
grant execute on function public.core_owner() to authenticated;

create table if not exists public.core_usage_config (
  id text primary key,
  kind text not null check (kind in ('seat', 'app')),
  label text not null,
  family text,
  sessions_min integer not null default 0,
  sessions_max integer not null default 0,
  window_hours integer,
  sort_order integer not null default 0,
  notes text,
  updated_at timestamptz not null default now()
);

comment on table public.core_usage_config is
  'Indicative daily session budgets per coding seat and per app. Load balancer reads this.';

alter table public.core_usage_config enable row level security;

drop policy if exists luka_select_core_usage_config on public.core_usage_config;
drop policy if exists luka_insert_core_usage_config on public.core_usage_config;
drop policy if exists luka_update_core_usage_config on public.core_usage_config;
drop policy if exists luka_delete_core_usage_config on public.core_usage_config;
create policy luka_select_core_usage_config on public.core_usage_config
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_usage_config on public.core_usage_config
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_usage_config on public.core_usage_config
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_usage_config on public.core_usage_config
  for delete to authenticated using (public.core_owner());

revoke all on table public.core_usage_config from anon;
revoke all on table public.core_usage_config from authenticated;
grant select, insert, update, delete on table public.core_usage_config to authenticated;
grant select, insert, update, delete on table public.core_usage_config to service_role;

insert into public.core_usage_config
  (id, kind, label, family, sessions_min, sessions_max, window_hours, sort_order, notes)
values
  ('claude2', 'seat', 'Claude Pro 2', 'claude', 0, 3, 5, 10, '5-hour window, ~3 sessions/day'),
  ('claude3', 'seat', 'Claude Pro 3', 'claude', 0, 3, 5, 20, '5-hour window, ~3 sessions/day'),
  ('claude4', 'seat', 'Claude Pro 4', 'claude', 0, 3, 5, 30, '5-hour window, ~3 sessions/day'),
  ('codex', 'seat', 'ChatGPT Plus', 'chatgpt', 0, 2, null, 40, '~2 sessions/day'),
  ('codex2', 'seat', 'ChatGPT Plus 2', 'chatgpt', 0, 2, null, 50, '~2 sessions/day'),
  ('cursor', 'seat', 'Cursor Pro', 'cursor', 0, 3, null, 60, 'own Cursor account'),
  ('cursor2', 'seat', 'Cursor Pro 2', 'cursor', 0, 3, null, 70, 'second Cursor seat (CURSOR2_API_KEY)'),
  ('xai', 'seat', 'Grok (xAI)', 'grok', 0, 8, null, 80, 'VPS XAI_API_KEY; first of the Grok Bot twins'),
  ('xai2', 'seat', 'Grok Bot 2 (twins)', 'grok', 0, 8, null, 90, 'second Grok Bot account — not in core_coding_seats yet'),
  ('openhands', 'seat', 'OpenHands (VPS)', 'vps', 0, 24, null, 100, 'free VPS capacity for small/routine tasks'),
  ('ollama', 'seat', 'Qwen-coder (Ollama)', 'vps', 0, 24, null, 110, 'local Ollama on the VPS; small/routine only'),
  ('axe-core', 'app', 'AXE Core', null, 3, 3, null, 200, 'indicative daily budget'),
  ('axe-companion', 'app', 'AXE Companion', null, 2, 3, null, 210, 'indicative daily budget'),
  ('trading-os', 'app', 'Trading OS', null, 2, 3, null, 220, 'indicative daily budget'),
  ('axon-memory', 'app', 'AXON Memory', null, 1, 2, null, 230, 'indicative daily budget'),
  ('axe-developer', 'app', 'AXE Developer', null, 1, 2, null, 240, 'indicative daily budget')
on conflict (id) do nothing;
