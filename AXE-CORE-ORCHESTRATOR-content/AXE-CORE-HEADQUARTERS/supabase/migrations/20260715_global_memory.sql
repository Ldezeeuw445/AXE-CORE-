-- Migration: Global Memory Layer for AXE CORE
-- This table stores the global memory that LangGraph and EVE use to
-- quickly choose the right agent, provider, or specialist.
-- All data is scoped to a user and persisted across sessions.

CREATE TABLE IF NOT EXISTS public.global_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'agent_performance',
    'provider_performance', 
    'specialist_match',
    'conversation_context',
    'user_preference',
    'system_event'
  )),
  key text NOT NULL,
  value text NOT NULL,
  metadata jsonb DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_global_memories_user_id ON public.global_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_global_memories_category ON public.global_memories(category);
CREATE INDEX IF NOT EXISTS idx_global_memories_user_category ON public.global_memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_global_memories_confidence ON public.global_memories(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_global_memories_updated ON public.global_memories(updated_at DESC);

-- RLS: Users can only see their own global memories
ALTER TABLE public.global_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own global memories"
  ON public.global_memories
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own global memories"
  ON public.global_memories
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own global memories"
  ON public.global_memories
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own global memories"
  ON public.global_memories
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_global_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_global_memories_updated_at ON public.global_memories;
CREATE TRIGGER trigger_global_memories_updated_at
  BEFORE UPDATE ON public.global_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_global_memories_updated_at();

COMMENT ON TABLE public.global_memories IS 
  'Global memory layer for AXE CORE. LangGraph and EVE use this to learn which agents, providers, and specialists work best for which tasks.';
