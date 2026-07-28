-- Server-side equivalent of memoryDecayService.ts's runMemoryDecayPass(),
-- scheduled with pg_cron so it runs whether or not the Tauri app is open —
-- part of making AXE "always awake", not just active while a window is up.
-- Mirrors the JS logic exactly: exponential decay (30-day half-life) on
-- entries untouched >3 days, prune below 0.12 confidence for entries whose
-- last touch is >=14 days old (excluding user_preference), log a report
-- note into core_obsidian_notes just like the JS version does.
--
-- Applied live via Supabase MCP on 2026-07-28 (project already has pg_cron
-- 1.6.4 and pg_net 0.20.0 enabled); this file documents that for local
-- dev / history. Verified with a manual `select run_memory_decay_pass();`
-- call, which correctly wrote a real report note to core_obsidian_notes.

create or replace function public.run_memory_decay_pass()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanned int := 0;
  v_decayed int := 0;
  v_pruned int := 0;
  v_half_life_days numeric := 30;
  v_prune_below numeric := 0.12;
  v_min_age_days numeric := 14;
  v_now timestamptz := now();
  v_report jsonb;
  v_note_path text;
begin
  select count(*) into v_scanned from global_memory;

  with candidates as (
    select id, confidence,
           extract(epoch from (v_now - updated_at)) / 86400.0 as age_days
    from global_memory
    where category is distinct from 'user_preference'
  ),
  to_prune as (
    select id from candidates
    where age_days > 3
      and greatest(0, confidence * power(0.5, age_days / v_half_life_days)) < v_prune_below
      and age_days >= v_min_age_days
  ),
  deleted as (
    delete from global_memory where id in (select id from to_prune)
    returning id
  )
  select count(*) into v_pruned from deleted;

  with decayed as (
    update global_memory
    set confidence = greatest(0, confidence * power(0.5, (extract(epoch from (v_now - updated_at)) / 86400.0) / v_half_life_days)),
        updated_at = v_now
    where extract(epoch from (v_now - updated_at)) / 86400.0 > 3
    returning id
  )
  select count(*) into v_decayed from decayed;

  v_report := jsonb_build_object(
    'scanned', v_scanned, 'decayed', v_decayed, 'pruned', v_pruned, 'at', v_now
  );

  v_note_path := 'AXE/System/memory-decay-' || to_char(v_now, 'YYYY-MM-DD') || '-pgcron.md';
  insert into core_obsidian_notes (path, title, content, tags, source, metadata)
  values (
    v_note_path,
    'Memory decay ' || to_char(v_now, 'YYYY-MM-DD') || ' (pg_cron)',
    E'## Memory decay pass (server-side, pg_cron)\n**At:** ' || v_now::text ||
    E'\n**Scanned:** ' || v_scanned ||
    E'\n**Decayed:** ' || v_decayed ||
    E'\n**Pruned:** ' || v_pruned ||
    E'\n\n[[Memory]] [[System]]',
    array['system','memory-decay','pg_cron'],
    'system',
    v_report
  )
  on conflict (path) do update set content = excluded.content, metadata = excluded.metadata, updated_at = now();

  return v_report;
end;
$$;

-- Weekly, Sunday 03:00 UTC — matches the JS bootstrap's "> 7 days" cadence.
select cron.schedule(
  'axe-memory-decay-weekly',
  '0 3 * * 0',
  $$select public.run_memory_decay_pass();$$
);
