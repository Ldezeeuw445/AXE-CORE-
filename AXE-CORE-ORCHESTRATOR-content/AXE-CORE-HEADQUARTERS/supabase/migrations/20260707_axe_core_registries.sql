-- AXE CORE — Full AXE OS Registry (Workflow, App, MCP, Tool registries)
-- Migration: 20260707_axe_core_registries.sql

-- ── core_applications: Registry of all apps in the ecosystem ─────────────
CREATE TABLE IF NOT EXISTS core_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,          -- 'axe_companion', 'axe_intel', 'trading_os'
  display_name    TEXT NOT NULL,
  description     TEXT,
  base_url        TEXT,                          -- production URL of the app
  api_base_url    TEXT,                          -- API endpoint for CORE to call
  health_url      TEXT,                          -- health check endpoint
  repo_url        TEXT,                          -- GitHub repo URL
  deploy_id       TEXT,                          -- Railway/Vercel deployment ID
  deploy_platform TEXT,                          -- 'vercel' | 'railway' | 'cloudflare_workers'
  supabase_schema TEXT,                          -- which schema/prefix this app uses
  status          TEXT DEFAULT 'active',         -- 'active' | 'paused' | 'maintenance'
  version         TEXT DEFAULT '1.0.0',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── core_workflows: Workflow registry (n8n + custom) ──────────────────────
CREATE TABLE IF NOT EXISTS core_workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT,                          -- n8n workflow ID (or other automation platform)
  name            TEXT NOT NULL,
  description     TEXT,
  platform        TEXT DEFAULT 'n8n',            -- 'n8n' | 'zapier' | 'make' | 'custom'
  trigger_type    TEXT,                          -- 'webhook' | 'schedule' | 'event' | 'manual'
  trigger_config  JSONB DEFAULT '{}',            -- cron expression, webhook URL, etc.
  webhook_url     TEXT,                          -- callable webhook URL
  app_id          UUID REFERENCES core_applications(id) ON DELETE SET NULL,
  agent_id        UUID REFERENCES core_agents(id) ON DELETE SET NULL,
  tags            TEXT[] DEFAULT '{}',
  status          TEXT DEFAULT 'active',         -- 'active' | 'paused' | 'draft' | 'error'
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT,
  run_count       INT DEFAULT 0,
  error_count     INT DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── core_mcp_servers: MCP server registry ──────────────────────────────────
CREATE TABLE IF NOT EXISTS core_mcp_servers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,          -- 'cloudflare', 'supabase', 'github', 'railway'
  display_name    TEXT NOT NULL,
  description     TEXT,
  transport       TEXT DEFAULT 'stdio',          -- 'stdio' | 'sse' | 'http'
  command         TEXT,                          -- e.g. 'npx @cloudflare/mcp-server-cloudflare'
  url             TEXT,                          -- for SSE/HTTP transport
  env_vars        JSONB DEFAULT '{}',            -- required env var names (NOT values)
  capabilities    TEXT[] DEFAULT '{}',           -- what tools this MCP exposes
  status          TEXT DEFAULT 'configured',     -- 'configured' | 'active' | 'error' | 'not_configured'
  last_ping_at    TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── core_tools: Tool registry (callable tools for agents) ─────────────────
CREATE TABLE IF NOT EXISTS core_tools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,          -- 'send_email', 'create_workflow', 'deploy_app'
  display_name    TEXT NOT NULL,
  description     TEXT NOT NULL,                 -- Description used for AI tool selection
  category        TEXT,                          -- 'communication' | 'automation' | 'data' | 'code'
  source          TEXT,                          -- 'mcp' | 'workflow' | 'function' | 'api'
  mcp_server_id   UUID REFERENCES core_mcp_servers(id) ON DELETE SET NULL,
  workflow_id     UUID REFERENCES core_workflows(id) ON DELETE SET NULL,
  input_schema    JSONB DEFAULT '{}',            -- JSON Schema for tool inputs
  output_schema   JSONB DEFAULT '{}',            -- JSON Schema for tool outputs
  endpoint        TEXT,                          -- direct HTTP endpoint if applicable
  requires_auth   BOOLEAN DEFAULT false,
  enabled         BOOLEAN DEFAULT true,
  call_count      INT DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── core_workflow_runs: Execution log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS core_workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID REFERENCES core_workflows(id) ON DELETE CASCADE,
  triggered_by    TEXT DEFAULT 'manual',         -- 'agent' | 'schedule' | 'webhook' | 'manual'
  input_data      JSONB DEFAULT '{}',
  output_data     JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'running',        -- 'running' | 'success' | 'failed' | 'cancelled'
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INT,
  error_message   TEXT,
  metadata        JSONB DEFAULT '{}'
);

