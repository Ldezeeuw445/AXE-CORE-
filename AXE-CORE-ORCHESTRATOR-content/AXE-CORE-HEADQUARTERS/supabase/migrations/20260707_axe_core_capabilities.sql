-- AXE CORE — Capability Registry
-- Migration: 20260707_axe_core_capabilities.sql
-- Replaces hardcoded if/else routing with database-driven capability configuration.
-- CORE queries this table to decide which model/agent handles each task type.

CREATE TABLE IF NOT EXISTS core_capabilities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability       TEXT NOT NULL UNIQUE,        -- 'code' | 'analysis' | 'fast' | 'privacy' | 'creative' | 'reasoning' | 'trading' | 'vision' | 'email' | 'research'
  display_name     TEXT NOT NULL,
  description      TEXT,
  -- Model routing
  preferred_provider TEXT,                       -- 'openrouter' | 'google' | 'anthropic' | 'ollama'
  preferred_model  TEXT,                         -- e.g. 'anthropic/claude-3.5-sonnet'
  fallback_provider TEXT,
  fallback_model   TEXT,
  -- Agent routing
  preferred_agent  TEXT,                         -- references core_agents.name
  fallback_agent   TEXT,
  -- Priority axes (1-100, higher = more weight)
  cost_priority    INT DEFAULT 50,               -- 100 = minimize cost, 1 = ignore cost
  speed_priority   INT DEFAULT 50,               -- 100 = minimize latency
  quality_priority INT DEFAULT 50,               -- 100 = maximize quality
  -- Flags
  privacy_required BOOLEAN DEFAULT false,        -- true = never send to cloud models
  stream_required  BOOLEAN DEFAULT true,
  enabled          BOOLEAN DEFAULT true,
  -- Keyword patterns for auto-classification (JSON array of regex strings)
  keyword_patterns JSONB DEFAULT '[]',
  -- Metadata
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Seed: Default capabilities ─────────────────────────────────────────────
INSERT INTO core_capabilities (
  capability, display_name, description,
  preferred_provider, preferred_model,
  fallback_provider, fallback_model,
  preferred_agent,
  cost_priority, speed_priority, quality_priority,
  privacy_required, keyword_patterns
) VALUES
  (
    'fast', 'Fast Response', 'Quick answers, simple questions, chitchat',
    'google', 'gemini-2.0-flash',
    'ollama', 'llama3.2',
    'axe_companion',
    80, 90, 40,
    false,
    '[]'
  ),
  (
    'code', 'Code Generation', 'Code writing, debugging, review, architecture',
    'openrouter', 'anthropic/claude-3.5-sonnet',
    'openrouter', 'deepseek/deepseek-coder',
    'axe_developer',
    30, 40, 100,
    false,
    '["\\bcode\\b","debug","function","class","typescript","javascript","python","react","bug","syntax","implement","refactor","component","endpoint","sql","query","script"]'
  ),
  (
    'analysis', 'Deep Analysis', 'Research, strategy, architecture planning, comparisons',
    'openrouter', 'anthropic/claude-3.5-sonnet',
    'google', 'gemini-2.0-flash',
    'axe_intel',
    30, 30, 100,
    false,
    '["analys","research","strateg","vergelijk","compare","architect","roadmap","explain","hoe werkt","waarom","how does","trade-off"]'
  ),
  (
    'reasoning', 'Reasoning', 'Multi-step reasoning, calculations, what-if scenarios',
    'openrouter', 'openai/gpt-4o',
    'anthropic', 'claude-3-5-sonnet-20241022',
    'axe_intel',
    30, 40, 100,
    false,
    '["why does","what if","calculate","bereken","redeneer","pro\\b","cons\\b","voor- en nadelen","als .* dan"]'
  ),
  (
    'privacy', 'Private / Local', 'Sensitive data — passwords, personal info, secrets',
    'ollama', 'llama3.2',
    'ollama', 'llama3.2',
    'axe_ollama',
    50, 50, 60,
    true,
    '["password","wachtwoord","private","prive","secret","geheim","bankrekening","bsn","credentials","pincode"]'
  ),
  (
    'creative', 'Creative Writing', 'Writing, brainstorming, campaigns, descriptions',
    'openrouter', 'anthropic/claude-3.5-sonnet',
    'google', 'gemini-2.0-flash',
    'axe_companion',
    40, 50, 90,
    false,
    '["schrijf","write","brainstorm","idee","creative","campaign","copywriting","beschrijf","stel je voor"]'
  ),
  (
    'trading', 'Trading & Markets', 'Market analysis, trade ideas, risk assessment',
    'openrouter', 'anthropic/claude-3.5-sonnet',
    'openrouter', 'meta-llama/llama-3.1-8b-instruct:free',
    'axe_trader',
    50, 60, 90,
    false,
    '["trade","market","signal","forex","crypto","stock","risk","leverage","position","pip","spread","bullish","bearish"]'
  ),
  (
    'vision', 'Vision / Image', 'Image analysis, screenshots, visual data',
    'openrouter', 'openai/gpt-4o',
    'google', 'gemini-2.0-flash',
    'axe_intel',
    50, 60, 95,
    false,
    '[]'
  ),
  (
    'email', 'Email & Communication', 'Writing emails, messages, summaries',
    'google', 'gemini-2.0-flash',
    'openrouter', 'anthropic/claude-3.5-sonnet',
    'axe_companion',
    70, 70, 80,
    false,
    '["email","mail","bericht","message","write to","stuur","sms","whatsapp"]'
  ),
  (
    'research', 'Research', 'Deep research, fact-finding, summarization',
    'openrouter', 'anthropic/claude-3.5-sonnet',
    'google', 'gemini-2.0-flash',
    'axe_intel',
    30, 30, 100,
    false,
    '["research","zoek op","find out","what is","wie is","when was","history of","tell me about"]'
  )
ON CONFLICT (capability) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE core_capabilities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_capabilities' AND policyname = 'svc_core_capabilities') THEN
    CREATE POLICY svc_core_capabilities ON core_capabilities USING (true);
  END IF;
END $$;
