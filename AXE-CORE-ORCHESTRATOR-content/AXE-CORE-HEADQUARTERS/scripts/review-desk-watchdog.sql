-- Uitvoeren als databasebeheerder. Alleen ouderdom; geen externe broncontrole.
-- Geen nieuw model, proces, sleutel of publieke functie.
INSERT INTO public.core_schedules
  (name, cron_expr, timezone, action_type, action_payload, enabled, app, executor,
   job_key, description, metadata, max_runtime_s)
SELECT 'Website Review Desk: report watchdog', '*/10 * * * *', 'UTC', 'observed',
  '{}'::jsonb, true, 'axe_core', 'supabase', 'axe-review-desk-watchdog',
  'Checks private report freshness without AI. Alerts once on stale/recovery transitions. Does not read Gmail, Stripe or Sites.',
  '{"managed_by":"pg_cron","scope":"report_freshness","ai_calls":0}'::jsonb, 30
WHERE NOT EXISTS (SELECT 1 FROM public.core_schedules WHERE job_key='axe-review-desk-watchdog');

SELECT cron.schedule('axe-review-desk-watchdog', '*/10 * * * *', $command$
DO $watch$
DECLARE
  r record;
  observed timestamptz;
  stale boolean;
  previous_stale boolean;
  channels jsonb;
  reports integer := 0;
  stale_reports integer := 0;
  checked timestamptz := clock_timestamp();
  schedule_id uuid;
  result_text text;
BEGIN
  PERFORM set_config('statement_timeout','25000',true);
  PERFORM set_config('lock_timeout','3000',true);
  -- Eén uitvoerder, ook wanneer een beheerder tegelijkertijd test.
  IF NOT pg_try_advisory_xact_lock(hashtext('axe-review-desk-watchdog')) THEN RETURN; END IF;
  SELECT id INTO schedule_id FROM public.core_schedules
    WHERE job_key='axe-review-desk-watchdog' AND enabled LIMIT 1;
  IF schedule_id IS NULL THEN RETURN; END IF;

  FOR r IN SELECT user_id, value FROM public.user_settings
      WHERE key='axe_website_review_desk_v1' FOR UPDATE LOOP
    reports := reports + 1;
    BEGIN
      observed := (r.value->>'updatedAt')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      observed := NULL;
    END;
    stale := observed IS NULL OR observed < checked - interval '3 hours'
      OR observed > checked + interval '5 minutes';
    IF stale THEN stale_reports := stale_reports + 1; END IF;
    SELECT (value->>'stale')::boolean INTO previous_stale FROM public.user_settings
      WHERE user_id=r.user_id AND key='axe_website_review_watchdog_v1';

    IF stale AND previous_stale IS DISTINCT FROM true THEN
      INSERT INTO public.core_notifications(recipient,type,message)
      VALUES(r.user_id::text,'warning',
        'Website Review Desk: source report is over 3 hours old or has an invalid date. Check Finance and the source-check task. The watchdog does not refresh source data.');
    ELSIF NOT stale AND previous_stale = true THEN
      INSERT INTO public.core_notifications(recipient,type,message)
      VALUES(r.user_id::text,'info','Website Review Desk: a recent source report is available again.');
    END IF;

    INSERT INTO public.user_settings(user_id,key,value,updated_at)
    VALUES(r.user_id,'axe_website_review_watchdog_v1',
      jsonb_build_object('stale',stale,'checkedAt',checked,'sourceReportAt',observed,'aiCalls',0),checked)
    ON CONFLICT(user_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at;

    SELECT coalesce(jsonb_agg(c),'[]'::jsonb) INTO channels
      FROM jsonb_array_elements(coalesce(r.value->'channels','[]'::jsonb)) c
      WHERE c->>'name' IS DISTINCT FROM 'AXE Core report watchdog';
    channels := channels || jsonb_build_array(jsonb_build_object(
      'name','AXE Core report watchdog','asOf',checked,
      'status',CASE WHEN stale THEN 'ATTENTION: source report is stale or its date is invalid.'
        ELSE 'Source report is less than 3 hours old.' END ||
        ' Checked by the database every 10 minutes, without AI. External source checks remain separate.'));
    -- Cruciaal: updatedAt en alle bron-asOf-datums blijven ongewijzigd.
    UPDATE public.user_settings SET value=jsonb_set(value,'{channels}',channels),updated_at=checked
      WHERE user_id=r.user_id AND key='axe_website_review_desk_v1';
  END LOOP;

  result_text := format('Watchdog completed: %s report(s), %s stale. AI calls: 0. No external sources queried.',reports,stale_reports);
  UPDATE public.core_schedules SET last_run_at=checked,last_status=CASE WHEN reports=0 THEN 'fail' ELSE 'ok' END,
    last_result=result_text,updated_at=checked WHERE id=schedule_id;
  INSERT INTO public.core_job_runs(job_key,job_name,app,source,schedule_id,executor,trigger,
    started_at,finished_at,status,output,error,duration_ms,metadata)
  VALUES('axe-review-desk-watchdog','Website Review Desk: report watchdog','axe_core','schedule',schedule_id,
    'supabase','observed',checked,clock_timestamp(),CASE WHEN reports=0 THEN 'fail' ELSE 'ok' END,
    result_text,CASE WHEN reports=0 THEN 'No private report found.' ELSE NULL END,
    (extract(epoch FROM clock_timestamp()-checked)*1000)::integer,
    jsonb_build_object('reports',reports,'stale_reports',stale_reports,'ai_calls',0));
END;
$watch$;
$command$);
