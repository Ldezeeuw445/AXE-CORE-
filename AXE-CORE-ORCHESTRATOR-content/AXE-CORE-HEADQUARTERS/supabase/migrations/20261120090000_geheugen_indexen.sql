-- Trage leesqueries op het geheugen (BOUWLIJST "Eerst", 20 nov 2026).
--
-- pg_stat_statements, 19-20 nov: rag_memories-lezingen gemiddeld 1-2 s,
-- global_memory op created_at 0,2 s -- elk een volledige tabelscan (55 MB voor
-- rag_memories) omdat er naast de vector-index niets op de filterkolommen lag.
-- Warm in de cache is dat 9 ms; onder druk op de kleine compute werd het de
-- 1-2 s die het gemeten werd. Deze indexen laten elke lezing alleen de eigen
-- rijen lezen.

create index if not exists rag_memories_user_app_tijd
  on public.rag_memories (user_id, app_source, created_at desc);

create index if not exists rag_memories_tijd
  on public.rag_memories (created_at desc);

-- "welke herinneringen hebben nog geen embedding" (de vul-ronde)
create index if not exists rag_memories_zonder_embedding
  on public.rag_memories (id) where embedding is null;

create index if not exists global_memory_tijd
  on public.global_memory (created_at desc);

create index if not exists global_memory_user_bijgewerkt
  on public.global_memory (user_id, updated_at desc);

analyze public.rag_memories;
analyze public.global_memory;
