-- =============================================================================
-- AXE CORE — Fix messages table schema to match code expectations
-- Run in Supabase Studio → SQL Editor
--
-- The original migration (20260709_axe_core_messages.sql) created a table
-- with `session_id` but the app code expects `conversation_id`, `user_id`,
-- and `metadata` columns. This migration fixes that.
-- =============================================================================

-- Add missing columns (safe if they already exist)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Drop the old session_id column if it exists (data loss warning: only run
-- if you're okay losing old messages that used session_id)
ALTER TABLE public.messages DROP COLUMN IF EXISTS session_id;

-- Ensure indexes exist for the columns the app queries
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS messages_user_id_idx
  ON public.messages (user_id);

-- GIN index for JSONB metadata queries (scoped messages)
CREATE INDEX IF NOT EXISTS messages_metadata_gin_idx
  ON public.messages USING GIN (metadata);

-- Update the RLS policy to allow the anon client full access
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

COMMENT ON TABLE public.messages IS 'AXE CORE chat history — conversation_id + user_id + metadata for per-app/per-agent isolation.';
