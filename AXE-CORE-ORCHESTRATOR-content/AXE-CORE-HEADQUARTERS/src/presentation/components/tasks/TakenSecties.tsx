/**
 * Drie vragen bovenaan de Taken-tab: wat wacht op mij, wat loopt er (bij
 * wie), wat is vandaag klaar. Alleen echte rijen uit Tasks.tsx; een lege
 * sectie zegt dat ze leeg is in plaats van gevuld te worden.
 */
import { verdeelSecties, wieBezig, type OverzichtTaak } from '@/domain/takenOverzicht';

type Props<T extends OverzichtTaak> = { taken: T[]; loading?: boolean };

function Sectie({ titel, sub, taken, leeg, kleur }: {
  titel: string; sub?: string; taken: OverzichtTaak[]; leeg: string; kleur: string;
}) {
  return (
    <section className="axe-taken-sectie" data-axe-sectie={titel}>
      <header className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide" style={{ color: kleur }}>{titel}</h3>
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{taken.length}</span>
        {sub && <span className="ml-auto truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
      </header>
      {taken.length === 0
        ? <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{leeg}</p>
        : (
          <ul className="mt-2 flex flex-col gap-1">
            {taken.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{t.title}</span>
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
  return (
    <div className="axe-taken-secties mb-4 flex-none" data-axe-taken-secties="">
      <Sectie titel="Wacht op jou" taken={s.wacht} kleur="var(--warning)"
        leeg={loading ? 'Laden…' : 'Niets wacht op jou.'} />
      <Sectie titel={wie ? `Bezig (${wie})` : 'Bezig'} taken={s.bezig} kleur="var(--accent-cyan)"
        leeg={loading ? 'Laden…' : 'Er loopt nu niets.'} />
      <Sectie titel="Klaar vandaag" taken={s.klaarVandaag} kleur="var(--success)"
        leeg={loading ? 'Laden…' : 'Vandaag nog niets afgerond.'} />
    </div>
  );
}
