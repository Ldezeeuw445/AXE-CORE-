-- AXE CORE — Agent Registry + Smart Routing tables
-- Migration: 20260707_axe_core_agents.sql

-- ── core_agents: Registry of all AXE agents ──────────────────────────────
CREATE TABLE IF NOT EXISTS core_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,          -- e.g. 'axe_companion'
  display_name    TEXT NOT NULL,                 -- e.g. 'AXE Companion'
  role            TEXT NOT NULL,                 -- 'assistant' | 'analyst' | 'trader' | 'developer'
  description     TEXT,
  system_prompt   TEXT,                          -- override prompt for this agent
  memory_namespace TEXT,                         -- Supabase table prefix for this agent's memory
  toolset         JSONB DEFAULT '[]',            -- list of tool names this agent can use
  model_provider  TEXT,                          -- preferred provider: 'google' | 'openrouter' | 'ollama' etc.
  model_name      TEXT,                          -- preferred model
  api_endpoint    TEXT,                          -- external HTTP endpoint to delegate to (optional)
  api_key_secret  TEXT,                          -- name of the secret key in vault (not the key itself)
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'deprecated'
  version         TEXT DEFAULT '1.0.0',
  permissions     JSONB DEFAULT '{}',            -- { "can_read_memory": true, "can_write_memory": true }
  capabilities    TEXT[] DEFAULT '{}',           -- ['code', 'analysis', 'research', 'trading']
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── core_routing_rules: Capability → Agent/Model mapping ─────────────────
CREATE TABLE IF NOT EXISTS core_routing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability      TEXT NOT NULL,                 -- 'code' | 'analysis' | 'fast' | 'privacy' | 'creative' | 'reasoning'
  agent_id        UUID REFERENCES core_agents(id) ON DELETE SET NULL,
  provider        TEXT,                          -- fallback if no agent: 'google' | 'openrouter' etc.
  model_name      TEXT,
  priority        INT DEFAULT 50,               -- lower = higher priority
  condition       JSONB DEFAULT '{}',            -- optional: { "min_words": 20 }
  enabled         BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── core_agent_calls: Audit log of agent invocations ────────────────────
CREATE TABLE IF NOT EXISTS core_agent_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID REFERENCES core_agents(id),
  caller          TEXT DEFAULT 'axe_core',       -- who called this agent
  capability_used TEXT,
  input_summary   TEXT,                          -- truncated input
  output_summary  TEXT,                          -- truncated output
  model_used      TEXT,
  tokens_in       INT,
  tokens_out      INT,
  latency_ms      INT,
  success         BOOLEAN DEFAULT true,
  error_message   TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Seed: Initial agent registry ─────────────────────────────────────────
INSERT INTO core_agents (name, display_name, role, description, capabilities, status, model_provider, model_name) VALUES
  ('axe_core',       'AXE CORE',       'orchestrator', 'Main AI Operating System — orchestrates all agents',       ARRAY['orchestration', 'routing', 'planning'],           'active', 'openrouter', 'anthropic/claude-3.5-sonnet'),
  ('axe_companion',  'AXE Companion',  'assistant',    'Personal AI assistant — conversations, tasks, reminders',  ARRAY['fast', 'creative', 'analysis'],                   'active', 'google',     'gemini-2.0-flash'),
  ('axe_intel',      'AXE Intel',      'analyst',      'Market analysis and intelligence agent',                   ARRAY['analysis', 'research', 'reasoning'],               'active', 'openrouter', 'anthropic/claude-3.5-sonnet'),
  ('axe_trader',     'Trading OS',     'trader',       'Trading execution and risk management',                    ARRAY['analysis', 'reasoning', 'fast'],                   'active', 'openrouter', 'meta-llama/llama-3.1-8b-instruct:free'),
  ('axe_developer',  'AXE Developer',  'developer',    'Code generation, review, and deployment agent',            ARRAY['code', 'analysis', 'reasoning'],                   'active', 'openrouter', 'anthropic/claude-3.5-sonnet'),
  ('axe_ollama',     'Ollama (Local)', 'privacy',      'Local model — privacy-sensitive tasks, no data leaves VPS', ARRAY['privacy', 'fast'],                                'active', 'ollama',     'llama3.2')
ON CONFLICT (name) DO NOTHING;

-- ── Seed: Default routing rules ───────────────────────────────────────────
INSERT INTO core_routing_rules (capability, provider, model_name, priority) VALUES
  ('fast',      'google',      'gemini-2.0-flash',                        10),
  ('fast',      'ollama',      'llama3.2',                                20),
  ('code',      'openrouter',  'anthropic/claude-3.5-sonnet',             10),
  ('code',      'openrouter',  'deepseek/deepseek-coder',                 20),
  ('analysis',  'openrouter',  'anthropic/claude-3.5-sonnet',             10),
  ('analysis',  'google',      'gemini-2.0-flash',                        20),
  ('reasoning', 'openrouter',  'openai/gpt-4o',                           10),
  ('reasoning', 'anthropic',   'claude-3-5-sonnet-20241022',              20),
  ('privacy',   'ollama',      'llama3.2',                                10),
  ('creative',  'openrouter',  'anthropic/claude-3.5-sonnet',             10),
  ('creative',  'google',      'gemini-2.0-flash',                        20)
ON CONFLICT DO NOTHING;

-- ── RLS policies ────────────────────────────────────────────────────────
ALTER TABLE core_agents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_agent_calls   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_agents' AND policyname = 'service_all_core_agents') THEN
    CREATE POLICY service_all_core_agents ON core_agents USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_routing_rules' AND policyname = 'service_all_routing') THEN
    CREATE POLICY service_all_routing ON core_routing_rules USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_agent_calls' AND policyname = 'service_all_agent_calls') THEN
    CREATE POLICY service_all_agent_calls ON core_agent_calls USING (true);
  END IF;
END $$;