-- ── Seed: Applications ────────────────────────────────────────────────────
INSERT INTO core_applications (name, display_name, description, base_url, api_base_url, deploy_platform, status) VALUES
  ('axe_core',      'AXE CORE',      'AI Operating System — orchestrator',                NULL,                              NULL,                          'vercel',              'active'),
  ('axe_companion', 'AXE Companion', 'Personal AI assistant app',                         NULL,                              NULL,                          'vercel',              'active'),
  ('axe_intel',     'AXE Intel',     'Market intelligence and analysis app',               NULL,                              NULL,                          'vercel',              'active'),
  ('trading_os',    'Trading OS',    'Trading execution and management app',               NULL,                              NULL,                          'vercel',              'active'),
  ('metaapi',       'MetaAPI Streamer', 'MetaAPI real-time data streamer for both apps',   'https://axe-metaapi-streamer-production.up.railway.app', 'https://axe-metaapi-streamer-production.up.railway.app', 'railway', 'active'),
  ('chart_edge',    'AXE Chart Edge', 'Cloudflare Worker for chart/edge data',             'https://axe-chart-edge.lukadezeeuw1994.workers.dev', 'https://axe-chart-edge.lukadezeeuw1994.workers.dev', 'cloudflare_workers', 'active')
ON CONFLICT (name) DO NOTHING;

-- ── Seed: MCP Servers ─────────────────────────────────────────────────────
INSERT INTO core_mcp_servers (name, display_name, description, transport, command, capabilities, status) VALUES
  ('cloudflare',         'Cloudflare',      'Manage Workers, KV, R2, D1, Pages',         'stdio', 'npx @cloudflare/mcp-server-cloudflare', ARRAY['workers', 'kv', 'r2', 'pages', 'dns'],    'configured'),
  ('cloudflare_workers', 'CF Workers Edit', 'Create and deploy Cloudflare Workers',       'stdio', 'npx @cloudflare/mcp-server-cloudflare', ARRAY['workers', 'deploy'],                      'configured'),
  ('supabase',           'Supabase',        'Database, auth, storage operations',         'stdio', 'npx @supabase/mcp-server-supabase',     ARRAY['sql', 'auth', 'storage', 'functions'],    'not_configured'),
  ('github',             'GitHub',          'Repos, PRs, issues, code management',        'stdio', 'npx @modelcontextprotocol/server-github', ARRAY['repos', 'prs', 'issues', 'code'],       'not_configured'),
  ('railway',            'Railway',         'Deployments, services, environment vars',    'stdio', 'npx railway-mcp',                        ARRAY['deploy', 'logs', 'env', 'services'],     'not_configured')
ON CONFLICT (name) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE core_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_workflows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_mcp_servers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_tools        ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_workflow_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_applications' AND policyname = 'svc_core_apps') THEN
    CREATE POLICY svc_core_apps ON core_applications USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_workflows' AND policyname = 'svc_core_workflows') THEN
    CREATE POLICY svc_core_workflows ON core_workflows USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_mcp_servers' AND policyname = 'svc_core_mcp') THEN
    CREATE POLICY svc_core_mcp ON core_mcp_servers USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_tools' AND policyname = 'svc_core_tools') THEN
    CREATE POLICY svc_core_tools ON core_tools USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_workflow_runs' AND policyname = 'svc_core_runs') THEN
    CREATE POLICY svc_core_runs ON core_workflow_runs USING (true);
  END IF;
END $$;
