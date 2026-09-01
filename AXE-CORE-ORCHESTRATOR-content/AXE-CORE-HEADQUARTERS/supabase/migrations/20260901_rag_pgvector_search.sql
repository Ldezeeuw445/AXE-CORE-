-- Toegepast op de live database op 01-09-2026 via apply_migration.
-- Hier vastgelegd zodat het schema in de repo klopt met wat er draait.
--
-- Aanleiding: searchRagMemories laadde 200 van de 8.296 rijen naar de browser
-- en embedde die allemaal opnieuw bij elke zoekopdracht. 97,6% van de
-- kennisbank werd dus nooit doorzocht, en het werk werd elke sessie overgedaan.
-- pgvector 0.8.0 stond al geïnstalleerd en werd nergens gebruikt.
--
-- rag_memories is voor 100% app_source='axe-core' (8.296 van 8.296 gemeten),
-- dus Trading OS en AXE Companion worden hier niet door geraakt. De kolom is
-- nullable, dus bestaande schrijvers merken niets.

ALTER TABLE public.rag_memories
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

CREATE INDEX IF NOT EXISTS rag_memories_embedding_hnsw
  ON public.rag_memories USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS rag_memories_embedding_present
  ON public.rag_memories ((embedding IS NOT NULL)) WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.match_rag_memories(
  query_embedding vector(1024),
  match_count     int   DEFAULT 5,
  min_score       float DEFAULT 0.30,
  filter_category text  DEFAULT NULL
)
RETURNS TABLE (
  id uuid, category text, content text, importance int,
  metadata jsonb, created_at timestamptz, score float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT r.id, r.category, r.content, r.importance, r.metadata, r.created_at,
         1 - (r.embedding <=> query_embedding) AS score
  FROM public.rag_memories r
  WHERE r.embedding IS NOT NULL
    AND (filter_category IS NULL OR r.category = filter_category)
    AND 1 - (r.embedding <=> query_embedding) >= min_score
  ORDER BY r.embedding <=> query_embedding
  LIMIT greatest(1, least(50, match_count));
$$;

GRANT EXECUTE ON FUNCTION public.match_rag_memories TO authenticated, anon;
