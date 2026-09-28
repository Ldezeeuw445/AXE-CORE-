-- core_schedules dicht voor anon/authenticated (16 sep 2026).
--
-- Het beleid svc_core_schedules gaf de rol `public` ALLES (using true, with check true)
-- en anon/authenticated hadden INSERT/UPDATE/DELETE. /cron/tick op de VPS voert rijen
-- met action_type 'exec' uit als shellcommando, en de API draait als root. Met alleen
-- de publieke Companion-sleutel kon iemand dus een commando op de VPS laten draaien.
-- De tabel was leeg en werd nooit rechtstreeks door een client gebruikt: alleen de
-- API (service role, omzeilt RLS) leest en schrijft hem.
drop policy if exists svc_core_schedules on public.core_schedules;
revoke all on public.core_schedules from anon, authenticated;
grant select on public.core_schedules to authenticated;
drop policy if exists luka_read_core_schedules on public.core_schedules;
create policy luka_read_core_schedules on public.core_schedules
  for select to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);
alter table public.core_schedules enable row level security;
