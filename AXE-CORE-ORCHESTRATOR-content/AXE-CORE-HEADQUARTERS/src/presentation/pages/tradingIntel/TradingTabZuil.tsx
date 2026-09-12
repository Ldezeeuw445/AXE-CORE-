/**
 * De sub-tabs van de desk, als kale iconen naast de composer.
 *
 * ## Waarom de namen weg zijn
 *
 * Ze stonden in een schuifpaneel links, met hun naam erbij. Dat paneel moest
 * je eerst openschuiven, en daarna las je twaalf regels tekst om er één te
 * kiezen -- een tweede navigatie naast de navigatie die er al is.
 *
 * Nu twaalf iconen in de band naast de composer. De naam zie je pas als je
 * erover gaat, en dan in de kleur van die tab (domain/tradingIntel/tabStijl).
 * Eén regel, op een vaste plek: daardoor springt er niets als je met je muis
 * over de rij gaat.
 *
 * ## Waarom de kleur hier mag
 *
 * Wet 10: kleur in de letters, nooit in een vlak. Dat is precies wat er
 * gebeurt -- de NAAM kleurt en het icoon licht mee op. De knop blijft leeg.
 */
import { useState } from 'react';
import * as Lucide from 'lucide-react';
import { stijlVan } from '@/domain/tradingIntel/tabStijl';

/** Een naam uit de lucide-tabel omzetten naar het component zelf. */
function Icoon({ naam, size }: { naam: string; size: number }) {
  const set = Lucide as unknown as Record<string, React.ComponentType<{ size?: number }>>;
  const C = set[naam] ?? set.Circle;
  return <C size={size} />;
}

export function TradingTabZuil({
  tabs, actief, kies,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  actief: string;
  kies: (id: string) => void;
}) {
  const [zweeft, setZweeft] = useState<string | null>(null);
  // De naam die je leest: waar je overheen gaat, en anders waar je op staat.
  const toon = tabs.find(t => t.id === (zweeft ?? actief));
  const toonKleur = toon ? stijlVan(toon.id).kleur : undefined;

  return (
    <div className="axe-tabzuil">
      <div className="axe-tabzuil-rooster" onMouseLeave={() => setZweeft(null)}>
        {tabs.map(t => {
          const stijl = stijlVan(t.id);
          const aan = actief === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => kies(t.id)}
              onMouseEnter={() => setZweeft(t.id)}
              onFocus={() => setZweeft(t.id)}
              className="axe-tabzuil-knop"
              data-aan={aan ? 'ja' : undefined}
              // Ook als title, want de regel eronder valt weg op een smal
              // venster en een icoon zonder enige naam is een raadsel.
              title={t.label}
              aria-label={t.label}
              aria-current={aan ? 'page' : undefined}
              style={{ color: aan || zweeft === t.id ? stijl.kleur : undefined }}
            >
              <Icoon naam={stijl.icoon} size={17} />
            </button>
          );
        })}
      </div>
      {/* Vaste plek, ook als er niets te tonen is: een regel die komt en gaat
          duwt het rooster op en neer terwijl je er met je muis overheen gaat. */}
      <div className="axe-tabzuil-naam" style={{ color: toonKleur }}>
        {toon?.label ?? ' '}
      </div>
    </div>
  );
}
