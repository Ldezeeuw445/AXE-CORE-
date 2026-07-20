/**
 * livekitService.ts
 * LiveKit Voice & Realtime layer for AXE CORE.
 * Manages rooms, sessions, tokens and device registration.
 * Requires: VITE_LIVEKIT_URL, VITE_LIVEKIT_TOKEN_URL (token server endpoint)
 */

import { getSupabase, SUPABASE_URL } from '@/core/supabase/client';

// ── Config ────────────────────────────────────────────────────────────────
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL ?? 'wss://axe-core-yma6pgy1.livekit.cloud';
const LIVEKIT_TOKEN_URL =
  import.meta.env.VITE_LIVEKIT_TOKEN_URL
  ?? `${SUPABASE_URL}/functions/v1/livekit-token`;

export interface LiveKitSession {
  sessionId: string;
  roomName: string;
  token: string;
  livekitUrl: string;
  identity: string;
}

export interface VoiceSettings {
  micEnabled: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  ttsLanguage: string;
  bargeInEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
  showTranscript: boolean;
  autoReconnect: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  micEnabled: true,
  noiseSuppression: true,
  echoCancellation: true,
  ttsEnabled: true,
  ttsVoice: 'alloy',
  ttsSpeed: 1.0,
  ttsLanguage: 'nl',
  bargeInEnabled: true,
  wakeWordEnabled: false,
  wakeWord: 'hey axe',
  showTranscript: true,
  autoReconnect: true,
};

// ── Device Registration ────────────────────────────────────────────────────

export async function registerDevice(userId: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const platform = navigator.platform ?? 'unknown';
  const deviceType = /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'browser';

  const { data, error } = await sb
    .from('core_devices')
    .upsert({
      user_id: userId,
      device_type: deviceType,
      user_agent: navigator.userAgent.slice(0, 255),
      platform,
      last_active_at: new Date().toISOString(),
      is_active: true,
    }, { onConflict: 'user_id,user_agent' })
    .select('id')
    .single();

  if (error) {
    console.warn('[LiveKit] Device registration failed:', error.message);
    return null;
  }
  return data?.id ?? null;
}

// ── Presence ──────────────────────────────────────────────────────────────

export async function updatePresence(
  userId: string,
  status: 'online' | 'away' | 'busy' | 'offline',
  roomName?: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  await sb.from('core_presence').upsert({
    user_id: userId,
    status,
    current_room: roomName ?? null,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ── Session Management ─────────────────────────────────────────────────────

/**
 * Request a LiveKit voice token from the token server.
 * Token server must be a trusted backend (Supabase Edge Function or Express).
 * Never generate tokens client-side.
 */
export async function requestVoiceSession(
  userId: string,
  agentName = 'axe_core',
): Promise<LiveKitSession | null> {
  if (!LIVEKIT_URL) {
    console.warn('[LiveKit] VITE_LIVEKIT_URL not set — voice disabled');
    return null;
  }
  if (!LIVEKIT_TOKEN_URL) {
    console.warn('[LiveKit] VITE_LIVEKIT_TOKEN_URL not set — cannot get token');
    return null;
  }

  const sb = getSupabase();
  const roomName = `axe-${userId.slice(0, 8)}-${Date.now()}`;
  const identity = `user:${userId}`;

  try {
    // Request token from token server
    const tokenRes = await fetch(LIVEKIT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, identity, userId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenRes.ok) throw new Error(`Token server error: ${tokenRes.status}`);
    const { token } = await tokenRes.json() as { token: string };

    // Record session in Supabase
    let sessionId = crypto.randomUUID();
    if (sb) {
      // Create room record
      await sb.from('core_livekit_rooms').insert({
        room_name: roomName,
        owner_id: userId,
        agent_name: agentName,
        status: 'active',
      });

      // Create session record
      const { data } = await sb.from('core_voice_sessions').insert({
        user_id: userId,
        room_name: roomName,
        livekit_identity: identity,
        status: 'connecting',
        agent_used: agentName,
        device_info: navigator.userAgent.slice(0, 255),
      }).select('id').single();

      if (data?.id) sessionId = data.id;

      // Update presence
      await updatePresence(userId, 'busy', roomName);
    }

    return { sessionId, roomName, token, livekitUrl: LIVEKIT_URL, identity };
  } catch (e) {
    console.error('[LiveKit] Failed to start session:', e);
    return null;
  }
}

/**
 * End a voice session — mark as disconnected in Supabase.
 */
export async function endVoiceSession(
  sessionId: string,
  userId: string,
  durationMs?: number,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  await Promise.all([
    sb.from('core_voice_sessions').update({
      status: 'disconnected',
      ended_at: new Date().toISOString(),
      duration_ms: durationMs ?? null,
    }).eq('id', sessionId),

    updatePresence(userId, 'online'),
  ]);
}

/**
 * Save a voice transcript turn to Supabase.
 */
export async function saveVoiceTurn(
  sessionId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  opts: { latencyMs?: number; modelUsed?: string; language?: string } = {},
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  await sb.from('core_voice_history').insert({
    session_id: sessionId,
    user_id: userId,
    role,
    content: content.slice(0, 8000),
    language: opts.language ?? 'nl',
    model_used: opts.modelUsed ?? null,
    latency_ms: opts.latencyMs ?? null,
  });
}

// ── Voice Settings ────────────────────────────────────────────────────────

export async function loadVoiceSettings(userId: string): Promise<VoiceSettings> {
  const sb = getSupabase();
  if (!sb) return DEFAULT_VOICE_SETTINGS;

  const { data } = await sb
    .from('core_voice_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) return DEFAULT_VOICE_SETTINGS;

  return {
    micEnabled: data.mic_enabled ?? true,
    noiseSuppression: data.noise_suppression ?? true,
    echoCancellation: data.echo_cancellation ?? true,
    ttsEnabled: data.tts_enabled ?? true,
    ttsVoice: data.tts_voice ?? 'alloy',
    ttsSpeed: data.tts_speed ?? 1.0,
    ttsLanguage: data.tts_language ?? 'nl',
    bargeInEnabled: data.barge_in_enabled ?? true,
    wakeWordEnabled: data.wake_word_enabled ?? false,
    wakeWord: data.wake_word ?? 'hey axe',
    showTranscript: data.show_transcript ?? true,
    autoReconnect: data.auto_reconnect ?? true,
  };
}

export async function saveVoiceSettings(
  userId: string,
  settings: Partial<VoiceSettings>,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  await sb.from('core_voice_settings').upsert({
    user_id: userId,
    mic_enabled: settings.micEnabled,
    noise_suppression: settings.noiseSuppression,
    echo_cancellation: settings.echoCancellation,
    tts_enabled: settings.ttsEnabled,
    tts_voice: settings.ttsVoice,
    tts_speed: settings.ttsSpeed,
    tts_language: settings.ttsLanguage,
    barge_in_enabled: settings.bargeInEnabled,
    wake_word_enabled: settings.wakeWordEnabled,
    wake_word: settings.wakeWord,
    show_transcript: settings.showTranscript,
    auto_reconnect: settings.autoReconnect,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export { LIVEKIT_URL };
export const isLiveKitConfigured = (): boolean => !!LIVEKIT_URL && !!LIVEKIT_TOKEN_URL;
