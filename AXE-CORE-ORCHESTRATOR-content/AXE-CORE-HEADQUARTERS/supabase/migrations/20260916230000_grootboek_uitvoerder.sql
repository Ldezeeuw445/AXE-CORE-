-- Grootboek: ook WAAR een run draaide (vps / mac / supabase), zodat "job op de Mac"
-- niet als "job op de VPS" in beeld komt. Zelfde bronnen als 20260916220000.
drop function if exists public.core_ledger(timestamptz, text, text, int);
create function public.core_ledger(p_since timestamptz default now() - interval '7 days', p_app text default null,
                                   p_source text default null, p_limit int default 500)
returns table (at timestamptz, app text, source text, kind text, name text, status text, duration_ms int, detail text, ref_id text, executor text)
language sql stable security definer set search_path = public, cron as $$
  select * from (
    select r.started_at, r.app, r.source, 'run'::text, r.job_name, r.status, r.duration_ms,
           left(coalesce(r.error, r.output, ''), 500), r.id::text, r.executor
      from public.core_job_runs r where r.started_at >= p_since
    union all
    select d.start_time, public.core_app_for_job(j.jobname), 'pg_cron', 'run', j.jobname,
           case d.status when 'succeeded' then 'ok' when 'failed' then 'fail' when 'running' then 'running' else d.status end,
           case when d.end_time is not null then (extract(epoch from (d.end_time - d.start_time)) * 1000)::int end,
           left(coalesce(d.return_message, ''), 500), 'pg_cron:' || d.runid, 'supabase'
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid where d.start_time >= p_since
    union all
    select coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at),
           case when t.metadata ->> 'app' in ('axe_core', 'axe_companion', 'trading_os', 'axon_memory', 'northsea') then t.metadata ->> 'app' else 'axe_core' end,
           'task', coalesce(nullif(t.capability, ''), 'task'), t.title, t.status,
           case when t.completed_at is not null and t.started_at is not null then (extract(epoch from (t.completed_at - t.started_at)) * 1000)::int end,
           left(coalesce(t.error::text, ''), 500), 'task:' || t.id, null::text
      from public.core_tasks t where coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at) >= p_since
  ) x(at, app, source, kind, name, status, duration_ms, detail, ref_id, executor)
  where (p_app is null or x.app = p_app) and (p_source is null or x.source = p_source)
  order by x.at desc
  limit greatest(least(p_limit, 2000), 1);
$$;
revoke all on function public.core_ledger(timestamptz, text, text, int) from public, anon, authenticated;
grant execute on function public.core_ledger(timestamptz, text, text, int) to service_role;
