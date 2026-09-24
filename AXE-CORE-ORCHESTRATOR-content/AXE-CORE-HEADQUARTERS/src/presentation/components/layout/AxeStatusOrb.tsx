/**
 * Het statusteken van AXE: dezelfde stand, overal, in twee maten.
 *
 * 20px hoort in de topbalk (naast de tekst), 64px in het midden van de
 * onderbalk. Dat zijn de twee maten die thinking-orbs voert -- geen
 * schaalfactor maar twee aparte ontwerpen, met elk hun eigen aantal punten en
 * snelheid. Gevraagd was 60; 64 is wat er is, en een geschaalde 20 zou juist
 * de punten kapot rekenen.
 *
 * Spreken is de equalizer die AXE al had, nu met zeven staafjes zodat hij naast
 * de orbs niet als een ander soort teken leest.
 */
import { useEffect, useState } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { ThinkingOrb } from 'thinking-orbs';
import { statusTeken, tekenLabel, type WerkSignalen } from '@/domain/statusOrb';
import type { VoiceStatus } from '@/presentation/store/voiceStore';
import { getMicLevel } from '@/infrastructure/gateways/whisperService';
import { getGlobalTtsLevel } from '@/infrastructure/gateways/globalTts';

const KLEUR: Record<string, string> = {
  Speaking: '#F59E0B',
  Listening: '#10B981',
  Ready: '#22D3EE',
  Error: '#F87171',
};

export function AxeStatusOrb({ size, werk, toonLabel = false, className, status: opgelegd }: {
  size: 20 | 64;
  werk?: WerkSignalen;
  toonLabel?: boolean;
  className?: string;
  /* Home leidt zijn stand af uit coreStatus (chat, goedkeuring, stem) en niet
     uit de stemlus alleen. Die mag hem dus opleggen -- de vertaling blijft in
     domain/statusOrb, zodat beide plekken hetzelfde teken tonen. */
  status?: VoiceStatus;
}) {
  const uitStore = useVoiceStore(s => s.voiceStatus);
  const fout = useVoiceStore(s => Boolean(s.error));
  const status = opgelegd ?? uitStore;
  const teken = statusTeken(status, { ...werk, fout: werk?.fout || fout });
  const label = tekenLabel(teken);
  const kleur = KLEUR[label] ?? '#a855f7';
  const [pulse, setPulse] = useState(0);

  // Eén rAF: mic terwijl we luisteren, TTS-analyser terwijl AXE praat.
  // Geen tweede getUserMedia — getMicLevel leest de Whisper-stream.
  const luistert = status === 'listening';
  const praat = status === 'speaking' || teken.soort === 'equalizer';
  useEffect(() => {
    if (!luistert && !praat) return;
    let raf = 0;
    const tik = () => {
      setPulse(luistert ? getMicLevel() : getGlobalTtsLevel());
      raf = requestAnimationFrame(tik);
    };
    raf = requestAnimationFrame(tik);
    return () => cancelAnimationFrame(raf);
  }, [luistert, praat]);

  const niveau = luistert || praat ? pulse : 0;
  const live = niveau > 0.02;
  const staaf = [0.45, 0.7, 1, 0.85, 0.6, 0.9, 0.5];
  const schaal = 1 + niveau * (size === 20 ? 0.18 : 0.28);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-0.5 ${className ?? ''}`}
      title={label}
      data-axe-status={label.toLowerCase()}
      data-axe-pulse={live ? 'on' : 'off'}
      style={{ transform: `scale(${schaal.toFixed(3)})`, transition: 'transform 70ms linear' }}
    >
      {teken.soort === 'equalizer' ? (
        <span
          className="axe-eq"
          data-live={live ? 'on' : 'off'}
          style={{ ['--eq-ink' as string]: kleur, height: size === 20 ? 14 : 28 }}
        >
          {staaf.map((h, i) => (
            <i
              key={i}
              style={live ? { height: Math.max(3, Math.round(4 + niveau * (size === 20 ? 12 : 22) * h)) } : undefined}
            />
          ))}
        </span>
      ) : teken.soort === 'fout' ? (
        <span
          aria-hidden
          className="rounded-full flex-shrink-0"
          style={{
            width: size === 20 ? 8 : 16,
            height: size === 20 ? 8 : 16,
            border: `1.5px solid ${kleur}`,
            background: 'transparent',
          }}
        />
      ) : (
        <ThinkingOrb state={teken.stand} size={size} />
      )}
      {toonLabel && (
        <span className="text-[9px] font-mono uppercase tracking-wide" style={{ color: kleur, opacity: 0.9 }}>{label}</span>
      )}
    </div>
  );
}
