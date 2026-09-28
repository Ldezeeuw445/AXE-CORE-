/**
 * De maandweergave: één kaart met een raster van dagen.
 *
 * ## Wat er anders is dan eerst
 *
 * Het was een losse kop met daaronder een raster, zonder kaart eromheen -- dus
 * geen rand, geen eigen vlak, en het liep door tot de rand van het scherm. In
 * het voorbeeld is het één kaart met echte cellen: je ziet de weken als rijen
 * omdat de lijnen doorlopen, en niet omdat de getallen toevallig uitlijnen.
 *
 * Each day shows compact real labels (time + title) instead of anonymous dots.
 * The app filter keeps the month readable; overflow is explicit rather than hidden.
 */
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { datumSleutel, type RoosterItem } from '@/domain/weekRooster';

const DAGKOPPEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAX_REGELS = 3;

export function MaandRooster({
  jaar, maand, items, gekozen, opKies, opMaand,
}: {
  jaar: number;
  /** 0-11, zoals Date het geeft. */
  maand: number;
  items: RoosterItem[];
  gekozen: string | null;
  opKies: (sleutel: string) => void;
  opMaand: (jaar: number, maand: number) => void;
}) {
  const eersteDag = new Date(jaar, maand, 1).getDay();
  const dagenInMaand = new Date(jaar, maand + 1, 0).getDate();
  const vandaag = datumSleutel(new Date());

  const perDag = new Map<string, RoosterItem[]>();
  for (const i of items) {
    const l = perDag.get(i.datum);
    if (l) l.push(i); else perDag.set(i.datum, [i]);
  }

  /* Zes rijen van zeven, altijd. Vijf rijen zou soms passen en soms niet, en
     dan verspringt de hoogte van de kaart als je een maand verder bladert. */
  const vakken = 42;
  const cellen = Array.from({ length: vakken }, (_, i) => {
    const nr = i - eersteDag + 1;
    if (nr < 1 || nr > dagenInMaand) {
      // De dagen van de maand ernaast: wel getekend, niet aanklikbaar. Een gat
      // laat de weekrijen breken.
      const d = new Date(jaar, maand, nr);
      return { nr: d.getDate(), sleutel: null as string | null, buiten: true };
    }
    return { nr, sleutel: datumSleutel(new Date(jaar, maand, nr)), buiten: false };
  });

  const stap = (richting: number) => {
    const d = new Date(jaar, maand + richting, 1);
    opMaand(d.getFullYear(), d.getMonth());
  };

  return (
    <section className="axe-maand">
      <header className="axe-maand-kop">
        <span className="axe-maand-titel">
          <CalendarDays size={15} />
          {new Date(jaar, maand, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
        </span>
        <span className="axe-maand-nav">
          <button onClick={() => stap(-1)} title="Vorige maand"><ChevronLeft size={15} /></button>
          <button
            className="axe-maand-nu"
            onClick={() => { const n = new Date(); opMaand(n.getFullYear(), n.getMonth()); opKies(datumSleutel(n)); }}
          >
            Vandaag
          </button>
          <button onClick={() => stap(1)} title="Volgende maand"><ChevronRight size={15} /></button>
        </span>
      </header>

      <div className="axe-maand-dagkoppen">
        {DAGKOPPEN.map(d => <span key={d}>{d}</span>)}
      </div>

      <div className="axe-maand-raster">
        {cellen.map((c, i) => {
          const lijst = c.sleutel ? perDag.get(c.sleutel) ?? [] : [];
          return (
            <button
              key={i}
              type="button"
              className="axe-maand-cel"
              data-buiten={c.buiten ? 'ja' : undefined}
              data-vandaag={c.sleutel === vandaag ? 'ja' : undefined}
              data-gekozen={c.sleutel && c.sleutel === gekozen ? 'ja' : undefined}
              disabled={c.buiten}
              onClick={() => c.sleutel && opKies(c.sleutel)}
            >
              <span className="axe-maand-nr">{c.nr}</span>
              {lijst.length > 0 && (
                <span className="axe-maand-items">
                  {lijst.slice(0, MAX_REGELS).map(it => (
                    <span className="axe-maand-item" key={it.id} style={{ borderLeftColor: it.kleur }} title={`${it.tijd} · ${it.titel}`}>
                      <time>{it.tijd}</time><b>{it.titel}</b>
                    </span>
                  ))}
                  {lijst.length > MAX_REGELS && (
                    <em title={`${lijst.length} items`}>+${lijst.length - MAX_REGELS} meer</em>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
