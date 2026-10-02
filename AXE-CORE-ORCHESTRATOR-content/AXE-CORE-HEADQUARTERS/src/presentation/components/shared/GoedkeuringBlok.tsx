/**
 * Het goedkeuringsblok: AXE vraagt om toestemming, jij geeft die.
 *
 * ## Waarom dit nu één component is
 *
 * Gemeten 2 okt 2026: `resolvePendingExec` werd op precies twee plekken
 * aangeroepen, `PlaatChat.tsx` en `AxePresenceDock.tsx`, en die zijn beide
 * `!mobileCommandSurface` -- ze bestaan niet op de telefoon. `RightPanel` zette
 * er alleen "Waiting for approval" als tekst bij, zonder knop.
 *
 * Gevolg: op de iPhone kon AXE om toestemming vragen en was er **nergens** een
 * knop om die te geven. Niet "lastig" maar blokkerend: het werk staat stil en je
 * kunt het niet verder helpen. Dat is het duidelijkste geval van "dit zijn drie
 * apps in plaats van één".
 *
 * Die twee plekken hadden elk hun eigen opmaak van hetzelfde blok. Een derde
 * copy voor de telefoon maken zou de fout herhalen: dan lopen er drie uiteen.
 * Dus één component, drie plekken die hem tonen, en een test die eist dat elk
 * oppervlak hem heeft.
 *
 * `vorm` is alleen hoe hij eruitziet -- `vol` voor de chatkolom (de opdracht in
 * een leesbaar blok), `smal` voor de dok-regel waar alleen een titel past. Wat
 * hij DOET is in beide gevallen hetzelfde, en dat is het punt.
 */
import { Check, Terminal, X } from 'lucide-react';
import { useVoiceStore } from '@/presentation/store/voiceStore';

export function GoedkeuringBlok({ vorm = 'vol' }: { vorm?: 'vol' | 'smal' }) {
  const pending = useVoiceStore((s) => s.pendingExec);
  const resolvePendingExec = useVoiceStore((s) => s.resolvePendingExec);
  if (!pending) return null;

  if (vorm === 'smal') {
    return (
      <div
        className="ml-3.5 flex max-w-full items-center gap-2 self-start rounded-lg px-2 py-1"
        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}
      >
        <span className="truncate" title={pending.detail}>{pending.title}</span>
        <button type="button" title="Approve" onClick={() => resolvePendingExec(pending.id, true)}>
          <Check size={13} />
        </button>
        <button type="button" title="Deny" onClick={() => resolvePendingExec(pending.id, false)}>
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-2.5 mb-2 flex-shrink-0 rounded-lg p-2.5"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(251,146,60,0.3)' }}
    >
      <div className="mb-1.5 flex items-center gap-1.5" style={{ color: 'rgb(251,146,60)' }}>
        <Terminal size={12} />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{pending.title}</span>
      </div>
      <pre
        className="mb-2 block max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded px-2 py-1.5 text-[11px]"
        style={{ background: 'rgba(0,0,0,0.4)', color: 'var(--text-primary)' }}
      >
        {pending.detail}
      </pre>
      <div className="flex gap-1.5">
        <button
          onClick={() => resolvePendingExec(pending.id, true)}
          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium"
          style={{ background: 'var(--tint)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}
        >
          <Check size={12} /> Approve
        </button>
        <button
          onClick={() => resolvePendingExec(pending.id, false)}
          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <X size={12} /> Deny
        </button>
      </div>
    </div>
  );
}
