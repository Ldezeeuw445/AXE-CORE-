-- Grootboek klopt weer (Luka 23 nov: "de ledger was goed maar is stuk").
-- core_ledger kapt op 2000 regels; de minuut-crons vullen die al in ~16 uur, dus
-- "7 dagen" toonde minder dan een dag en de tellers per app klopten niet.
-- Additief: twee nieuwe functies, core_ledger blijft zoals hij is.

-- Tellers over het HELE venster, per app / bron / status.
create or replace function public.core_ledger_stand(p_since timestamptz default now() - interval '7 days', p_source text default null)
returns table(app text, source text, status text, n bigint, laatste_at timestamptz, laatste_fout_naam text, laatste_fout_at timestamptz)
language sql stable security definer
set search_path to 'public', 'cron'
as $$
  with x(at, app, source, name, status) as (
    select r.started_at, r.app, r.source, r.job_name, r.status from public.core_job_runs r where r.started_at >= p_since
    union all
    select d.start_time, public.core_app_for_job(j.jobname), 'pg_cron', j.jobname,
           case d.status when 'succeeded' then 'ok' when 'failed' then 'fail' when 'running' then 'running' else d.status end
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid where d.start_time >= p_since
    union all
    select coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at),
           case when t.metadata ->> 'app' in ('axe_core', 'axe_companion', 'trading_os', 'axon_memory', 'northsea') then t.metadata ->> 'app' else 'axe_core' end,
           'task', t.title, t.status
      from public.core_tasks t where coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at) >= p_since
  ), f as (
    select x.app, x.source, x.status, x.name, x.at,
           row_number() over (partition by x.app, x.source, x.status order by x.at desc) rn
      from x where (p_source is null or x.source = p_source)
  )
  select f.app, f.source, f.status, count(*)::bigint, max(f.at),
         max(case when f.rn = 1 then f.name end), max(case when f.rn = 1 then f.at end)
    from f group by f.app, f.source, f.status;
$$;

-- Regels zonder de gelukte routine-crons (die staan wel in de tellers). Het filter
-- zit vóór de limiet, anders vullen de minuut-crons de 2000 alsnog.
create or replace function public.core_ledger_belangrijk(p_since timestamptz default now() - interval '7 days', p_app text default null,
                                                        p_source text default null, p_limit integer default 500,
                                                        p_alleen_fout boolean default false)
returns table(at timestamptz, app text, source text, kind text, name text, status text, duration_ms integer, detail text, ref_id text, executor text)
language sql stable security definer
set search_path to 'public', 'cron'
as $$
  select * from (
    select r.started_at, r.app, r.source, 'run'::text, r.job_name, r.status, r.duration_ms,
           left(coalesce(r.error, r.output, ''), 500), r.id::text, r.executor
      from public.core_job_runs r where r.started_at >= p_since
    union all
    select d.start_time, public.core_app_for_job(j.jobname), 'pg_cron', 'run', j.jobname,
           case d.status when 'succeeded' then 'ok' when 'failed' then 'fail' when 'running' then 'running' else d.status end,
           case when d.end_time is not null then (extract(epoch from (d.end_time - d.start_time)) * 1000)::int end,
           left(coalesce(d.return_message, ''), 500), 'pg_cron:' || d.runid, 'supabase'
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where d.start_time >= p_since and d.status <> 'succeeded'
    union all
    select coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at),
           case when t.metadata ->> 'app' in ('axe_core', 'axe_companion', 'trading_os', 'axon_memory', 'northsea') then t.metadata ->> 'app' else 'axe_core' end,
           'task', coalesce(nullif(t.capability, ''), 'task'), t.title, t.status,
           case when t.completed_at is not null and t.started_at is not null then (extract(epoch from (t.completed_at - t.started_at)) * 1000)::int end,
           left(coalesce(t.error::text, ''), 500), 'task:' || t.id, null::text
      from public.core_tasks t where coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at) >= p_since
  ) x(at, app, source, kind, name, status, duration_ms, detail, ref_id, executor)
  where (p_app is null or x.app = p_app) and (p_source is null or x.source = p_source)
    and (not p_alleen_fout or x.status in ('fail', 'failed', 'error', 'blocked', 'timeout'))
  order by x.at desc
  limit greatest(least(p_limit, 2000), 1);
$$;

revoke all on function public.core_ledger_stand(timestamptz, text) from public, anon, authenticated;
revoke all on function public.core_ledger_belangrijk(timestamptz, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.core_ledger_stand(timestamptz, text) to service_role;
grant execute on function public.core_ledger_belangrijk(timestamptz, text, text, integer, boolean) to service_role;
