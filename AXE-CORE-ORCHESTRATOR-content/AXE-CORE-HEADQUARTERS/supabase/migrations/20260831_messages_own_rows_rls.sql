-- =============================================================================
-- AXE CORE — messages: eigenaar mag zijn eigen rijen schrijven
--
-- Symptoom (31 augustus 2026, in de draaiende app):
--   [chatPersistence] saveMessage error:
--   42501 — new row violates row-level security policy for table "messages"
--   Laatst bewaarde bericht: 27 augustus. Sindsdien niets.
--
-- Wat er werkelijk aan de hand is — gemeten, niet uit de migratiebestanden
-- afgeleid, want die komen NIET overeen met de live database:
--
--   * De repo denkt dat er een policy `anon_all_messages` bestaat
--     (20260716_fix_messages_schema.sql). Die bestaat niet. Live staan er vier
--     policies `messages_*_thread`, TO public.
--
--   * De INSERT-policy eist:
--       EXISTS (SELECT 1 FROM conversations c
--               WHERE c.id = messages.conversation_id
--                 AND c.user_id = auth.uid())
--
--   * `conversations` is niet van AXE Core. 79 rijen, 62 verschillende
--     user_ids, laatste activiteit 8 juli — dat is een ander product dat deze
--     database deelt. AXE Core schrijft nergens naar die tabel (geen enkele
--     `from('conversations')` in de codebase), dus die EXISTS is per definitie
--     onwaar en elke insert wordt geweigerd.
--
-- Waarom het tot 27 augustus wél werkte: chatPersistence schrijft eerst via
-- axe_api op de VPS, met service_role — en die omzeilt RLS volledig. Toen die
-- API 500 begon te geven viel hij terug op de directe browserclient, en pas
-- daar slaat RLS toe. De 500 is de oorzaak; deze RLS-fout is het gevolg.
-- Dat maakt dit een reparatie van het terugvalpad, niet van de hoofdroute.
--
-- De policy hieronder gebruikt auth.uid() in plaats van een vaste UUID.
-- Geverifieerd: de ingelogde gebruiker is acff7a12-1111-481d-a7a9-cc07583b8069
-- en dat is exact de user_id op alle 280 AXE Core-berichten. Een hardgecodeerde
-- id zou hetzelfde doen en stilletjes fout worden zodra het account verandert.
-- =============================================================================

-- messages.user_id is UUID (net als auth.uid()), dus geen cast. De
-- migratiebestanden zeggen TEXT; de live tabel zegt uuid. Eerste poging met
-- ::text faalde op "operator does not exist: uuid = text" — nuttig, want zo
-- kwam het verschil aan het licht in plaats van stil door te sijpelen.
--
-- Toegepast op de live database op 31-08-2026, geverifieerd: messages_owner_all
-- staat er nu naast de vier bestaande messages_*_thread policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'messages'
      AND policyname = 'messages_owner_all'
  ) THEN
    CREATE POLICY messages_owner_all ON public.messages
      FOR ALL
      TO authenticated
      USING      (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON POLICY messages_owner_all ON public.messages IS
  'AXE CORE: de ingelogde eigenaar mag zijn eigen berichten lezen en '
  'schrijven, herkend aan user_id = auth.uid(). Toegevoegd 31-08-2026 omdat '
  'de bestaande messages_*_thread policies een conversations-rij eisen die '
  'AXE Core nooit aanmaakt (die tabel hoort bij een ander product in dezelfde '
  'database).';

-- De bestaande messages_*_thread policies blijven staan. Ze horen bij het
-- andere product; weghalen zou dat breken. Policies zijn OR-ed, dus deze
-- nieuwe geeft AXE Core toegang zonder iets van de ander af te nemen.

-- =============================================================================
-- Controle na het draaien:
--
--   SELECT policyname, roles::text, cmd FROM pg_policies
--   WHERE tablename = 'messages' ORDER BY policyname;
--
-- Er hoort nu een vijfde bij te staan: messages_owner_all, TO authenticated.
-- =============================================================================
