-- Geheugenruis archiveren en inklappen (21 okt 2026).
--
-- Trading schreef elke cyclus een decision/lesson/HOLD, cron elke tik een
-- agent_run:cron:* rij. Neural toonde 42k Trading-rijen. Dit bestand:
--   1. maakt een archieftabel (reversibel)
--   2. zet de ruis daar eerst in
--   3. klapt herhaalde cron-runs en identieke trading-lessen in tot één
--      samenvatting per sleutel per dag
--   4. houdt rag_memories gelijk: identieke inhoud blijft één keer
--
-- Terug: select public.axe_memory_ruis_terugzetten_20261021();

create table if not exists public.axe_memory_archive_20261021 (
  archief_id   bigserial primary key,
  bron_tabel   text not null,
  reden        text not null,
  rij          jsonb not null,
  gearchiveerd timestamptz not null default now()
);

alter table public.axe_memory_archive_20261021 enable row level security;

grant select, insert, update, delete on table public.axe_memory_archive_20261021 to service_role;
grant usage, select on sequence public.axe_memory_archive_20261021_archief_id_seq to service_role;

create index if not exists axe_memory_archive_20261021_bron_idx
  on public.axe_memory_archive_20261021 (bron_tabel, reden);

comment on table public.axe_memory_archive_20261021 is
  'Archief van cron/trading-ruis vóór de inklap van 21 okt 2026. Terugzetten: axe_memory_ruis_terugzetten_20261021().';

create or replace function public.axe_memory_ruis_stam(sleutel text)
returns text
language sql
immutable
as $$
  select case
    when sleutel is null or sleutel = '' then ''
    when sleutel ~* '^agent_run:' then array_to_string((string_to_array(sleutel, ':'))[1:3], ':')
    else regexp_replace(
           regexp_replace(sleutel, ':[0-9]{10,13}$', ''),
           ':[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
           '',
           'i'
         )
  end;
$$;

create or replace function public.axe_memory_ruis_noop(tekst text)
returns boolean
language sql
immutable
as $$
  select coalesce(tekst, '') ~* '^\s*$'
      or coalesce(tekst, '') ~* '^(hold\s+score=|no(thing)?\s*(new|change|op)\b|skip(ped|ping)?\b|no[- ]change\b)'
      or (coalesce(tekst, '') ~* '"action"\s*:\s*"hold"' and coalesce(tekst, '') ~* '\bhold\b');
$$;

create or replace function public.axe_memory_ruis_inklappen_20261021()
returns jsonb
language plpgsql
as $$
declare
  gm_cron int := 0;
  gm_ta int := 0;
  mem_n int := 0;
  rag_n int := 0;
