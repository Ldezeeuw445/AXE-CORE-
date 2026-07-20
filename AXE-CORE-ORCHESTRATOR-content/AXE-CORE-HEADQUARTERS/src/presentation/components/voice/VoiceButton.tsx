/**
 * VoiceButton.tsx
 * LiveKit voice session toggle button for AXE CORE.
 * Shows current state, microphone indicator, and session controls.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Phone, PhoneOff, Loader2, Volume2 } from 'lucide-react';
import { useLiveKit, type VoiceState } from '@/presentation/hooks/useLiveKit';
import { useAuth } from '@/presentation/contexts/AuthContext';

interface VoiceButtonProps {
  compact?: boolean;
  className?: string;
}

const STATE_COLORS: Record<VoiceState, string> = {
  idle:          'rgba(255,255,255,0.15)',
  requesting:    'rgba(251,191,36,0.4)',
  connecting:    'rgba(251,191,36,0.6)',
  connected:     'rgba(34,211,238,0.4)',
  listening:     'rgba(34,211,238,0.8)',
  processing:    'rgba(168,85,247,0.6)',
  speaking:      'rgba(34,211,238,0.6)',
  disconnecting: 'rgba(255,255,255,0.2)',
  error:         'rgba(239,68,68,0.6)',
};

const STATE_LABELS: Record<VoiceState, string> = {
  idle:          'Klik om te praten',
  requesting:    'Verbinding opzetten...',
  connecting:    'Verbinden...',
  connected:     'Verbonden',
  listening:     'Luisteren...',
  processing:    'Denken...',
  speaking:      'Aan het antwoorden...',
  disconnecting: 'Verbinding verbreken...',
  error:         'Fout',
};

export default function VoiceButton({ compact = false, className = '' }: VoiceButtonProps) {
  const { user } = useAuth();
  const { state, error, isConfigured, start, stop } = useLiveKit(user?.id ?? null);

  const isActive = ['connected', 'listening', 'processing', 'speaking'].includes(state);
  const isBusy   = ['requesting', 'connecting', 'disconnecting'].includes(state);
  const color    = STATE_COLORS[state];

  const handleClick = () => {
    if (isBusy) return;
    if (isActive) stop();
    else start();
  };

  if (!isConfigured) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${className}`}
        style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
        title="LiveKit not configured — add VITE_LIVEKIT_URL"
      >
        <MicOff size={12} />
        {!compact && <span>Voice</span>}
      </div>
    );
  }

  if (compact) {
    return (
      <motion.button
        onClick={handleClick}
        disabled={isBusy}
        className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-all ${className}`}
        style={{ background: color, border: `1px solid ${color}` }}
        whileTap={{ scale: 0.92 }}
        title={STATE_LABELS[state]}
      >
        {isBusy ? (
          <Loader2 size={14} className="animate-spin" style={{ color: '#fff' }} />
        ) : isActive ? (
          <motion.div
            animate={{ scale: state === 'listening' ? [1, 1.2, 1] : 1 }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          >
            {state === 'speaking' ? (
              <Volume2 size={14} style={{ color: '#fff' }} />
            ) : (
              <Mic size={14} style={{ color: '#fff' }} />
            )}
          </motion.div>
        ) : (
          <Mic size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
        )}

        {/* Pulsing ring when listening */}
        <AnimatePresence>
          {state === 'listening' && (
            <motion.div
              className="absolute inset-0 rounded-lg"
              style={{ border: '2px solid rgba(34,211,238,0.6)' }}
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
        </AnimatePresence>
      </motion.button>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Main button */}
      <motion.button
        onClick={handleClick}
        disabled={isBusy}
        className="relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
        style={{
          background: color,
          border: `1px solid ${color}`,
          cursor: isBusy ? 'not-allowed' : 'pointer',
        }}
        whileTap={{ scale: isBusy ? 1 : 0.97 }}
      >
        <div className="relative">
          {isBusy ? (
            <Loader2 size={18} className="animate-spin" style={{ color: '#fff' }} />
          ) : isActive ? (
            state === 'speaking' ? <Volume2 size={18} style={{ color: '#fff' }} /> : <Mic size={18} style={{ color: '#fff' }} />
          ) : (
            <Mic size={18} style={{ color: 'rgba(255,255,255,0.7)' }} />
          )}

          <AnimatePresence>
            {state === 'listening' && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: '2px solid rgba(34,211,238,0.8)' }}
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 2.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 text-left">
          <div className="text-sm font-medium" style={{ color: '#fff' }}>
            {isActive ? 'Gesprek actief' : 'Praat met AXE'}
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {STATE_LABELS[state]}
          </div>
        </div>

        {isActive && (
          <PhoneOff size={16} style={{ color: 'rgba(255,255,255,0.7)' }} />
        )}
      </motion.button>

      {/* Error message */}
      {error && (
        <p className="text-xs px-1" style={{ color: 'rgba(239,68,68,0.8)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
