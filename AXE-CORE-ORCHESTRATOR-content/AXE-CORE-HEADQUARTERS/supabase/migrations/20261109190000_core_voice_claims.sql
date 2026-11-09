-- ADR-01 "Eén stem in de kamer" (9 nov 2026).
-- Elk apparaat dat het wekwoord of de klap hoort, zet hier een claim. De VPS
-- draait twee workers; daarom geen scheidsrechter in het geheugen maar deze
-- rijen: elke worker rekent uit dezelfde rijen dezelfde winnaar uit
-- (backend/axe_api/stem_vloer.py). Alleen de service-rol schrijft en leest.
create table if not exists public.core_voice_claims (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  device_name text,
  trigger text not null default 'wake' check (trigger in ('wake', 'clap', 'button')),
  idle_s double precision,
  won boolean,
  created_at timestamptz not null default now()
);

create index if not exists core_voice_claims_created_at_idx
  on public.core_voice_claims (created_at desc);

alter table public.core_voice_claims enable row level security;

-- Alleen de VPS (service-rol) schrijft en leest; de app gaat via /voice/claim.
revoke all on table public.core_voice_claims from anon;
revoke all on table public.core_voice_claims from authenticated;
grant select, insert, update, delete on table public.core_voice_claims to service_role;
