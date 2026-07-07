-- AXE CORE — LiveKit Voice & Realtime Layer
-- Migration: 20260707_axe_core_livekit.sql
-- Stores voice sessions, rooms, history and device presence for LiveKit integration.
-- Every logged-in Supabase user automatically gets a LiveKit identity.

-- ── core_devices: Device registry per user ───────────────────────────────
CREATE TABLE IF NOT EXISTS core_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,                  -- Supabase auth.users.id
  device_name   TEXT,                            -- 'MacBook Pro', 'iPhone 15'
  device_type   TEXT DEFAULT 'browser',          -- 'browser' | 'mobile' | 'desktop' | 'tablet'
  user_agent    TEXT,
  platform      TEXT,                            -- 'macOS', 'iOS', 'Android', 'Windows'
  push_token    TEXT,                            -- for future push notifications
  last_active_at TIMESTAMPTZ DEFAULT now(),
  is_active     BOOLEAN DEFAULT true,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── core_presence: Realtime user presence ────────────────────────────────
CREATE TABLE IF NOT EXISTS core_presence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE,
  status        TEXT DEFAULT 'offline',          -- 'online' | 'away' | 'busy' | 'offline'
  current_room  TEXT,
  device_id     UUID REFERENCES core_devices(id) ON DELETE SET NULL,
  last_seen_at  TIMESTAMPTZ DEFAULT now(),
  metadata      JSONB DEFAULT '{}'
);

-- ── core_livekit_rooms: Room registry ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS core_livekit_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name     TEXT NOT NULL UNIQUE,            -- e.g. 'axe-core-user123-1720000000'
  display_name  TEXT,
  room_type     TEXT DEFAULT 'voice',            -- 'voice' | 'video' | 'screen_share'
  owner_id      UUID,                            -- Supabase user ID
  agent_name    TEXT,                            -- which AXE agent is in this room
  max_participants INT DEFAULT 2,
  status        TEXT DEFAULT 'active',           -- 'active' | 'closed' | 'error'
  livekit_sid   TEXT,                            -- LiveKit server room SID
  started_at    TIMESTAMPTZ DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  metadata      JSONB DEFAULT '{}'
);

-- ── core_voice_sessions: Individual voice sessions ───────────────────────
CREATE TABLE IF NOT EXISTS core_voice_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  room_id         UUID REFERENCES core_livekit_rooms(id) ON DELETE SET NULL,
  room_name       TEXT NOT NULL,
  device_id       UUID REFERENCES core_devices(id) ON DELETE SET NULL,
  livekit_token   TEXT,                          -- JWT token (short-lived, safe to store briefly)
  livekit_identity TEXT,                         -- e.g. 'user:uuid'
  status          TEXT DEFAULT 'connecting',     -- 'connecting' | 'connected' | 'disconnected' | 'error'
  agent_used      TEXT,                          -- which agent handled this session
  model_used      TEXT,
  capability_used TEXT,
  device_info     TEXT,                          -- navigator.userAgent
  duration_ms     INT,
  turn_count      INT DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'
);

-- ── core_voice_history: Transcript of voice conversations ─────────────────
CREATE TABLE IF NOT EXISTS core_voice_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES core_voice_sessions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  role            TEXT NOT NULL,                 -- 'user' | 'assistant' | 'system'
  content         TEXT NOT NULL,                 -- transcript text
  audio_url       TEXT,                          -- optional: stored audio clip
  confidence      FLOAT,                         -- ASR confidence 0-1
  language        TEXT DEFAULT 'nl',
  model_used      TEXT,
  tokens_in       INT,
  tokens_out      INT,
  latency_ms      INT,
  timestamp       TIMESTAMPTZ DEFAULT now()
);

-- ── core_voice_settings: Per-user voice preferences ──────────────────────
CREATE TABLE IF NOT EXISTS core_voice_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE,
  -- Microphone
  mic_enabled       BOOLEAN DEFAULT true,
  noise_suppression BOOLEAN DEFAULT true,
  echo_cancellation BOOLEAN DEFAULT true,
  auto_gain         BOOLEAN DEFAULT true,
  -- Wake word
  wake_word_enabled BOOLEAN DEFAULT false,
  wake_word         TEXT DEFAULT 'hey axe',
  -- Voice output
  tts_enabled       BOOLEAN DEFAULT true,
  tts_voice         TEXT DEFAULT 'alloy',        -- OpenAI TTS voice
  tts_speed         FLOAT DEFAULT 1.0,
  tts_language      TEXT DEFAULT 'nl',
  -- Barge-in (interruptions)
  barge_in_enabled  BOOLEAN DEFAULT true,
  barge_in_threshold FLOAT DEFAULT 0.5,
  -- Display
  show_transcript   BOOLEAN DEFAULT true,
  auto_scroll       BOOLEAN DEFAULT true,
  -- Reconnect
  auto_reconnect    BOOLEAN DEFAULT true,
  reconnect_attempts INT DEFAULT 3,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_id    ON core_voice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_status     ON core_voice_sessions(status);
CREATE INDEX IF NOT EXISTS idx_voice_history_session_id  ON core_voice_history(session_id);
CREATE INDEX IF NOT EXISTS idx_voice_history_user_id     ON core_voice_history(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id           ON core_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_presence_user_id          ON core_presence(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE core_devices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_presence       ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_livekit_rooms  ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_voice_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_voice_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_devices' AND policyname = 'svc_devices') THEN
    CREATE POLICY svc_devices        ON core_devices        USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_presence' AND policyname = 'svc_presence') THEN
    CREATE POLICY svc_presence       ON core_presence       USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_livekit_rooms' AND policyname = 'svc_livekit_rooms') THEN
    CREATE POLICY svc_livekit_rooms  ON core_livekit_rooms  USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_voice_sessions' AND policyname = 'svc_voice_sessions') THEN
    CREATE POLICY svc_voice_sessions ON core_voice_sessions USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_voice_history' AND policyname = 'svc_voice_history') THEN
    CREATE POLICY svc_voice_history  ON core_voice_history  USING (true);
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'core_voice_settings' AND policyname = 'svc_voice_settings') THEN
    CREATE POLICY svc_voice_settings ON core_voice_settings USING (true);
  END IF;
END $$;
