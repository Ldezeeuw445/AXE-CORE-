-- AXE CORE — n8n Automation Foundation
-- Migration: 20260707_axe_core_n8n.sql
-- Complete automation platform registry. Extends core_workflows/tools.
-- CORE can discover, create, execute and monitor every workflow.

-- ── trigger_registry: All possible triggers ───────────────────────────────
CREATE TABLE IF NOT EXISTS trigger_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,          -- 'supabase_insert', 'cron_daily', 'webhook_post'
  display_name    TEXT NOT NULL,
  trigger_type    TEXT NOT NULL,                 -- 'webhook' | 'schedule' | 'event' | 'database' | 'manual'
  platform        TEXT DEFAULT 'n8n',
  description     TEXT,
  -- Config schema for this trigger type
  config_schema   JSONB DEFAULT '{}',            -- JSON Schema of required config fields
  example_config  JSONB DEFAULT '{}',
  -- For database triggers
  table_name      TEXT,
  event_type      TEXT,                          -- 'INSERT' | 'UPDATE' | 'DELETE'
  -- For schedule triggers
  cron_expression TEXT,                          -- '0 9 * * 1-5' (weekdays 9am)
  -- Webhook
  webhook_path    TEXT,                          -- '/webhook/daily-health'
  http_method     TEXT DEFAULT 'POST',
  enabled         BOOLEAN DEFAULT true,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── automation_registry: Automation templates ─────────────────────────────
CREATE TABLE IF NOT EXISTS automation_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,          -- 'welcome_user', 'memory_sync'
  display_name    TEXT NOT NULL,
  description     TEXT,
  category        TEXT,                          -- 'onboarding' | 'maintenance' | 'notification' | 'integration'
  -- n8n workflow
  workflow_id     UUID REFERENCES core_workflows(id) ON DELETE SET NULL,
  n8n_workflow_id TEXT,                          -- actual n8n workflow UUID
  n8n_json        JSONB DEFAULT '{}',            -- full n8n workflow JSON (importable)
  -- Trigger
  trigger_id      UUID REFERENCES trigger_registry(id) ON DELETE SET NULL,
  -- Apps that can register this automation
  app_name        TEXT,                          -- which app owns this
  agent_name      TEXT,                          -- which agent executes it
  -- Status
  status          TEXT DEFAULT 'draft',          -- 'draft' | 'active' | 'paused' | 'error'
  is_template     BOOLEAN DEFAULT false,         -- can other apps copy this?
  -- Stats
  run_count       INT DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT,
  error_count     INT DEFAULT 0,
  -- Config
  default_config  JSONB DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── execution_logs: Detailed execution log ────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   UUID REFERENCES automation_registry(id) ON DELETE SET NULL,
  workflow_id     UUID REFERENCES core_workflows(id) ON DELETE SET NULL,
  n8n_execution_id TEXT,                         -- n8n's own execution ID
  triggered_by    TEXT DEFAULT 'manual',         -- 'agent:axe_core' | 'schedule' | 'webhook' | 'manual'
  trigger_data    JSONB DEFAULT '{}',            -- what triggered this run
  input_data      JSONB DEFAULT '{}',
  output_data     JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'running',        -- 'running' | 'success' | 'failed' | 'cancelled' | 'timeout'
  steps_total     INT DEFAULT 0,
  steps_completed INT DEFAULT 0,
  error_message   TEXT,
  error_step      TEXT,                          -- which n8n node failed
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INT,
  retried_from    UUID REFERENCES execution_logs(id),  -- if this is a retry
  retry_count     INT DEFAULT 0,
  metadata        JSONB DEFAULT '{}'
);

