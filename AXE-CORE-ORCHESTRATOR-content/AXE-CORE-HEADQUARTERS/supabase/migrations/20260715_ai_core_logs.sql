-- AI Core Logs Table
-- Stores persistent AI logs for scroll-back history (like WhatsApp)
CREATE TABLE IF NOT EXISTS ai_core_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug', 'system')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_core_logs_session ON ai_core_logs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_core_logs_user ON ai_core_logs(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE ai_core_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON ai_core_logs
  FOR ALL TO PUBLIC USING (true) WITH CHECK (true);