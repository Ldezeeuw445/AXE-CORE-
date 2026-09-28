-- Trading autopilot: één cyclus tegelijk, over alle apparaten heen (22 sep 2026).
--
-- De autopilot had alleen een in-process vlag (cycleInFlight). De desktop-app,
-- de Android-build en straks de VPS-runner delen dezelfde instellingen en
-- dezelfde accounts; twee instanties die tegelijk wakker worden, zien dezelfde
-- "due" en draaien dezelfde cyclus — met dubbele orders als gevolg.
--
-- Deze tabel is een lease met een idempotentiesleutel:
--   holder     wie de cyclus nu draait ('desktop:…', 'android:…', 'vps:…')
--   expires_at tot wanneer; een gecrashte houder blokkeert hooguit tot dan
--   last_slot  de due-minuut van de laatst geclaimde cyclus; dezelfde slot
--              wordt nooit twee keer uitgegeven, ook niet na afloop van de lease
--   status     laatste statusregel van de houder (cyclus, fout, volgende due)
--
-- Claimen gaat alleen via try_autopilot_lease: één INSERT … ON CONFLICT … WHERE,
-- dus atomair in Postgres. Vernieuwen/vrijgeven is een gewone UPDATE met
-- holder = mij; daar valt niets te racen.

create table if not exists public.core_autopilot_lease (
  id           text primary key,
  user_id      uuid not null,
  holder       text not null,
  expires_at   timestamptz not null,
  last_slot    bigint,
  heartbeat_at timestamptz not null default now(),
  status       jsonb not null default '{}'::jsonb
);

alter table public.core_autopilot_lease enable row level security;
revoke all on public.core_autopilot_lease from anon;
grant select, insert, update on public.core_autopilot_lease to authenticated;

drop policy if exists luka_core_autopilot_lease on public.core_autopilot_lease;
create policy luka_core_autopilot_lease on public.core_autopilot_lease
  for all to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid and user_id = (select auth.uid()))
  with check ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid and user_id = (select auth.uid()));

-- security invoker: de RLS hierboven blijft gelden voor de app; de VPS-runner
-- gebruikt de service role en geeft p_user_id expliciet mee.
create or replace function public.try_autopilot_lease(
  p_id text,
  p_user_id uuid,
  p_holder text,
  p_ttl_seconds integer,
  p_slot bigint
)
returns table (acquired boolean, holder text, expires_at timestamptz, last_slot bigint)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  insert into public.core_autopilot_lease as l (id, user_id, holder, expires_at, last_slot, heartbeat_at)
  values (p_id, p_user_id, p_holder, now() + make_interval(secs => p_ttl_seconds), p_slot, now())
  on conflict (id) do update
    set holder = excluded.holder,
        expires_at = excluded.expires_at,
        last_slot = excluded.last_slot,
        heartbeat_at = now()
    where (l.expires_at <= now() or l.holder = excluded.holder)
      and (l.last_slot is null or l.last_slot < excluded.last_slot);

  return query
    select (l.holder = p_holder and l.last_slot = p_slot and l.expires_at > now()),
           l.holder, l.expires_at, l.last_slot
      from public.core_autopilot_lease l
     where l.id = p_id;
end;
$$;

revoke all on function public.try_autopilot_lease(text, uuid, text, integer, bigint) from public, anon;
grant execute on function public.try_autopilot_lease(text, uuid, text, integer, bigint) to authenticated, service_role;