-- ── audit_trail: All system actions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_trail (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor           TEXT NOT NULL,                 -- 'user:uuid' | 'agent:axe_core' | 'system' | 'n8n'
  action          TEXT NOT NULL,                 -- 'workflow.create' | 'agent.call' | 'auth.login'
  resource_type   TEXT,                          -- 'workflow' | 'agent' | 'application'
  resource_id     TEXT,
  resource_name   TEXT,
  details         JSONB DEFAULT '{}',            -- full action details
  ip_address      INET,
  user_agent      TEXT,
  session_id      TEXT,
  success         BOOLEAN DEFAULT true,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_execution_logs_automation_id ON execution_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_status        ON execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_execution_logs_started_at    ON execution_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_actor            ON audit_trail(actor);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action           ON audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at       ON audit_trail(created_at DESC);

-- ── Seed: Trigger registry ─────────────────────────────────────────────────
INSERT INTO trigger_registry (name, display_name, trigger_type, description, cron_expression) VALUES
  ('manual',           'Manual Trigger',       'manual',   'Triggered manually by user or agent', NULL),
  ('cron_daily_9am',   'Daily 9am',            'schedule', 'Every weekday at 9am',                '0 9 * * 1-5'),
  ('cron_hourly',      'Every Hour',           'schedule', 'Every hour',                          '0 * * * *'),
  ('cron_midnight',    'Daily Midnight',       'schedule', 'Every day at midnight',               '0 0 * * *'),
  ('webhook_post',     'Webhook (POST)',       'webhook',  'HTTP POST webhook trigger',           NULL),
  ('db_user_insert',   'New User',             'database', 'Fires when a user signs up',          NULL),
  ('db_agent_call',    'Agent Called',         'database', 'Fires when core_agent_calls has INSERT', NULL),
  ('event_login',      'User Login',           'event',    'Fires on Supabase auth login event',  NULL)
ON CONFLICT (name) DO NOTHING;

-- ── Seed: Automation templates ─────────────────────────────────────────────
INSERT INTO automation_registry (name, display_name, description, category, status, is_template, app_name, agent_name) VALUES
  ('welcome_user',        'Welcome User',         'Send welcome message to new users',                'onboarding',     'draft', true,  'axe_core',      'axe_companion'),
  ('memory_sync',         'Memory Sync',          'Sync conversation history to Supabase',            'maintenance',    'draft', true,  'axe_core',      'axe_core'),
  ('agent_dispatcher',    'Agent Dispatcher',     'Route tasks from CORE to specialized agents',      'integration',    'draft', true,  'axe_core',      'axe_core'),
  ('notification_center', 'Notification Center',  'Send notifications via email/push/Slack',          'notification',   'draft', true,  'axe_core',      'axe_companion'),
  ('github_automation',   'GitHub Automation',    'Create issues, PRs, branches via n8n',             'integration',    'draft', true,  'axe_core',      'axe_developer'),
  ('supabase_maintenance','Supabase Maintenance',  'Clean up old logs, optimize tables',               'maintenance',    'draft', true,  'axe_core',      'axe_core'),
  ('daily_health_check',  'Daily Health Check',   'Check all services and send report',               'maintenance',    'draft', true,  'axe_core',      'axe_core'),
  ('backup_workflow',     'Backup Workflow',      'Backup critical data to external storage',         'maintenance',    'draft', true,  'axe_core',      'axe_core'),
  ('scheduled_cleanup',   'Scheduled Cleanup',    'Remove old sessions, logs and temp data',          'maintenance',    'draft', true,  'axe_core',      'axe_core'),
  ('deployment_pipeline', 'Deployment Pipeline',  'Trigger Vercel/Railway deploys via webhook',       'integration',    'draft', true,  'axe_core',      'axe_developer')
ON CONFLICT (name) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE trigger_registry    ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail         ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'trigger_registry' AND policyname = 'svc_triggers') THEN
    CREATE POLICY svc_triggers    ON trigger_registry    USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'automation_registry' AND policyname = 'svc_automations') THEN
    CREATE POLICY svc_automations ON automation_registry USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'execution_logs' AND policyname = 'svc_exec_logs') THEN
    CREATE POLICY svc_exec_logs   ON execution_logs      USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'audit_trail' AND policyname = 'svc_audit') THEN
    CREATE POLICY svc_audit       ON audit_trail         USING (true);
  END IF;
END $$;
