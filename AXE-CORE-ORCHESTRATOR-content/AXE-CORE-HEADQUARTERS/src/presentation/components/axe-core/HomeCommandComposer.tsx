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
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Volume2, VolumeX, Telescope, Globe, Mic, Send, Zap, ChevronDown,
  Clock, SlidersHorizontal, Brain, Sparkles, CirclePlay, Wand2,
} from 'lucide-react';
import { FileUploadButton, type NormalizedAttachment } from '@/presentation/components/axe-core/FileUploadButton';
import { VisionCaptureButton } from '@/presentation/components/voice/VisionCaptureButton';
import { useLookValue } from '@/presentation/hooks/usePlaatInk';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** Een tip-chip stuurt de bewerkte prompt meteen (met de richtlijn eromheen). */
  onRunChip: (fullText: string) => void;
  /** De klok opent de gespreksgeschiedenis (klapt de chat open). */
  onHistory: () => void;
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
  const { value, onChange, onSend, onRunChip, onHistory, onMic, isListening, attachments, onAttachments, responseMode, onToggleResponseMode, modelLabel } = props;
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  // De modelpil is een dropdown: standaard ingeklapt tot alleen het groene
  // bolletje; tik = claude (+ pijltje) schuift open, tik weer = dicht.
  const [modelOpen, setModelOpen] = useState(false);

  // Lichte stand: de grond is nu écht licht (blauw→grijs), dus de tekst die
  // DIRECT op de plaat ligt (AXE CORE, model, klok, chips) moet donkere inkt
  // krijgen — anders licht-op-licht. De composer-doos zelf blijft donker glas,
  // die drijft erbovenop.
  const light = useLookValue() === 'glass';
  const axeInk = light ? '#0e7490' : 'var(--accent-cyan)';
  const headInk = light ? '#243043' : 'var(--text-primary)';
  const subInk = light ? 'rgba(36,48,67,0.62)' : 'rgba(255,255,255,0.5)';
  const chipBg = light ? 'rgba(20,28,45,0.05)' : 'rgba(255,255,255,0.035)';
  const chipBorder = light ? 'rgba(20,28,45,0.16)' : 'rgba(255,255,255,0.09)';
  const pillBg = light ? 'rgba(20,28,45,0.05)' : 'rgba(255,255,255,0.05)';
  const pillBorder = light ? 'rgba(20,28,45,0.16)' : 'rgba(255,255,255,0.09)';

  // Een tip-chip is een echte actie: staat er een concept, dan stuurt hij dat
  // meteen met de richtlijn eromheen (AXE verheldert / geeft context / kiest de
  // vorm / scherpt aan). Is het veld leeg, dan is er niets om te bewerken —
  // focus de invoer zodat je eerst iets typt.
  const applyChip = (prefix: string) => {
    if (value.trim()) onRunChip(`${prefix}${value.trim()}`);
    else inputRef.current?.focus();
  };

  // Elk knopje in de iconenrij krijgt hetzelfde blokje als de files-knop
  // (rounded-md p-1.5, zelfde vulling) — één maat voor alle zes. De versturen-
  // knop blijft bewust wat groter (ronde teal-cirkel).
  const iconBtn = 'flex-shrink-0 flex items-center justify-center rounded-md p-1.5 transition-colors';
  const iconStyle = { color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.05)', border: '1px solid transparent' };
  const ICON = 13;

  return (
    <div className="flex flex-col gap-1.5 px-1 pb-0">
      {/* Kopregel: AXE CORE links, dan de model-dropdown (claude in een bubbel
          die inklapt tot het groene bolletje); klok + instellingen rechts. */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1 flex-shrink-0">
            <Sparkles size={12} style={{ color: axeInk }} />
            <span className="text-[10px] font-semibold tracking-wide" style={{ color: axeInk }}>AXE CORE</span>
          </span>
          <button
            type="button"
            onClick={() => setModelOpen(o => !o)}
            className="flex items-center rounded-full px-1.5 py-1 min-w-0"
            style={{ background: pillBg, border: `1px solid ${pillBorder}` }}
            title={modelOpen ? 'Model verbergen' : 'Model tonen'}
            aria-expanded={modelOpen}
          >
            <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: '#10b981', boxShadow: '0 0 5px #10b981' }} />
            {/* claude + pijltje schuiven open/dicht (dropdown). */}
            <span
              className="inline-flex items-center overflow-hidden"
              style={{
                maxWidth: modelOpen ? 150 : 0,
                opacity: modelOpen ? 1 : 0,
                marginLeft: modelOpen ? 6 : 0,
                gap: 4,
                transition: 'max-width .28s ease, opacity .2s ease, margin-left .28s ease',
              }}
            >
              <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: headInk, fontFamily: 'JetBrains Mono, monospace' }}>{modelLabel}</span>
              <ChevronDown size={12} className="flex-shrink-0" style={{ color: subInk, transform: 'rotate(180deg)' }} />
            </span>
          </button>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onHistory} className="p-1.5 rounded-md" title="Gespreksgeschiedenis" style={{ color: subInk }}>
            <Clock size={15} />
          </button>
          <button type="button" onClick={() => navigate('/settings')} className="p-1.5 rounded-md" title="Instellingen" style={{ color: subInk }}>
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
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] py-1"
            style={{ color: 'var(--text-primary)' }}
          />
          <Zap size={16} className="flex-shrink-0" style={{ color: '#a855f7' }} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <FileUploadButton attachments={attachments} onAttachmentsChange={onAttachments} />
            <button type="button" onClick={onToggleResponseMode} className={iconBtn} style={iconStyle} title={responseMode === 'speak' ? 'AXE praat terug' : 'Alleen tekst'}>
              {responseMode === 'speak' ? <Volume2 size={ICON} /> : <VolumeX size={ICON} />}
            </button>
            <button type="button" className={iconBtn} style={iconStyle} title="Verkennen">
              <Telescope size={ICON} />
            </button>
            <button type="button" onClick={() => navigate('/browser-desktop')} className={iconBtn} style={iconStyle} title="Browser">
              <Globe size={ICON} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Camera krijgt hetzelfde blokje als de rest (via className, want de
                knop neemt geen style). */}
            <VisionCaptureButton compact className={`${iconBtn} bg-white/5 border border-transparent text-white/60`} />
            <button type="button" onClick={onMic} className={iconBtn} style={{ ...iconStyle, ...(isListening ? { background: 'var(--accent-cyan)', color: '#001018' } : {}) }} title="Spraak">
              <Mic size={ICON} />
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={!value.trim() && attachments.length === 0}
              className="flex-shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40"
              style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #22d3ee, #0d9488)', color: '#001018' }}
              title="Versturen"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* De vier tip-chips: korte labels, gecentreerd als groep (niet tegen de
          randen), zodat beide uiteinden even ver uitsteken — symmetrisch. Een
          tikje kleiner en compacter, zodat ze dichter op de composer staan en er
          onderin wat ruimte overblijft (fijn op een telefoon). */}
      <div className="flex items-center justify-center gap-2">
        {CHIPS.map(chip => (
          <button
            key={chip.label}
            type="button"
            onClick={() => applyChip(chip.prefix)}
            className="flex items-center justify-center gap-1 rounded-full px-2.5 py-1 active:scale-95 transition-transform"
            style={{ background: chipBg, border: `1px solid ${chipBorder}` }}
          >
            <chip.icon size={13} className="flex-shrink-0" style={{ color: chip.color }} />
            <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: headInk }}>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
