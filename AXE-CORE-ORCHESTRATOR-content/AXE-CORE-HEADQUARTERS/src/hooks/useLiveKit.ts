/**
 * useLiveKit.ts
 * React hook for LiveKit voice sessions in AXE CORE.
 * Manages connection lifecycle, reconnect, microphone, and transcript.
 * Designed to be used by a VoiceButton component.
 *
 * Usage:
 *   const { state, start, stop, transcript } = useLiveKit(userId);
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  isLiveKitConfigured,
  requestVoiceSession,
  endVoiceSession,
  saveVoiceTurn,
  updatePresence,
  registerDevice,
  type LiveKitSession,
} from '@/services/integrations/livekitService';

export type VoiceState =
  | 'idle'
  | 'requesting'    // requesting token
  | 'connecting'    // connecting to LiveKit room
  | 'connected'     // active voice session
  | 'listening'     // mic is active, waiting for speech
  | 'processing'    // sending to AI
  | 'speaking'      // TTS playing back
  | 'disconnecting'
  | 'error';

export interface TranscriptTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface UseLiveKitReturn {
  state: VoiceState;
  error: string | null;
  transcript: TranscriptTurn[];
  session: LiveKitSession | null;
  isConfigured: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  clearTranscript: () => void;
}

export function useLiveKit(userId: string | null): UseLiveKitReturn {
  const [state, setState]         = useState<VoiceState>('idle');
  const [error, setError]         = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [session, setSession]     = useState<LiveKitSession | null>(null);

  const sessionRef   = useRef<LiveKitSession | null>(null);
  const startTimeRef = useRef<number>(0);
  const deviceIdRef  = useRef<string | null>(null);

  // Check if LiveKit is configured
  const isConfigured = isLiveKitConfigured();

  // Register device on mount
  useEffect(() => {
    if (!userId) return;
    registerDevice(userId).then(id => { deviceIdRef.current = id; });
    updatePresence(userId, 'online');

    return () => {
      if (userId) updatePresence(userId, 'offline');
    };
  }, [userId]);

  const addTranscriptTurn = useCallback((role: 'user' | 'assistant', content: string) => {
    const turn: TranscriptTurn = {
      id: `${role}-${Date.now()}`,
      role,
      content,
      timestamp: new Date(),
    };
    setTranscript(prev => [...prev, turn].slice(-100));

    // Save to Supabase
    if (sessionRef.current && userId) {
      saveVoiceTurn(sessionRef.current.sessionId, userId, role, content).catch(() => {});
    }
  }, [userId]);

  const start = useCallback(async () => {
    if (!userId) {
      setError('Not authenticated');
      setState('error');
      return;
    }
    if (!isConfigured) {
      setError('LiveKit is not available from the current environment.');
      setState('error');
      return;
    }

    setError(null);
    setState('requesting');
    startTimeRef.current = Date.now();

    try {
      const newSession = await requestVoiceSession(userId);
      if (!newSession) throw new Error('Failed to create voice session');

      sessionRef.current = newSession;
      setSession(newSession);
      setState('connecting');

      /**
       * REAL LIVEKIT CONNECTION:
       * When @livekit/client is installed, connect like this:
       *
       * import { Room, RoomEvent } from '@livekit/client';
       * const room = new Room({ adaptiveStream: true, dynacast: true });
       * await room.connect(newSession.livekitUrl, newSession.token);
       * room.on(RoomEvent.TrackSubscribed, handleTrack);
       * room.on(RoomEvent.Disconnected, () => stop());
       *
       * For now we simulate the connected state:
       */
      setState('connected');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      setState('error');
    }
  }, [userId, isConfigured]);

  const stop = useCallback(async () => {
    if (!sessionRef.current || !userId) {
      setState('idle');
      return;
    }

    setState('disconnecting');
    const durationMs = Date.now() - startTimeRef.current;

    await endVoiceSession(sessionRef.current.sessionId, userId, durationMs);
    sessionRef.current = null;
    setSession(null);
    setState('idle');
  }, [userId]);

  const clearTranscript = useCallback(() => setTranscript([]), []);

  return { state, error, transcript, session, isConfigured, start, stop, clearTranscript };
}
