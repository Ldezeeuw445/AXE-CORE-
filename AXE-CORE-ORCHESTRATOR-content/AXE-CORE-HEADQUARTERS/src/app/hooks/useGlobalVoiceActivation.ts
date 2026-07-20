import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { useClapDetector } from '@/hooks/useClapDetector';
import { useVoiceStore } from '@/store/voiceStore';
import { loadSetting } from '@/services/platform/userSettingsService';

/**
 * App-level voice bootstrapping:
 * - reloads persisted chat history from Supabase on first mount (survives refresh)
 * - arms the opt-in "clap to activate" detector once the user is logged in
 */
export function useGlobalVoiceActivation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clapEnabled, setClapEnabled] = useState(false);

  useEffect(() => {
    useVoiceStore.getState().loadConversation().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setClapEnabled(false); return; }
    loadSetting('axe_clap_activate_enabled', false).then(setClapEnabled);
  }, [user]);

  useClapDetector(clapEnabled, () => {
    const voice = useVoiceStore.getState();
    if (voice.voiceStatus === 'listening' || voice.voiceStatus === 'processing') return;
    navigate('/');
    voice.startListening().catch(() => {});
  });
}
