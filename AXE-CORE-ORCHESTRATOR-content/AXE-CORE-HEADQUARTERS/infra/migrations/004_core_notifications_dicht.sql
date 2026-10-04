-- core_notifications dicht voor anon, zoals core_tasks sinds 15 sep.
--
-- ## Waarom nu
--
-- De tabel had twee policies voor iedereen: `anon_all_core_notifications` (rol anon,
-- using true) en `svc_core_notifications` (rol public, using true -- en public
-- omvat anon). Gemeten op 4 okt 2026 met alleen de PUBLIEKE anon-sleutel, die in
-- elke webbundel zit: alle 449 meldingen waren leesbaar, en schrijven (insert,
-- update, delete) mocht ook.
--
-- Tot 4 okt was dat een lek van lezen. Sinds `push_meldingen.py` deze tabel naar je
-- slotscherm duwt is het ook een deur om VALSE meldingen op je telefoon te zetten:
-- wie een rij met een eigen titel invoegt, krijgt die binnen een minuut op je
-- slotscherm, met een tik die de app opent. Een tabel die een slotscherm voedt
-- hoort niet open te staan.
--
-- ## Wie er wel bij moet
--
-- - De backend en de CLI schrijven met de service role (omzeilt RLS) -- die houdt
--   `service_role_only`, net als core_tasks en core_approvals.
-- - De app (browser/Tauri/PWA) leest via realtime en schrijft een enkele melding
--   (axeBootstrap, trustLevelsService, memoryManagerService, dailyBriefing) met de
--   sessie van Luka, rol authenticated. Daarvoor `luka_all_core_notifications`,
--   hetzelfde patroon en dezelfde user-id als `luka_all_core_tasks`.
-- - Geen ander product leest of schrijft deze tabel (AXE Companion niet, nagekeken).
--
-- Terugdraaien, als er toch iets blijkt te breken:
--   create policy anon_all_core_notifications on public.core_notifications
--     for all to anon using (true) with check (true);
--
-- Eén opdracht per aanroep toepassen: in één keer doorduwen loopt op dit project in
-- een timeout en past dan niets toe (zie 002_push_meldingen.sql).

drop policy if exists anon_all_core_notifications on public.core_notifications;

drop policy if exists svc_core_notifications on public.core_notifications;

create policy luka_all_core_notifications on public.core_notifications
  for all to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid)
  with check ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);

create policy service_role_only on public.core_notifications
  for all to service_role using (true) with check (true);
