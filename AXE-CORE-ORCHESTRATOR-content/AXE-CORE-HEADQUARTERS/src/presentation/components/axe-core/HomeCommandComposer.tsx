/**
 * HomeCommandComposer — de AXE CORE-composer van de Tauri-home, 1-op-1.
 *
 * Luka stuurde de foto van de echte composer: een kopregel (modelkiezer +
 * "AXE CORE" links, klok + instellingen rechts), de invoerbalk met de paarse
 * bliksem, een iconenrij (bijlage, spraak, verrekijker, globe — camera, mic,
 * versturen), en daaronder vier gekleurde tip-chips (Verhelder de vraag / Geef
 * context / Kies wat je oplevert / Scherp het aan).
 *
 * Deze bestond nog niet in de code (het is een nieuwer AXE CORE-ontwerp), dus
 * hij is hier nagebouwd — kleuren en indeling naar de foto. De invoer, versturen,
 * mic, bijlage en camera hangen aan de bestaande handlers uit PlaatChat, zodat
 * de sphere-director en het versturen precies werken zoals voorheen. De chips
 * zetten een richtlijn vóór je concept en focussen de invoer (prompt-helpers);
 * de modelpil toont het actieve model.
 */
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Volume2, VolumeX, Telescope, Globe, Mic, Send, Zap, ChevronDown,
  Clock, SlidersHorizontal, Brain, Sparkles, CirclePlay, Wand2,
} from 'lucide-react';
import { FileUploadButton, type NormalizedAttachment } from '@/presentation/components/axe-core/FileUploadButton';
import { VisionCaptureButton } from '@/presentation/components/voice/VisionCaptureButton';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  isListening: boolean;
  attachments: NormalizedAttachment[];
  onAttachments: (a: NormalizedAttachment[]) => void;
  responseMode: 'speak' | 'type';
  onToggleResponseMode: () => void;
  modelLabel: string;
}

// Korte labels zodat de vier chips náást elkaar op één rij passen (scheelt
// ruimte en staat strakker). Icoon + kleur blijven; de prefix is de actie.
const CHIPS: Array<{ label: string; icon: typeof Brain; color: string; prefix: string }> = [
  { label: 'Clarify', icon: Brain,      color: '#a855f7', prefix: 'Verhelder deze vraag en stel verduidelijkende vragen: ' },
  { label: 'Context', icon: Sparkles,   color: '#eab308', prefix: 'Geef meer context bij: ' },
  { label: 'Output',  icon: CirclePlay, color: '#ef4444', prefix: 'Lever dit op als concreet resultaat: ' },
  { label: 'Sharpen', icon: Wand2,      color: '#2dd4bf', prefix: 'Scherp dit aan en stel verbeteringen voor: ' },
];

export function HomeCommandComposer(props: Props) {
  const { value, onChange, onSend, onMic, isListening, attachments, onAttachments, responseMode, onToggleResponseMode, modelLabel } = props;
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const applyChip = (prefix: string) => {
    onChange(value ? `${prefix}${value}` : prefix);
    inputRef.current?.focus();
  };

  const iconBtn = 'flex-shrink-0 flex items-center justify-center rounded-lg transition-colors';
  const iconStyle = { width: 34, height: 34, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.04)' };

  return (
    <div className="flex flex-col gap-2 px-1 pb-1">
      {/* Kopregel: modelkiezer + AXE CORE links, klok + instellingen rechts. */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 min-w-0"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
            title="Actief model"
          >
            <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: '#10b981', boxShadow: '0 0 5px #10b981' }} />
            <span className="text-[11px] font-medium truncate max-w-[150px]" style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{modelLabel}</span>
            <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
          <span className="flex items-center gap-1 flex-shrink-0">
            <Sparkles size={12} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--accent-cyan)' }}>AXE CORE</span>
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" className="p-1.5 rounded-md" title="Geschiedenis" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Clock size={15} />
          </button>
          <button type="button" onClick={() => navigate('/settings')} className="p-1.5 rounded-md" title="Instellingen" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <SlidersHorizontal size={15} />
          </button>
        </div>
      </div>

      {/* De composer-doos: invoer + bliksem, dan de iconenrij. */}
      <div
        className="rounded-2xl px-3 pt-3 pb-2.5"
        style={{ background: 'rgba(10,12,14,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSend(); }}
            placeholder="Ask anything, @models, /prompts ..."
            className="flex-1 min-w-0 bg-transparent outline-none text-[14px] py-1"
            style={{ color: 'var(--text-primary)' }}
          />
          <Zap size={16} className="flex-shrink-0" style={{ color: '#a855f7' }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <FileUploadButton attachments={attachments} onAttachmentsChange={onAttachments} />
            <button type="button" onClick={onToggleResponseMode} className={iconBtn} style={iconStyle} title={responseMode === 'speak' ? 'AXE praat terug' : 'Alleen tekst'}>
              {responseMode === 'speak' ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button type="button" className={iconBtn} style={iconStyle} title="Verkennen">
              <Telescope size={15} />
            </button>
            <button type="button" onClick={() => navigate('/browser-desktop')} className={iconBtn} style={iconStyle} title="Browser">
              <Globe size={15} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <VisionCaptureButton compact className={`${iconBtn} border-0`} />
            <button type="button" onClick={onMic} className={iconBtn} style={{ ...iconStyle, ...(isListening ? { background: 'var(--accent-cyan)', color: '#001018' } : {}) }} title="Spraak">
              <Mic size={15} />
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={!value.trim() && attachments.length === 0}
              className="flex-shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40"
              style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #22d3ee, #0d9488)', color: '#001018' }}
              title="Versturen"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* De vier tip-chips: korte labels, vier gelijke knoppen náást elkaar op
          één rij (flex-1). Scheelt ruimte en staat strakker dan twee regels. */}
      <div className="flex items-center gap-1.5 pb-0.5">
        {CHIPS.map(chip => (
          <button
            key={chip.label}
            type="button"
            onClick={() => applyChip(chip.prefix)}
            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <chip.icon size={14} className="flex-shrink-0" style={{ color: chip.color }} />
            <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
