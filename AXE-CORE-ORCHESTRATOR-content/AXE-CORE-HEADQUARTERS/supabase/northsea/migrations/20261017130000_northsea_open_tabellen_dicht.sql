-- NS-N0-1 (docs/programma): RLS op AXE Commodities live bewijzen, en dichtzetten wat open stond.
--
-- Gemeten 17 okt als rol anon: alle dealtabellen (deal_events, contacts, opportunities,
-- action_queue, ...) geven 0 rijen; RLS staat aan zonder policies, dus dicht. Open waren:
--   hq_messages, hq_notes, hq_settings: policy "allow_all" voor public, ALL, using true.
--     Iedereen met de publieke sleutel kon lezen en schrijven; hq_settings heeft een kolom
--     api_key_encrypted. Alle drie leeg, en geen enkele repo leest of schrijft ze
--     (AXE-CORE-, northsea-commodity, northsea-crewai, AXE-COMPANION-OS-, axon-memory-app).
--   data_centers: "Allow insert" voor public. 49 openbare projectrijen, laatste insert 204
--     dagen geleden. Lezen blijft open (openbare gegevens, misschien een kaart ergens);
--     schrijven alleen nog met de service role.
--
-- De service role (northsea-mcp, edge functions) heeft BYPASSRLS en merkt hier niets van.

drop policy if exists "allow_all" on public.hq_messages;
drop policy if exists "allow_all" on public.hq_notes;
drop policy if exists "allow_all" on public.hq_settings;
revoke all on public.hq_messages, public.hq_notes, public.hq_settings from anon, authenticated;

drop policy if exists "Allow insert" on public.data_centers;
revoke insert, update, delete, truncate on public.data_centers from anon, authenticated;

-- Terugdraaien:
--   create policy "allow_all" on public.hq_messages for all to public using (true) with check (true);
--   (idem hq_notes, hq_settings) en grant all on die drie aan anon, authenticated;
--   create policy "Allow insert" on public.data_centers for insert to public with check (true);
--   grant insert on public.data_centers to anon, authenticated;