begin
  -- 1. Archiveren vóór elke delete.
  insert into public.axe_memory_archive_20261021 (bron_tabel, reden, rij)
  select 'global_memory',
         case
           when key ~* '^agent_run:cron:' then 'cron'
           when key ~* ':(cycle):' then 'cycle'
           when public.axe_memory_ruis_noop(value) then 'noop'
           else 'trading_dup'
         end,
         to_jsonb(g.*)
  from public.global_memory g
  where (
      key ~* '^agent_run:cron:'
      or key ~* ':(cycle):'
      or public.axe_memory_ruis_noop(value)
      or key ~* '(:lesson:|:decision:)'
    )
    and not exists (
      select 1 from public.axe_memory_archive_20261021 a
      where a.bron_tabel = 'global_memory' and a.rij->>'id' = g.id::text
    );

  insert into public.axe_memory_archive_20261021 (bron_tabel, reden, rij)
  select 'memory',
         case
           when coalesce(key, '') ~* '^agent_run:' then 'cron'
           when coalesce(key, '') ~* ':(cycle):' then 'cycle'
           when public.axe_memory_ruis_noop(content) then 'noop'
           else 'trading_dup'
         end,
         to_jsonb(m.*)
  from public.memory m
  where (
      coalesce(key, '') ~* '^agent_run:'
      or coalesce(key, '') ~* ':(cycle):'
      or public.axe_memory_ruis_noop(content)
      or coalesce(key, '') ~* '(:lesson:|:decision:)'
    )
    and not exists (
      select 1 from public.axe_memory_archive_20261021 a
      where a.bron_tabel = 'memory' and a.rij->>'id' = m.id::text
    );

  insert into public.axe_memory_archive_20261021 (bron_tabel, reden, rij)
  select 'rag_memories', 'rag_dup', (to_jsonb(r.*) - 'embedding')
  from public.rag_memories r
  join (
    select id, row_number() over (
      partition by md5(trim(coalesce(content, '')))
      order by created_at desc nulls last, id desc
    ) as rn
    from public.rag_memories
  ) d on d.id = r.id
  where d.rn > 1
    and not exists (
      select 1 from public.axe_memory_archive_20261021 a
      where a.bron_tabel = 'rag_memories' and a.rij->>'id' = r.id::text
    );

  -- 2. Cron: alles weg (staat in het archief), één samenvatting per job per dag terug.
  delete from public.global_memory where key ~* '^agent_run:cron:';
  get diagnostics gm_cron = row_count;
  insert into public.global_memory (user_id, category, key, value, confidence, metadata)
  select distinct on (stam, dag)
    coalesce(nullif(a.rij->>'user_id', ''), 'acff7a12-1111-481d-a7a9-cc07583b8069-axe-core'),
    'system_event',
    stam || ':' || dag::text,
    json_build_object('summary', format('Cron %s collapsed to one memory for %s', stam, dag), 'day', dag, 'collapsed', true)::text,
    1,
    jsonb_build_object('collapsed', true, 'kind', 'agent_run')
  from (
    select
      public.axe_memory_ruis_stam(a.rij->>'key') as stam,
      ((a.rij->>'created_at')::timestamptz at time zone 'utc')::date as dag,
      a.rij
    from public.axe_memory_archive_20261021 a
    where a.bron_tabel = 'global_memory' and a.reden = 'cron'
  ) a
  on conflict (user_id, key) do nothing;

  -- 3. Trading in global_memory: HOLD/cycle weg; identieke les/decision één keer.
  delete from public.global_memory
  where key ~* ':(cycle):' or public.axe_memory_ruis_noop(value);
  get diagnostics gm_ta = row_count;

  delete from public.global_memory g
  using (
    select id, row_number() over (
      partition by public.axe_memory_ruis_stam(key), left(md5(trim(coalesce(value, ''))), 16)
      order by created_at desc
    ) as rn
    from public.global_memory
    where key ~* '(:lesson:|:decision:)'
  ) d
  where g.id = d.id and d.rn > 1;

  update public.global_memory g
  set key = public.axe_memory_ruis_stam(g.key) || ':' || left(md5(trim(coalesce(g.value, ''))), 16),
      metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
        'content_hash', left(md5(trim(coalesce(g.value, ''))), 16),
        'collapsed', true
      )
  where g.key ~* '(:lesson:|:decision:)'
    and g.key !~ (':' || left(md5(trim(coalesce(g.value, ''))), 16) || '$');

  -- 4. memory-tabel: cycle/HOLD/cron weg; identieke les/decision één keer.
  delete from public.memory
  where coalesce(key, '') ~* '^agent_run:'
     or coalesce(key, '') ~* ':(cycle):'
     or public.axe_memory_ruis_noop(content);

  delete from public.memory m
  using (
    select id, row_number() over (
      partition by coalesce(agent, 'global'),
                   public.axe_memory_ruis_stam(key),
                   left(md5(trim(coalesce(content, ''))), 16)
      order by created_at desc
    ) as rn
    from public.memory
    where coalesce(key, '') ~* '(:lesson:|:decision:)'
  ) d
  where m.id = d.id and d.rn > 1;
  get diagnostics mem_n = row_count;

  update public.memory m
  set key = public.axe_memory_ruis_stam(m.key) || ':' || left(md5(trim(coalesce(m.content, ''))), 16),
      metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'content_hash', left(md5(trim(coalesce(m.content, ''))), 16),
        'collapsed', true
      )
  where coalesce(m.key, '') ~* '(:lesson:|:decision:)'
    and m.key !~ (':' || left(md5(trim(coalesce(m.content, ''))), 16) || '$');

  -- 5. rag_memories: identieke inhoud één keer (nieuwste blijft).
  delete from public.rag_memories r
  using (
    select id, row_number() over (
      partition by md5(trim(coalesce(content, '')))
      order by created_at desc nulls last, id desc
    ) as rn
    from public.rag_memories
  ) d
  where r.id = d.id and d.rn > 1;
  get diagnostics rag_n = row_count;

  return jsonb_build_object(
    'archived', (select count(*) from public.axe_memory_archive_20261021),
    'global_memory_cron_deleted', gm_cron,
    'global_memory_ta_deleted', gm_ta,
    'memory_dups_deleted', mem_n,
    'rag_dups_deleted', rag_n
  );
end;
$$;

create or replace function public.axe_memory_ruis_terugzetten_20261021()
returns jsonb
language plpgsql
as $$
declare
  gm int := 0;
  mem int := 0;
  rag int := 0;
begin
  delete from public.global_memory
  where coalesce(metadata->>'collapsed', '') = 'true'
     or key like 'collapsed:%'
     or key ~ '^agent_run:cron:[^:]+:\d{4}-\d{2}-\d{2}$';

  delete from public.memory
  where coalesce(metadata->>'collapsed', '') = 'true'
     or coalesce(key, '') like 'collapsed:%';

  insert into public.global_memory
  select (jsonb_populate_record(null::public.global_memory, rij)).*
  from public.axe_memory_archive_20261021
  where bron_tabel = 'global_memory'
  on conflict (id) do nothing;
  get diagnostics gm = row_count;

  insert into public.memory
  select (jsonb_populate_record(null::public.memory, rij)).*
  from public.axe_memory_archive_20261021
  where bron_tabel = 'memory'
  on conflict (id) do nothing;
  get diagnostics mem = row_count;

  insert into public.rag_memories
  select (jsonb_populate_record(null::public.rag_memories, rij)).*
  from public.axe_memory_archive_20261021
  where bron_tabel = 'rag_memories'
  on conflict (id) do nothing;
  get diagnostics rag = row_count;

  return jsonb_build_object(
    'global_memory_restored', gm,
    'memory_restored', mem,
    'rag_memories_restored', rag
  );
end;
$$;

-- Eenmaal inklappen bij apply. Een tweede apply is idempotent: archief slaat
-- bestaande ids over, en na de eerste run is de ruis al weg.
select public.axe_memory_ruis_inklappen_20261021();
