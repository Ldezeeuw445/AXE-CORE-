-- Home v5 (Luka 25 nov): cron-runs per app per uur, op de server geteld.
-- core_job_runs schrijft ~4.100 regels per 24 uur; de REST-API geeft er per
-- verzoek hooguit 1.000 terug, dus Home telde een willekeurige greep. Deze
-- functie telt alles en geeft hooguit (apps x uren) regels terug.
--
-- Additief: één nieuwe functie, geen tabel- of policy-wijziging.
-- security invoker: de bestaande RLS op core_job_runs (luka_read_core_job_runs)
-- blijft gelden, dus alleen Luka's sessie ziet tellers; anon krijgt niets.
--
-- NIET automatisch toegepast. Toepassen na de merge (Supabase SQL editor of
-- `supabase db push`); tot dan valt Home terug op de oude, gemaximeerde query.

create or replace function public.core_job_runs_per_uur(p_uren integer default 24)
returns table(app text, uur timestamptz, ok integer, fout integer)
language sql stable security invoker
set search_path to 'public'
as $$
  select coalesce(r.app, 'axe_core') as app,
         date_trunc('hour', r.started_at) as uur,
         (count(*) filter (where r.status not in ('fail', 'failed', 'error', 'timeout')))::int as ok,
         (count(*) filter (where r.status in ('fail', 'failed', 'error', 'timeout')))::int as fout
    from public.core_job_runs r
   where r.started_at >= date_trunc('hour', now()) - make_interval(hours => greatest(least(p_uren, 168), 1) - 1)
   group by 1, 2
   order by 2, 1;
$$;

revoke all on function public.core_job_runs_per_uur(integer) from public, anon;
grant execute on function public.core_job_runs_per_uur(integer) to authenticated, service_role;
