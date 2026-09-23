-- core_tasks en core_computer_workers waren open voor anon (ALL, true). De anon-sleutel
-- zit in elke app-build (Tauri, Android, web), dus wie hem uitlas kon taken op de Macs
-- zetten: bestanden lezen, npm draaien, claude_code.run.
--
-- Voorwaarden die vóór deze migratie gecontroleerd zijn (15 sep 2026):
--   - de computer-workers gebruiken de service-sleutel (commit 4b0d1a19); in de
--     Supabase-logs ging hun verkeer om 16:26 UTC van anon naar service_role;
--   - elke app-sessie van de laatste 3 dagen (Mac-app, Android, Samsung-webview) is
--     Luka's account; de VPS en de lokale API gebruiken al service_role.
--
-- Ingelogde toegang alleen voor Luka's account. service_role (policy service_role_only)
-- blijft ongewijzigd. Terugdraaien = de twee oude policies "ALL to anon/authenticated
-- using (true)" terugzetten, maar doe dat niet zonder de workers ook terug te zetten.

drop policy if exists anon_all_core_tasks on public.core_tasks;
drop policy if exists authenticated_all_core_tasks on public.core_tasks;
create policy luka_all_core_tasks on public.core_tasks
  for all to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid)
  with check ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);

drop policy if exists rw_core_computer_workers on public.core_computer_workers;
create policy luka_all_core_computer_workers on public.core_computer_workers
  for all to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid)
  with check ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);

alter table public.core_tasks enable row level security;
alter table public.core_computer_workers enable row level security;
