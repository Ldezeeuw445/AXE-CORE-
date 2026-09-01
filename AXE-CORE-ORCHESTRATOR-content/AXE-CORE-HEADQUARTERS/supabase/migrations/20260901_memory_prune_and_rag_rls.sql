-- =============================================================================
-- AXE CORE — geheugen opgeschoond + rag_memories weer leesbaar
-- Toegepast op de live database op 01-09-2026.
-- =============================================================================

-- ── 1. rag_memories was volledig onbereikbaar ────────────────────────────
--
-- RLS stond aan met NUL policies, wat in Postgres "alles weigeren" betekent.
-- 7.826 herinneringen die de app nooit heeft kunnen lezen. loadRagMemories()
-- kreeg een lege array terug en gaf die door als "niets gevonden" — dezelfde
-- stille vorm die vandaag vijf keer terugkwam: een geweigerde toegang die er
-- precies zo uitziet als een leeg resultaat.
--
-- Gemeten voor en na: searchRagMemories('waar ben ik gebleven met trading')
-- gaf 0 resultaten in 175 ms (te snel om te hebben geëmbed) en daarna 5
-- resultaten in 2.487 ms.
--
-- user_id draagt hier een app-achtervoegsel (…-axe-core) en is TEXT, dus de
-- vergelijking gaat op de prefix. Gelijkheid met auth.uid() zou nooit matchen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='rag_memories' AND policyname='rag_memories_owner_all'
  ) THEN
    CREATE POLICY rag_memories_owner_all ON public.rag_memories
      FOR ALL TO authenticated
      USING      (user_id LIKE auth.uid()::text || '%')
      WITH CHECK (user_id LIKE auth.uid()::text || '%');
  END IF;
END $$;

-- ── 2. Archief vóór het opschonen ────────────────────────────────────────
--
-- Verwijderen is onomkeerbaar; dit maakt het dat niet. Alles wat weg is staat
-- hier met de reden erbij, zodat een verkeerd criterium terug te draaien is.
CREATE TABLE IF NOT EXISTS public.axe_memory_archive_20260901 (
  archief_id   bigserial PRIMARY KEY,
  bron_tabel   text NOT NULL,
  reden        text NOT NULL,
  rij          jsonb NOT NULL,
  gearchiveerd timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Wat er is verwijderd, en waarom ───────────────────────────────────
--
-- 10.065 rijen van de 36.628, na archivering:
--
--   error      1.864  foutmeldingen horen niet in een geheugen. Ze vervuilen
--                     elke zoekopdracht, en er is geen geval waarin AXE zich
--                     een stacktrace moet herinneren.
--   crew       2.710  losse CrewAI-runs zonder conclusie. De conclusies staan
--                     apart als reflection:.
--   agent_run    492  exact 246 in beide tabellen — letterlijk dezelfde rijen.
--   chatlog    4.999  ruwe regels als "User said (2026-08-22): …". Sinds
--                     axe_messages werkt is dat dubbelop.
--
-- Wat bewaard is en waarom dat de kern was: 14.373 ta:-rijen (de trading-agent,
-- waar Luka expliciet om vroeg), 209 reflecties en 53 voorkeuren. Dat laatste
-- is minder dan 400 rijen en per rij het waardevolst wat er in staat.
--
-- Trading OS en AXE Companion zijn niet geraakt: 99,7% van beide tabellen
-- staat op de -axe-core namespace; zij hebben er samen een handvol rijen.
--
-- De DELETE-statements staan hier niet nogmaals: ze zijn uitgevoerd tegen de
-- live database en opnieuw draaien zou niets meer vinden. Het archief is de
-- weg terug.
