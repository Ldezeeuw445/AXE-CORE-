-- Provider-router: elke poging vastleggen + laatste succesvolle provider op de taak.
--
-- NIET toepassen op live tot Luka het zegt. De API valt zonder deze tabel
-- terug op core_tasks (payload.engine / metadata.motor); de router schrijft
-- pogingen alleen als de insert lukt. Geen VPS-deploy in deze PR.
--
-- RLS: core_owner(), geen anon. service_role (BYPASSRLS) schrijft via axe_api.

-- Herhaal core_owner() niet: die staat in 20261028120000_core_anon_dicht.sql
-- en 20261028133000_core_usage_config.sql. Deze migratie eist hem alleen.

alter table public.core_tasks
  add column if not exists provider_used text;

comment on column public.core_tasks.provider_used is
  'Laatste succesvolle provider/stoel van de router-keten. Home: draaide op: …';

create table if not exists public.core_task_attempts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.core_tasks(id) on delete cascade,
  poging integer not null default 1,
  provider text not null,
  seat_id text,
  model text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  uitkomst text,
  fout_klasse text,
  tokens integer,
  sessie text,
  fout text,
  created_at timestamptz not null default now()
);

create index if not exists idx_core_task_attempts_task
  on public.core_task_attempts (task_id, poging);
create index if not exists idx_core_task_attempts_provider
  on public.core_task_attempts (provider, started_at desc);

comment on table public.core_task_attempts is
  'Elke provider-poging van de router. Usage & Credits telt hieruit. Geen tokens/secrets in fouttekst.';

alter table public.core_task_attempts enable row level security;

drop policy if exists luka_select_core_task_attempts on public.core_task_attempts;
drop policy if exists luka_insert_core_task_attempts on public.core_task_attempts;
drop policy if exists luka_update_core_task_attempts on public.core_task_attempts;
drop policy if exists luka_delete_core_task_attempts on public.core_task_attempts;
create policy luka_select_core_task_attempts on public.core_task_attempts
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_task_attempts on public.core_task_attempts
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_task_attempts on public.core_task_attempts
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_task_attempts on public.core_task_attempts
  for delete to authenticated using (public.core_owner());

revoke all on table public.core_task_attempts from anon;
revoke all on table public.core_task_attempts from authenticated;
grant select, insert, update, delete on table public.core_task_attempts to authenticated;
grant select, insert, update, delete on table public.core_task_attempts to service_role;
