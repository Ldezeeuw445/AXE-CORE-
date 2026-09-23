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
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { ThinkingOrb } from 'thinking-orbs';
import { statusTeken, tekenLabel, type WerkSignalen } from '@/domain/statusOrb';
import type { VoiceStatus } from '@/presentation/store/voiceStore';

const KLEUR: Record<string, string> = {
  Speaking: '#F59E0B',
  Listening: '#10B981',
  Ready: '#22D3EE',
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
  const status = opgelegd ?? uitStore;
  const teken = statusTeken(status, werk);
  const label = tekenLabel(teken);
  const kleur = KLEUR[label] ?? '#a855f7';

  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 ${className ?? ''}`} title={label} data-axe-status={label.toLowerCase()}>
      {teken.soort === 'equalizer' ? (
        <span className="axe-eq" style={{ ['--eq-ink' as string]: kleur, height: size === 20 ? 14 : 28 }}>
          <i /><i /><i /><i /><i /><i /><i />
        </span>
      ) : (
        <ThinkingOrb state={teken.stand} size={size} />
      )}
      {toonLabel && (
        <span className="text-[9px] font-mono uppercase tracking-wide" style={{ color: kleur, opacity: 0.9 }}>{label}</span>
      )}
    </div>
  );
}
