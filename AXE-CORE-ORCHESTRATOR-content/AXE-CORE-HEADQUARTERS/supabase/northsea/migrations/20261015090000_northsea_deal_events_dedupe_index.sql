-- De rem van 6 okt (northsea_research_budget_event_once_per_day) zoekt per insert
-- in deal_events naar hetzelfde event van dezelfde dag. Zonder index is dat een
-- volledige scan, ~350 keer per uur zolang de oude engine draait. Dat hielp de
-- database op 11 okt omver (docs/programma/incidenten/2026-10-11-northsea-db.md).
--
-- Partieel: alleen de rijen die de rem leest. Niets verwijderd, niets herschreven.
-- Concurrently, zodat schrijvers niet wachten. Daarom niet in een transactie
-- draaien: los uitvoeren, niet via een migratie-runner die BEGIN/COMMIT eromheen zet.
--
-- Terugdraaien: drop index concurrently if exists public.deal_events_engine_dedupe_idx;
create index concurrently if not exists deal_events_engine_dedupe_idx
  on public.deal_events (event_type, opportunity_id, created_at)
  where actor = 'northsea-engine';
