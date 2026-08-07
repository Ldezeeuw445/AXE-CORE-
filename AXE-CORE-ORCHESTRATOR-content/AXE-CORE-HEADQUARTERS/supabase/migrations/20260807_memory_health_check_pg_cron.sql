-- Server-side twin of memoryManagerService.ts's checkMemoryHealth() — runs
-- hourly via pg_cron so the check also happens when the app is closed,
-- mirroring run_memory_decay_pass() from 20260728_memory_decay_pg_cron.sql.
--
-- Checks the exact class of bug the memory funnel just got fixed for: a
-- write path that looks connected in code but silently produces zero rows.
-- Writes a core_obsidian_notes report only when something looks off
-- (health != 'ok') — a healthy hour writes nothing, so this doesn't add
-- noise to the memory stream on its own.

create or replace function public.run_memory_health_check()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_chat int := 0;
  v_recent_conv_memories int := 0;
  v_total_global int := 0;
  v_total_rag int := 0;
  v_total_notes int := 0;
  v_issues text[] := '{}';
  v_health text := 'ok';
  v_now timestamptz := now();
  v_since timestamptz := now() - interval '24 hours';
  v_report jsonb;
  v_note_path text;
begin
  select count(*) into v_recent_chat from public.messages where created_at > v_since;
  select count(*) into v_recent_conv_memories
    from public.global_memory
    where category = 'conversation_context' and created_at > v_since;
  select count(*) into v_total_global from public.global_memory;
  select count(*) into v_total_rag from public.rag_memories;
  select count(*) into v_total_notes from public.core_obsidian_notes;

  if v_recent_chat >= 4 and v_recent_conv_memories = 0 then
    v_issues := array_append(
      v_issues,
      format('%s chat messages in the last 24h but 0 new conversation_context entries in global_memory — the chat→memory link may be broken again', v_recent_chat)
    );
  end if;

  if v_total_global = 0 and v_total_rag = 0 and v_total_notes = 0 then
    v_issues := array_append(v_issues, 'global_memory, rag_memories and core_obsidian_notes are all empty — the write funnel may be down entirely');
  end if;

  v_health := case
    when array_length(v_issues, 1) is null then 'ok'
    when array_length(v_issues, 1) = 1 then 'warning'
    else 'error'
  end;

  v_report := jsonb_build_object(
    'ranAt', v_now,
    'health', v_health,
    'issues', to_jsonb(v_issues),
    'recentChat24h', v_recent_chat,
    'recentConversationMemories24h', v_recent_conv_memories,
    'totals', jsonb_build_object(
      'globalMemory', v_total_global,
      'ragMemories', v_total_rag,
      'obsidianNotes', v_total_notes
    )
  );

  if v_health <> 'ok' then
    v_note_path := 'AXE/System/memory-health-' || to_char(v_now, 'YYYYMMDD-HH24MISS') || '.md';
    insert into public.core_obsidian_notes (path, title, content, tags, source, metadata)
    values (
      v_note_path,
      'Memory health check — ' || v_health,
      '## Memory Manager health check (server-side)' || chr(10) || chr(10) ||
      '**When:** ' || v_now::text || chr(10) ||
      '**Health:** ' || v_health || chr(10) || chr(10) ||
      '### Issues' || chr(10) ||
      array_to_string(v_issues, chr(10)) || chr(10) || chr(10) ||
      '[[Memory]] [[System]]',
      array['system', 'memory-health', v_health],
      'system',
      v_report
    )
    on conflict (path) do nothing;
  end if;

  return v_report;
end;
$$;

comment on function public.run_memory_health_check() is
  'Server-side twin of checkMemoryHealth() in memoryManagerService.ts — scheduled hourly, writes a core_obsidian_notes report only when health is not ok.';

select cron.schedule(
  'axe-memory-health-check-hourly',
  '17 * * * *',
  $$select public.run_memory_health_check();$$
);
