-- 26 nov: Trading OS "shared news ingest" stond 40x op rood terwijl hij werkte.
-- Het antwoord was {"ok":true, ... "sources":[{"source":"gdelt","ok":false,...}],
-- "upserted":192}: één bron faalde, de run niet. De oude regel zocht "ok":false
-- overal in het antwoord. Nu telt alleen de ok bovenaan; een run die zelf ok is
-- maar waar bronnen falen heet 'ok' met "some parts failing" in het resultaat.
-- Alleen de beoordeling verandert; geen tabel, geen data.
CREATE OR REPLACE FUNCTION public.trading_os_http_outcome(p_status_code integer, p_timed_out boolean, p_error_msg text, p_body_preview text)
 RETURNS TABLE(status text, result text, error text)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  preview text := left(coalesce(p_body_preview, ''), 512);
  safe_err text;
  body_fail boolean := false;
  deels boolean := false;
begin
  if p_error_msg ~* 'bearer|apikey|authorization|eyJ' then
    safe_err := 'upstream error (redacted)';
  else
    safe_err := nullif(left(trim(coalesce(p_error_msg, '')), 180), '');
  end if;

  if coalesce(p_timed_out, false) or (p_status_code is null and safe_err ilike '%time%out%') then
    status := 'timeout';
    result := 'http timeout';
    error := coalesce(safe_err, 'HTTP response timed out');
    return next;
    return;
  end if;

  if p_status_code is null then
    status := 'fail';
    result := 'http outcome unavailable';
    error := coalesce(safe_err, 'No HTTP status recorded');
    return next;
    return;
  end if;

  -- Alleen het bovenste niveau: {"ok":false ...} of {"status":"failed" ...} vooraan.
  body_fail :=
    preview ~* '^\s*\{\s*"ok"\s*:\s*false'
    or preview ~* '^\s*\{\s*"status"\s*:\s*"(failed|fail|error)"'
    or (preview !~* '^\s*\{\s*"ok"\s*:\s*true' and preview ~* 'not configured');
  -- Run ok, maar een onderdeel (bron) meldt ok:false.
  deels := not body_fail and preview ~* '"ok"\s*:\s*false';

  if p_status_code between 200 and 299 and not body_fail then
    status := 'ok';
    result := 'http ' || p_status_code || case when deels then ', some parts failing' else '' end;
    error := null;
  elsif p_status_code between 200 and 299 and body_fail then
    status := 'fail';
    result := 'http ' || p_status_code || ', body reported failure';
    error := 'HTTP ' || p_status_code || ' body indicated failure';
  else
    status := 'fail';
    result := 'http ' || p_status_code;
    error := coalesce(safe_err, 'HTTP ' || p_status_code);
  end if;
  return next;
end;
$function$;
