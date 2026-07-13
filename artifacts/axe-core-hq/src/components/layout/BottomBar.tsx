import { useEffect, useState, useRef, useCallback } from 'react';
import { MapPin, Cloud, Wifi, MicOff, Mic, Send, ChevronDown, Check, Hexagon } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore, PROVIDERS } from '@/store/voiceStore';
import { VoiceWaveform } from '@/components/shared/VoiceWaveform';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsTablet } from '@/hooks/use-tablet';

const SHAPE_PRESETS = [
  { key: 'core',   label: 'AXE Core' },
  { key: 'galaxy', label: 'Galaxy'   },
  { key: 'dna',    label: 'DNA'      },
  { key: 'saturn', label: 'Saturn'   },
  { key: 'heart',  label: 'Heart'    },
  { key: 'sphere', label: 'Sphere'   },
  { key: 'cube',   label: 'Cube'     },
  { key: 'torus',  label: 'Torus'    },
];

function triggerMorph(key: string) {
  window.dispatchEvent(new CustomEvent('axe-sphere-morph', { detail: { key } }));
}

export function BottomBar() {
  const { voiceState: uiVoiceState, setVoiceState, bottomBarVisible } = useUIStore();
  const voice = useVoiceStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Desktop's chat lives in the sidebar; below 1024px the sidebar is a hidden
  // drawer, so phone AND tablet both need the inline composer visible.
  const isCompact = isMobile || isTablet;
  const [typedText, setTypedText] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Selected model override (null = AXE Core default)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  useEffect(() => {
    if (uiVoiceState !== voice.voiceStatus) setVoiceState(voice.voiceStatus);
  }, [voice.voiceStatus, uiVoiceState, setVoiceState]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowModelPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!bottomBarVisible) return null;

  const isListening  = voice.voiceStatus === 'listening';
  const isProcessing = voice.voiceStatus === 'processing';
  const isSpeaking   = voice.voiceStatus === 'speaking';
  const isActive     = isListening || isSpeaking || isProcessing;

  // Determine active model label
  const connectedSlots = [voice.primarySlot, voice.fallback1Slot, voice.fallback2Slot].filter(Boolean);
  const primaryCfg = voice.primarySlot ? PROVIDERS.find(p => p.id === voice.primarySlot!.provider) : null;
  const activeLabel = selectedProvider
    ? PROVIDERS.find(p => p.id === selectedProvider)?.name ?? 'AXE Core'
    : primaryCfg?.name ? `AXE Core · ${primaryCfg.name}` : 'AXE CORE';

  const handleVoiceClick = useCallback(async () => {
    try {
      // Mic works even without API key
      if (voice.voiceStatus === 'idle') await voice.startListening();
      else voice.stopListening();
    } catch (e: unknown) { console.error(e); }
  }, [voice.voiceStatus]);

  const handleSend = useCallback(async () => {
    try {
      if (!typedText.trim() || isActive) return;
      const text = typedText.trim();
      setTypedText('');
      await voice.sendMessage(text);
    } catch (e: unknown) { console.error(e); }
  }, [typedText, isActive]);

  const label = isListening ? (voice.transcript || 'Listening...')
    : isProcessing ? 'AXE is thinking...'
    : isSpeaking ? (voice.response || 'Speaking...')
    : '';

  return (
    <footer
      className="flex-shrink-0 w-full z-fixed flex flex-col justify-center px-3 md:px-4"
      style={{
        minHeight: isCompact ? '80px' : '40px',
        backgroundColor: '#000000',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Top row: location + model selector + status — compact on desktop */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left: location */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1"><MapPin size={11} style={{ color: 'var(--text-muted)' }} /><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>NL</span></div>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>·</span>
          <div className="flex items-center gap-1"><Wifi size={11} style={{ color: 'var(--success)' }} /><span className="text-[10px]" style={{ color: 'var(--success)' }}>Online</span></div>
        </div>

        {/* CENTER: AXE Core model selector */}
        <div className="relative mx-auto md:mx-0" ref={pickerRef}>
          <button
            onClick={() => setShowModelPicker(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs-custom font-medium transition-all max-w-full"
            style={{
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.25)',
              color: 'var(--accent-cyan)',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.05em',
            }}
          >
            <span className="rounded-full" style={{ width: 5, height: 5, background: isActive ? 'var(--warning)' : connectedSlots.length > 0 ? 'var(--success)' : 'var(--text-muted)', display: 'inline-block', boxShadow: connectedSlots.length > 0 ? '0 0 4px var(--success)' : 'none' }} />
            {activeLabel}
            <ChevronDown size={11} className={showModelPicker ? 'rotate-180' : ''} style={{ transition: 'transform 0.2s' }} />
          </button>

          <AnimatePresence>
            {showModelPicker && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden min-w-[220px]"
                style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -8px 24px rgba(0,0,0,0.6)' }}
              >
                {/* AXE Core (default) */}
                <button
                  onClick={() => { setSelectedProvider(null); setShowModelPicker(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs-custom transition-all"
                  style={{ color: !selectedProvider ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full" style={{ width: 5, height: 5, background: connectedSlots.length > 0 ? 'var(--success)' : 'var(--text-muted)', display: 'inline-block' }} />
                    <span className="font-medium">AXE Core</span>
                    {primaryCfg && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>via {primaryCfg.name}</span>}
                  </div>
                  {!selectedProvider && <Check size={11} />}
                </button>

                {/* Other connected providers */}
                {connectedSlots.length > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', margin: '0 8px' }} />
                    <div className="px-3 py-1">
                      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Direct model access</span>
                    </div>
                    {connectedSlots.map((slot, i) => {
                      if (!slot) return null;
                      const cfg = PROVIDERS.find(p => p.id === slot.provider);
                      return (
                        <button
                          key={i}
                          onClick={() => { setSelectedProvider(slot.provider); setShowModelPicker(false); }}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs-custom transition-all"
                          style={{ color: selectedProvider === slot.provider ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded-full" style={{ width: 4, height: 4, background: 'var(--success)', display: 'inline-block' }} />
                            <span>{cfg?.name ?? slot.provider}</span>
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{slot.model ?? cfg?.defaultModel}</span>
                          </div>
                          {selectedProvider === slot.provider && <Check size={11} />}
                        </button>
                      );
                    })}
                  </>
                )}

                {connectedSlots.length === 0 && (
                  <div className="px-3 pb-2.5">
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>No LLM connected</p>
                    <a href="/settings" className="text-[9px]" style={{ color: 'var(--accent-cyan)' }} onClick={() => setShowModelPicker(false)}>Settings → AI Config →</a>
                  </div>
                )}

                {/* ── SHAPE section ── */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', margin: '0 8px' }} />
                <div className="px-3 pt-1.5 pb-1 flex items-center gap-1">
                  <Hexagon size={9} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>SHAPE</span>
                </div>
                <div className="px-2 pb-2.5 grid grid-cols-4 gap-1">
                  {SHAPE_PRESETS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => { triggerMorph(p.key); setShowModelPicker(false); }}
                      className="text-[9px] py-1 rounded font-mono-data transition-all"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(165,243,252,0.7)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(34,211,238,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,211,238,0.3)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(165,243,252,0.7)'; }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: status indicators */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          {voice.apiKeyValid === true && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>API OK</span>}
          {voice.error && <span className="text-[9px] px-1.5 py-0.5 rounded truncate max-w-[120px]" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)' }} title={voice.error}>Error</span>}
        </div>
      </div>

      {/* Composer row — phone & tablet (desktop has sidebar chat) */}
      {isCompact && (
      <div className="flex items-center gap-2 mt-1.5">
        {/* Mic button */}
        <button
          onClick={handleVoiceClick}
          className="flex-shrink-0 flex items-center justify-center rounded-full transition-all"
          style={{
            width: 34, height: 34,
            background: isListening ? 'rgba(34,211,238,0.15)' : '#0A0A0A',
            border: `1px solid ${isListening ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.1)'}`,
          }}
          title={isListening ? 'Stop' : 'Talk to AXE'}
        >
          {isListening ? <MicOff size={15} style={{ color: 'var(--error)' }} /> : <Mic size={15} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)' }} />}
        </button>

        {/* Input */}
        <div className="flex-1 flex items-center rounded-full overflow-hidden" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)', height: 36 }}>
          {isActive && label ? (
            <div className="flex-1 flex items-center px-4 gap-2 overflow-hidden">
              {isListening && <VoiceWaveform isActive={true} barCount={8} />}
              <span className="text-small truncate" style={{ color: isListening ? 'var(--accent-cyan)' : isProcessing ? 'var(--warning)' : 'var(--accent-blue)' }}>{label}</span>
              {isProcessing && <span className="flex gap-0.5 flex-shrink-0">{[0,1,2].map(i => <span key={i} className="animate-pulse" style={{ color: 'var(--accent-cyan)', animationDelay: `${i*0.15}s` }}>.</span>)}</span>}
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={typedText}
              onChange={e => setTypedText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              placeholder="Ask AXE anything..."
              className="flex-1 px-4 text-small outline-none bg-transparent"
              style={{ color: '#FFFFFF' }}
            />
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isActive || !typedText.trim()}
          className="flex-shrink-0 flex items-center justify-center rounded-full transition-all"
          style={{
            width: 34, height: 34,
            background: (!isActive && typedText.trim()) ? 'linear-gradient(135deg, #22D3EE, #06B6D4)' : '#0A0A0A',
            border: `1px solid ${(!isActive && typedText.trim()) ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.1)'}`,
            opacity: isActive || !typedText.trim() ? 0.5 : 1,
            cursor: isActive || !typedText.trim() ? 'default' : 'pointer',
          }}
        >
          <Send size={14} style={{ color: (!isActive && typedText.trim()) ? '#000' : 'var(--text-muted)' }} />
        </button>
      </div>
      )}
    </footer>
  );
}
