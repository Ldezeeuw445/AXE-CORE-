import { useEffect, useState, useRef, useCallback } from 'react';
import { MapPin, Wifi, MicOff, Mic, Send, ChevronDown } from 'lucide-react';
import { useUIStore } from '@/presentation/store/uiStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { VoiceWaveform } from '@/presentation/components/shared/VoiceWaveform';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useIsTablet } from '@/presentation/hooks/use-tablet';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';
import { useLocation } from 'react-router';

const SHAPE_PRESETS = [
  { key: 'core',   label: '3D Maps' },
  { key: 'galaxy', label: 'Galaxy'   },
  { key: 'dna',    label: 'DNA'      },
  { key: 'saturn', label: 'Saturn'   },
  { key: 'heart',  label: 'Heart'    },
  { key: 'sphere', label: 'Sphere'   },
  { key: 'cube',   label: 'Cube'     },
  { key: 'torus',  label: 'Torus'    },
];

function triggerMorph(key: string) {
  emitAxeEvent('axe:sphere-morph', { key });
}

export function BottomBar() {
  const { voiceState: uiVoiceState, setVoiceState, bottomBarVisible } = useUIStore();
  const location = useLocation();
  const isHome = location.pathname === '/' || location.pathname === '';
  const voice = useVoiceStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isCompact = isMobile || isTablet;
  const [typedText, setTypedText] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (uiVoiceState !== voice.voiceStatus) setVoiceState(voice.voiceStatus);
  }, [voice.voiceStatus, uiVoiceState, setVoiceState]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isListening  = voice.voiceStatus === 'listening';
  const isProcessing = voice.voiceStatus === 'processing';
  const isSpeaking   = voice.voiceStatus === 'speaking';
  const isActive     = isListening || isSpeaking || isProcessing;

  const handleVoiceClick = useCallback(async () => {
    try {
      if (voice.voiceStatus === 'idle') await voice.startListening();
      else voice.stopListening();
    } catch (e: unknown) { console.error(e); }
  }, [voice.voiceStatus, voice]);

  const handleSend = useCallback(async () => {
    try {
      if (!typedText.trim() || isActive) return;
      const text = typedText.trim();
      setTypedText('');
      await voice.sendMessage(text);
    } catch (e: unknown) { console.error(e); }
  }, [typedText, isActive, voice]);

  // All hooks above — early returns only after hooks (React #310)
  if (!bottomBarVisible) return null;
  if (isHome) return null;

  const connectedSlots = [voice.primarySlot, voice.fallback1Slot, voice.fallback2Slot].filter(Boolean);
  const activeLabel = 'AXE CORE';

  const label = isListening ? (voice.transcript || 'Luisteren… praat nu')
    : isProcessing ? 'AXE denkt…'
    : isSpeaking ? (voice.response || 'AXE praat…')
    : '';

  const focused = typedText.trim().length > 0 || isActive;

  return (
    <footer
      className="flex-shrink-0 w-full z-fixed flex flex-col justify-center px-3 md:px-4 py-2"
      style={{
        minHeight: isCompact ? '64px' : '52px',
        backgroundColor: 'var(--bg-base)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        paddingTop: 6,
        paddingBottom: 6,
        overflow: 'hidden',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1">
            <MapPin size={11} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>NL</span>
          </div>
          <span style={{ color: '#6B7280', fontSize: 10 }}>·</span>
          <div className="flex items-center gap-1">
            <Wifi size={11} style={{ color: 'var(--success)' }} />
            <span className="text-[10px]" style={{ color: 'var(--success)' }}>Online</span>
          </div>
        </div>

        <div className="relative mx-auto md:mx-0" ref={pickerRef}>
          <button
            onClick={() => setShowModelPicker(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all max-w-full"
            style={{
              background: 'var(--tint)',
              border: '1px solid var(--tint-line)',
              color: 'var(--accent-cyan)',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.05em',
              fontSize: 11,
            }}
          >
            <span className="rounded-full" style={{ width: 5, height: 5, background: isActive ? '#F59E0B' : connectedSlots.length > 0 ? '#10B981' : '#6B7280', display: 'inline-block', boxShadow: connectedSlots.length > 0 ? '0 0 4px #10B981' : 'none' }} />
            {activeLabel}
            <ChevronDown size={11} className={showModelPicker ? 'rotate-180' : ''} style={{ transition: 'transform 0.2s' }} />
          </button>
          <AnimatePresence>
            {showModelPicker && (
              <motion.div initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden min-w-[220px] z-50"
                style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 -8px 24px rgba(0,0,0,0.6)' }}>
                <div className="px-3 py-2 text-[10px] font-mono tracking-wider uppercase" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Sphere morph</div>
                <div className="p-1.5 grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                  {SHAPE_PRESETS.map(p => (
                    <button key={p.key} type="button" onClick={() => { triggerMorph(p.key); setShowModelPicker(false); }}
                      className="text-left px-2.5 py-1.5 rounded-lg text-[11px]" style={{ color: '#F5F0E6' }}>{p.label}</button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          {voice.apiKeyValid === true && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>API OK</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleVoiceClick} className="flex-shrink-0 flex items-center justify-center rounded-full transition-all active:scale-95"
          style={{ width: 36, height: 36, background: isListening ? 'var(--tint-line)' : isActive ? 'rgba(239,68,68,0.12)' : 'var(--bg-surface)', border: `1px solid ${isListening ? 'var(--tint-line)' : isActive ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.1)'}` }}
          title={isActive ? 'Stop' : 'Praat met AXE'}>
          {isActive ? <MicOff size={15} style={{ color: 'var(--error)' }} /> : <Mic size={15} style={{ color: '#B0B5BE' }} />}
        </button>

        <div className={`flex-1 axe-gemini-shell-subtle ${focused ? 'is-active' : ''}`} style={{ height: 36 }}>
          <div className="axe-gemini-inner-subtle">
            {isActive && label ? (
              <div className="flex-1 flex items-center px-4 gap-2 overflow-hidden">
                {isListening && <VoiceWaveform isActive={true} barCount={8} />}
                <span className="text-sm truncate" style={{ color: isListening ? 'var(--accent-cyan)' : isProcessing ? 'var(--warning)' : '#3B82F6' }}>{label}</span>
              </div>
            ) : (
              <input ref={inputRef} type="text" value={typedText} onChange={e => setTypedText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSend(); }}
                placeholder="Ask AXE anything..." className="flex-1 px-4 outline-none bg-transparent"
                style={{ color: '#F5F0E6', fontSize: 13, height: '100%' }} />
            )}
          </div>
        </div>

        <button onClick={() => void handleSend()} disabled={isActive || !typedText.trim()}
          className="flex-shrink-0 flex items-center justify-center rounded-full transition-all active:scale-95"
          style={{ width: 36, height: 36, background: (!isActive && typedText.trim()) ? 'linear-gradient(135deg, #22D3EE, #06B6D4)' : '#0A0A0A', border: `1px solid ${(!isActive && typedText.trim()) ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.1)'}`, opacity: isActive || !typedText.trim() ? 0.45 : 1 }}>
          <Send size={14} style={{ color: (!isActive && typedText.trim()) ? '#000' : 'var(--text-secondary)' }} />
        </button>
      </div>
    </footer>
  );
}
