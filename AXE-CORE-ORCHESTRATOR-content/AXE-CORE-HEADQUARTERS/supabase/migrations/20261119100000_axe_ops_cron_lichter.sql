-- 19 nov 2026: de AXE-database (pqnngpcgbdwxavbatbia) liep vast op schijf-IO.
-- Twee eigen bewakingsjobs draaiden elke minuut / elke 2 min voor 0,35–0,5 s
-- (en onder druk tot 100 s). Lichter zetten; de trading-stops
-- (dispatch_cron trailing-stops / paper-stops) blijven ongemoeid.
do $$
declare j record;
begin
  for j in select jobid, command from cron.job loop
    if j.command ilike '%collect_cron_runs%' then
      perform cron.alter_job(j.jobid, schedule => '*/10 * * * *');
    elsif j.command ilike '%uptime_check%' and j.command not ilike '%dispatch_cron%' then
      perform cron.alter_job(j.jobid, schedule => '*/15 * * * *');
    end if;
  end loop;
end $$;

-- Cron-geschiedenis groeit elke minuut; drie dagen is genoeg.
delete from cron.job_run_details where end_time < now() - interval '3 days';
