-- Migration: Registered apps — the real backing for the Apps page.
-- One row per app in Luka's ecosystem (AXE CORE HQ, Trading OS, AXE
-- Companion, AXE Intel, ...). The Apps page reads this table and shows
-- live deployment status by asking axe_api's Vercel routes for the row's
-- vercel_project_id; "Improve with Axe" seeds a chat with the row's repo so
-- the branch->PR->approved-merge loop can run against any registered app.

CREATE TABLE IF NOT EXISTS public.registered_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  -- "owner/repo" on GitHub; empty = no repo wired.
  repo text NOT NULL DEFAULT '',
  -- Default working branch for AXE's change loop on this repo.
  default_branch text NOT NULL DEFAULT 'main',
  -- Vercel project id (prj_...); empty = not deployed on Vercel.
  vercel_project_id text NOT NULL DEFAULT '',
  prod_url text NOT NULL DEFAULT '',
  -- Supabase project ref if the app has its own project; empty = shared.
  supabase_ref text NOT NULL DEFAULT '',
  -- Hex accent color for the Apps page card.
  color text NOT NULL DEFAULT '#22D3EE',
  -- In-app route if the app lives inside HQ (e.g. '/trading'); empty = external.
  internal_path text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registered_apps_enabled ON public.registered_apps(enabled);

-- RLS: single-user system — authenticated users manage the registry; the
-- axe_api service role bypasses RLS as with every other core table.
ALTER TABLE public.registered_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view registered apps"
  ON public.registered_apps FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can manage registered apps"
  ON public.registered_apps FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Seed the two real apps the old hardcoded page showed, plus HQ itself.
INSERT INTO public.registered_apps (name, description, repo, default_branch, vercel_project_id, prod_url, color, internal_path, notes)
VALUES
  ('AXE CORE HQ', 'This command center — chat, terminal, editor, browser, 3D maps, agents.',
   'Ldezeeuw445/AXE-CORE-', 'orchestrator', 'prj_pCW5Z5WiPO678SLS951K5BwKoXR9', 'https://www.axeheadquarters.com', '#8B5CF6', '', 'Self-improvement runs through the branch->PR->approved-merge loop.'),
  ('Trading OS', 'Market analysis, trade execution, and portfolio management', '', 'main', '', '', '#22D3EE', '/trading', ''),
  ('AXE Companion', 'Personal AI assistant for daily tasks and conversations', '', 'main', '', '', '#3B82F6', '/', '')
ON CONFLICT (name) DO NOTHING;
