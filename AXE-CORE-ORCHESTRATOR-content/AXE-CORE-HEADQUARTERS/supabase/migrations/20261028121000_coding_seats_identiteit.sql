-- Identiteit en gebruik per codeer-stoel, zodat kaarten per account groeperen
-- en de router minste-gebruik eerst kan kiezen. Geen nieuwe tabel.

alter table public.core_coding_seats
  add column if not exists org_id text,
  add column if not exists runs_7d integer,
  add column if not exists used_week numeric,
  add column if not exists used_session numeric;

comment on column public.core_coding_seats.org_id is
  'ChatGPT-account-id of org, los van het e-mailadres. Geen tokens.';
comment on column public.core_coding_seats.runs_7d is
  'AXE-runs op deze CLI-map in de laatste 7 dagen. Proxy voor resterend quotum.';
