/**
 * Wat er links en rechts naast de trading-tab hangt.
 *
 * ## Waarom de tabbalk hierheen verhuist
 *
 * Tien sub-tabs namen een strook over de volle breedte in, boven elke pagina,
 * altijd. Negen daarvan zijn op elk moment niet waar je naar kijkt. In het
 * schuifpaneel kosten ze geen ruimte tot je ze nodig hebt. De afweging is
 * eerlijk: wisselen kost nu een muisbeweging naar de rand in plaats van een
 * klik op een balk die er toch al stond.
 *
 * ## Waarom de accounts een BLIK zijn en geen verhuizing
 *
 * Alleen saldo, vermogen en resultaat. De accountpagina blijft waar hij is:
 * dit is het cijfer waar je tijdens het werken even naar kijkt, niet het boek
 * waarin je iets opzoekt. Een paneel dat herhaalt wat de pagina al toont is
 * een tweede pagina, en dan heb je twee plekken die uit de pas kunnen lopen.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { PlaatPanel } from '@/presentation/components/layout/PlaatSlots';
import { useAccountGlance } from '@/presentation/hooks/useAccountGlance';
import { meaningVar, type Meaning } from '@/domain/meaning';

/**
 * Of het linkerpaneel open staat.
 *
 * AxeShellChrome zet `data-rail-l` op de wortel zodra je muis de rand raakt.
 * Dit leest datzelfde attribuut, zodat de accounts pas cijfers ophalen als er
 * iemand kijkt -- zie useAccountGlance voor waarom dat hier uitmaakt.
 */
function useRailOpen(kant: 'railL' | 'railR'): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const wortel = document.documentElement;
    const lees = () => setOpen(wortel.dataset[kant] === 'open');
    lees();
    const obs = new MutationObserver(lees);
    obs.observe(wortel, { attributes: true, attributeFilter: ['data-rail-l', 'data-rail-r'] });
    return () => obs.disconnect();
  }, [kant]);
  return open;
}

function bedrag(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}

function Cijfer({ label, waarde, meaning }: { label: string; waarde: string; meaning?: Meaning }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="text-[12px] font-mono-data tabular-nums"
        style={{ color: meaning ? meaningVar(meaning) : 'var(--text-primary)' }}
      >
        {waarde}
      </span>
    </div>
  );
}

export function TradingRail({
  tabs, actief, kies, instellingen,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  actief: string;
  kies: (id: string) => void;
  /** Wat er in de rechter schuifbalk hoort zolang je op trading bent. */
  instellingen: ReactNode;
}) {
  const linksOpen = useRailOpen('railL');

  const [uitgeklapt, setUitgeklapt] = useState<string | null>(null);
  const { accounts } = useAccountGlance(linksOpen);

  return (
    <>
      {/* De rechter schuifbalk toont op elke tab iets anders. Op Home blijven
          het Mindset en de snelle acties; hier de instellingen van de desk. */}
      <TabRail kant="rechts">{instellingen}</TabRail>
      {/* Eén blok in plaats van een kolom. Tien tabs onder elkaar passen niet
          in de hoogte van de band -- je kreeg er vijf te zien en de rest moest
          scrollen, wat precies het probleem is dat dit paneel moest oplossen.
          Twee kolommen laten ze allemaal tegelijk zien. */}
      <PlaatPanel side="left" title="Tabs" accent="cyaan">
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => kies(t.id)}
              className="text-left px-2 py-1 rounded-md text-[11px] truncate"
              style={{
                color: actief === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: actief === t.id ? 600 : 500,
              }}
              title={t.label}
            >
              {t.label}
            </button>
          ))}
        </div>
      </PlaatPanel>

      {/* Rechts, en dichtgeklapt tot je er een aanklikt. Vier accounts met elk
          drie cijfers zijn twaalf regels; dan is het geen blik meer maar een
          tabel. Ingeklapt zie je welke er zijn, uitgeklapt de cijfers van die
          ene -- en ze passen allemaal. */}
      <PlaatPanel side="right" title="Accounts" accent="groen">
        <div className="flex flex-col gap-0.5">
          {accounts.length === 0 ? (
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nog geen cijfers binnen.</span>
          ) : accounts.map(a => {
            const open = uitgeklapt === a.id;
            return (
              <div key={a.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setUitgeklapt(open ? null : a.id)}
                  className="flex items-baseline justify-between gap-2 px-1 py-1 text-left"
                >
                  <span className="text-[11px] truncate" style={{ color: open ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: open ? 600 : 500 }}>
                    {a.label}
                  </span>
                  {/* Het resultaat blijft zichtbaar als hij dicht is: dat is het
                      ene cijfer waarvoor je hier kijkt. */}
                  <span
                    className="text-[11px] font-mono-data tabular-nums shrink-0"
                    style={{ color: a.floating == null ? 'var(--text-muted)' : meaningVar(a.floating >= 0 ? 'happened' : 'broken') }}
                  >
                    {a.floating == null ? '—' : `${a.floating >= 0 ? '+' : ''}${bedrag(a.floating)}`}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-col gap-1 px-1 pb-2">
                    {a.error ? (
                      <span className="text-[10px]" style={{ color: meaningVar('broken') }}>{a.error}</span>
                    ) : (
                      <>
                        <Cijfer label="Saldo" waarde={bedrag(a.balance)} />
                        <Cijfer label="Vermogen" waarde={bedrag(a.equity)} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PlaatPanel>

    </>
  );
}
