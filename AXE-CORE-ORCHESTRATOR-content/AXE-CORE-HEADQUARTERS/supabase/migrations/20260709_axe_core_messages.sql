-- =============================================================================
-- AXE CORE — Chat message persistence
-- Run in Supabase Studio → SQL Editor (or `supabase db push`).
-- Project: pqnngpcgbdwxavbatbia
--
-- Fixes the "refresh loses the conversation" bug: chat exchanges are now
-- written to Supabase (via the VPS axe_api service_role key, which bypasses
-- RLS) and read back on page load.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL DEFAULT 'default',
  role        TEXT NOT NULL,                       -- 'user' | 'axe' | 'system'
  content     TEXT NOT NULL,
  provider    TEXT,                                -- which provider answered (axe reply)
  model       TEXT,                                -- model used
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_session_created_idx
  ON public.messages (session_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Allow the VPS axe_api (service_role) and the anon browser client full access.
-- service_role bypasses RLS regardless, but the anon policy keeps the
-- single-user app working if the api key is ever absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'anon_all_messages'
  ) THEN
    CREATE POLICY anon_all_messages ON public.messages
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.messages IS 'AXE CORE chat history — persisted so a page refresh never loses context.';
