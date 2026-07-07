-- =============================================================================
-- AXE CORE BRAIN — Full Database Schema
-- Run in Supabase Studio → SQL Editor, or via `supabase db push`.
-- Project: pqnngpcgbdwxavbatbia
-- Based on: AXE_CORE_MASTER_PROMPT_v2_UPDATED
-- =============================================================================

-- ── Core Agents ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,                      -- 'companion' | 'intel' | 'trading' | 'custom'
  status      TEXT NOT NULL DEFAULT 'inactive',  -- 'online' | 'idle' | 'offline' | 'inactive'
  config      JSONB NOT NULL DEFAULT '{}',
  last_seen   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Tasks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'active' | 'done' | 'failed'
  priority    TEXT NOT NULL DEFAULT 'medium',    -- 'low' | 'medium' | 'high' | 'critical'
  assignee    TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Workflows ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'inactive',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Context (key-value system state) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_context (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Memory (persistent AXE knowledge) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_memory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content    TEXT NOT NULL,
  tags       TEXT[] NOT NULL DEFAULT '{}',
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  source     TEXT,                               -- 'conversation' | 'manual' | 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Models ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_models (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider   TEXT NOT NULL,
  model_id   TEXT NOT NULL,
  slot       TEXT,                               -- 'primary' | 'fallback1' | 'fallback2' | 'fallback3'
  status     TEXT NOT NULL DEFAULT 'unconfigured',
  config     JSONB NOT NULL DEFAULT '{}'
);

-- ── Core Routing (how to route queries to apps) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_routing (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern    TEXT NOT NULL,
  target_app TEXT NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 5,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Core Permissions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability TEXT UNIQUE NOT NULL,
  granted    BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ,
  notes      TEXT
);

-- ── Core System Logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_system_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level      TEXT NOT NULL DEFAULT 'info',       -- 'debug' | 'info' | 'warn' | 'error'
  source     TEXT,                               -- which service/component logged this
  message    TEXT NOT NULL,
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  processed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient  TEXT,
  type       TEXT NOT NULL DEFAULT 'info',
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at   TIMESTAMPTZ,
  metadata   JSONB NOT NULL DEFAULT '{}'
);

-- ── Core AI State ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_ai_state (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Services ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_services (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'offline',
  endpoint   TEXT,
  config     JSONB NOT NULL DEFAULT '{}',
  last_ping  TIMESTAMPTZ
);

-- ── Core Integrations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT,                              -- 'mcp' | 'api' | 'webhook' | 'oauth'
  status      TEXT NOT NULL DEFAULT 'disconnected',
  credentials JSONB NOT NULL DEFAULT '{}',      -- store safely, never expose keys
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Core Deployments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_deployments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app         TEXT NOT NULL,
  version     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  deployed_at TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}'
);

-- ── Core Metrics ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.core_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric      TEXT NOT NULL,
  value       NUMERIC,
  tags        JSONB NOT NULL DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS core_system_logs_created_at_idx  ON public.core_system_logs  (created_at DESC);
CREATE INDEX IF NOT EXISTS core_memory_created_at_idx        ON public.core_memory        (created_at DESC);
CREATE INDEX IF NOT EXISTS core_tasks_status_idx             ON public.core_tasks         (status);
CREATE INDEX IF NOT EXISTS core_events_processed_idx         ON public.core_events        (processed, created_at DESC);
CREATE INDEX IF NOT EXISTS core_metrics_metric_idx           ON public.core_metrics       (metric, recorded_at DESC);

-- =============================================================================
-- SEED DATA — Initial state based on Master Prompt v2
-- =============================================================================

-- Initial permissions (all 10 capabilities from the master prompt)
INSERT INTO public.core_permissions (capability, granted, granted_at, notes) VALUES
  ('system.read_app',          TRUE,  NOW(), 'Read data from any application'),
  ('system.modify_app',        TRUE,  NOW(), 'Update application configurations'),
  ('system.deploy_app',        TRUE,  NOW(), 'Manage deployments and version control'),
  ('system.manage_supabase',   TRUE,  NOW(), 'Control Supabase infrastructure via Supabase Service'),
  ('system.manage_github',     FALSE, NULL,  'GitHub not yet configured'),
  ('system.manage_agents',     TRUE,  NOW(), 'Supervise all AI agents in the system'),
  ('system.manage_prompts',    TRUE,  NOW(), 'Govern the prompt ecosystem'),
  ('system.manage_workflows',  TRUE,  NOW(), 'Orchestrate all workflows'),
  ('system.manage_permissions',TRUE,  NOW(), 'Control access and authorization'),
  ('system.analyze_system',    TRUE,  NOW(), 'Deep analysis across the entire ecosystem')
ON CONFLICT (capability) DO NOTHING;

-- Initial core services
INSERT INTO public.core_services (name, status) VALUES
  ('Agent Manager',        'pending'),
  ('App Manager',          'pending'),
  ('Workflow Engine',      'pending'),
  ('Memory Service',       'online'),
  ('GitHub Service',       'offline'),
  ('Supabase Service',     'online'),
  ('MCP Manager',          'pending'),
  ('Deployment Manager',   'pending'),
  ('Notification Service', 'pending')
ON CONFLICT (name) DO NOTHING;

-- Initial routing rules (mirrors voiceStore classifyQuery logic)
INSERT INTO public.core_routing (pattern, target_app, priority) VALUES
  ('trade|buy|sell|portfolio|profit|loss|stock|crypto|price action|position',  'Trading OS',    10),
  ('research|analyze|intel|intelligence|market analysis|data|news|sentiment',  'AXE Intel',     9),
  ('reminder|schedule|calendar|meeting|personal|companion|diary|journal',      'AXE Companion', 8),
  ('system|status|health|deploy|route|config|settings|axe core|orchestrat',   'AXE Core',      10)
ON CONFLICT DO NOTHING;

-- Initial registered applications
INSERT INTO public.core_agents (name, type, status, config) VALUES
  ('AXE Companion', 'companion', 'idle',   '{"description": "Personal AI assistant", "domain": "personal"}'),
  ('AXE Intel',     'intel',     'idle',   '{"description": "Market analysis intelligence", "domain": "research"}'),
  ('Trading OS',    'trading',   'online', '{"description": "Trading execution and management", "domain": "trading"}')
ON CONFLICT DO NOTHING;

-- Initial AI state
INSERT INTO public.core_ai_state (key, value) VALUES
  ('startup_complete',  'false'),
  ('active_session',    'null'),
  ('routing_mode',      '"fallback"'),
  ('last_health_check', 'null')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- RLS (Row Level Security) — allow anon read/write for single-user app
-- Tighten these when you add authentication.
-- =============================================================================
ALTER TABLE public.core_agents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_workflows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_context      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_memory       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_models       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_routing      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_system_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_ai_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_deployments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_metrics      ENABLE ROW LEVEL SECURITY;

-- Allow anon full access (single-user, no auth yet)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'core_agents','core_tasks','core_workflows','core_context','core_memory',
    'core_models','core_routing','core_permissions','core_system_logs',
    'core_events','core_notifications','core_sessions','core_ai_state',
    'core_services','core_integrations','core_deployments','core_metrics'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', 'anon_all_' || tbl, tbl);
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS 'AXE CORE brain database — core_* namespace is owned exclusively by AXE CORE';
