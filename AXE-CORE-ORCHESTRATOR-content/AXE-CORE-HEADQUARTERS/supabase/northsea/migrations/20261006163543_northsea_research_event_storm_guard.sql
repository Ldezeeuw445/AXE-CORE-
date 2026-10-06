-- Rem op herhaalde budgetmeldingen, ook zolang de oude worker nog draait.
-- Geen events verwijderen en geen onderzoek als uitgevoerd markeren.
create schema if not exists northsea_internal;
revoke all on schema northsea_internal from public, anon, authenticated;
grant usage on schema northsea_internal to service_role;

create or replace function northsea_internal.dedupe_research_budget_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  day_start timestamptz;
begin
  day_start := date_trunc('day', new.created_at at time zone 'UTC') at time zone 'UTC';
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'northsea-budget:' || coalesce(new.opportunity_id::text, '') || ':' ||
    coalesce(new.metadata->>'blocker_code', '') || ':' || day_start::text, 0));
  if exists (
    select 1 from public.deal_events e
    where e.event_type = new.event_type and e.actor = new.actor
      and e.opportunity_id is not distinct from new.opportunity_id
      and coalesce(e.metadata->>'blocker_code', '') = coalesce(new.metadata->>'blocker_code', '')
      and e.created_at >= day_start and e.created_at < day_start + interval '1 day'
  ) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function northsea_internal.dedupe_research_budget_event() from public, anon, authenticated;
grant execute on function northsea_internal.dedupe_research_budget_event() to service_role;

create trigger northsea_research_budget_event_once_per_day
before insert on public.deal_events
for each row
when (new.event_type = 'research_budget_exhausted_today' and new.actor = 'northsea-engine')
execute function northsea_internal.dedupe_research_budget_event();
