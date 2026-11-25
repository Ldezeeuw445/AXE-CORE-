/**
 * Drie vragen bovenaan de Taken-tab: wat wacht op mij, wat loopt er (bij
 * wie), wat is vandaag klaar. Alleen echte rijen uit Tasks.tsx; een lege
 * sectie zegt dat ze leeg is in plaats van gevuld te worden.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { rijActieApi } from '@/infrastructure/gateways/axeCoreApiService';
import { verdeelSecties, wieBezig, type OverzichtTaak } from '@/domain/takenOverzicht';
import { zonderUuid } from '@/domain/approvals/wachtOpJou';

type Props<T extends OverzichtTaak> = { taken: T[]; loading?: boolean };

function Sectie({ titel, sub, taken, leeg, kleur, onOpen }: {
  titel: string; sub?: string; taken: OverzichtTaak[]; leeg: string; kleur: string; onOpen?: () => void;
}) {
  return (
    <section className="axe-taken-sectie" data-axe-sectie={titel}>
      <header className="flex items-baseline gap-2">
        {onOpen
          ? <button type="button" onClick={onOpen} className="text-[11px] font-semibold tracking-wide underline-offset-2 hover:underline" style={{ color: kleur }}>{titel} →</button>
          : <h3 className="text-[11px] font-semibold tracking-wide" style={{ color: kleur }}>{titel}</h3>}
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{taken.length}</span>
        {sub && <span className="ml-auto truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
      </header>
      {taken.length === 0
        ? <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{leeg}</p>
        : (
          <ul className="mt-2 flex flex-col gap-1">
            {taken.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{zonderUuid(t.title || '') || t.title}</span>
                <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.assignee}</span>
              </li>
            ))}
            {taken.length > 5 && <li className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+{taken.length - 5} meer</li>}
          </ul>
        )}
    </section>
  );
}

export function TakenSecties<T extends OverzichtTaak>({ taken, loading }: Props<T>) {
  const s = verdeelSecties(taken);
  const wie = wieBezig(s.bezig);
  const navigate = useNavigate();
  return (
    <div className="axe-taken-secties mb-4 flex-none" data-axe-taken-secties="">
      {/* 17 nov: één "Wacht op jou". Deze kaart toont de taken; de kop opent de
          volledige lijst (ook NorthSea-mails) waar je ja/nee en versturen doet. */}
      <Sectie titel="Waiting on you" taken={s.wacht} kleur="var(--warning)" onOpen={() => navigate('/wacht')}
        leeg={loading ? 'Loading…' : 'No tasks; NorthSea items are in Waiting on you.'} />
      <Sectie titel={wie ? `Running (${wie})` : 'Running'} taken={s.bezig} kleur="var(--accent-cyan)"
        leeg={loading ? 'Loading…' : 'Nothing is running.'} />
      <Sectie titel="Done today" taken={s.klaarVandaag} kleur="var(--success)"
        leeg={loading ? 'Loading…' : 'Nothing finished today yet.'} />
      <Gepland aantal={s.gepland.length} misluktAi={s.misluktAi.length} />
    </div>
  );
}

/**
 * 22 nov (Luka: "geen idee of ik er nou wat mee moet"): de geplande AI-taken
 * starten niet vanzelf. Dat staat er nu gewoon, met één knop die de rij start
 * (backend/axe_api/rij.py: één voor één, nooit trading/geld/wissen).
 */
function Gepland({ aantal, misluktAi }: { aantal: number; misluktAi: number }) {
  const [stand, setStand] = useState<string | null>(null);
  const start = () => {
    setStand('Working…');
    void rijActieApi('begin')
      .then((u) => setStand(u.toegevoegd ? `${u.toegevoegd} queued, one at a time` : 'Nothing the AI may do on its own'))
      .catch((e: unknown) => setStand(e instanceof Error ? e.message : 'Did not work'));
  };
  return (
    <section className="axe-taken-sectie" data-axe-sectie="Gepland">
      <header className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>Planned for the AI</h3>
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{aantal}</span>
      </header>
      <p className="mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
        {aantal
          ? 'Nothing for you here. They do not start on their own; the queue runs them one at a time.'
          : 'Nothing planned.'}
        {misluktAi ? ` ${misluktAi} failed, and the AI picks those up itself.` : ''}
      </p>
      {aantal > 0 && (
        <button type="button" onClick={start} disabled={stand === 'Working…'}
          className="mt-2 inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
          {stand ?? 'Start the queue'}
        </button>
      )}
    </section>
  );
}
