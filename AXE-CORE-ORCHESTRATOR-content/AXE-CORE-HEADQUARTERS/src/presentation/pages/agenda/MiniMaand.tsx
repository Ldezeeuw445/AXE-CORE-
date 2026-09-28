/**
 * De linkerkolom van de kalender (25 sep, Luka's voorbeeld): een kleine maand
 * om door te springen, en daaronder wat er vandaag staat.
 *
 * Een dag aanklikken zet de week eronder op die dag. Een stipje onder een dag
 * betekent dat er die dag iets staat -- geen getal, dat is ruis op 30 vakjes.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { datumSleutel, type RoosterItem } from '@/domain/weekRooster';

const KOP = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function MiniMaand({
  anker, items, opKies,
}: {
  anker: Date;
  items: RoosterItem[];
  opKies: (d: Date) => void;
}) {
  const [maand, setMaand] = useState(() => new Date(anker.getFullYear(), anker.getMonth(), 1));
  const vandaag = datumSleutel(new Date());
  const gekozenWeek = useMemo(() => {
    const d = new Date(anker);
    const dag = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dag);
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      return datumSleutel(x);
    });
  }, [anker]);
  const metIets = useMemo(() => new Set(items.map(i => i.datum)), [items]);

  const eerste = new Date(maand);
  eerste.setDate(1 - ((maand.getDay() + 6) % 7));
  const dagen = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(eerste);
    d.setDate(eerste.getDate() + i);
    return d;
  });

  const vanVandaag = items
    .filter(i => i.datum === vandaag)
    .sort((a, b) => a.tijd.localeCompare(b.tijd));

  const schuif = (n: number) => setMaand(new Date(maand.getFullYear(), maand.getMonth() + n, 1));

  return (
    <div className="axe-minimaand" aria-label="Calendar overview">
      <header>
        <b>{maand.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
        <span>
          <button type="button" onClick={() => schuif(-1)} title="Previous month"><ChevronLeft size={14} /></button>
          <button type="button" onClick={() => schuif(1)} title="Next month"><ChevronRight size={14} /></button>
        </span>
      </header>
      <div className="axe-minimaand-raster">
        {KOP.map(k => <span key={k} className="axe-minimaand-kop">{k}</span>)}
        {dagen.map(d => {
          const s = datumSleutel(d);
          return (
            <button
              key={s}
              type="button"
              onClick={() => opKies(d)}
              data-buiten={d.getMonth() !== maand.getMonth() ? 'ja' : undefined}
              data-vandaag={s === vandaag ? 'ja' : undefined}
              data-week={gekozenWeek.includes(s) ? 'ja' : undefined}
            >
              {d.getDate()}
              {metIets.has(s) && <i />}
            </button>
          );
        })}
      </div>

      <div className="axe-minimaand-vandaag">
        <div className="axe-minimaand-label">Today <em>{vanVandaag.length}</em></div>
        {vanVandaag.length === 0 ? (
          <p>Nothing planned today.</p>
        ) : (
          <ul>
            {vanVandaag.map(i => (
              <li key={i.id} title={i.titel}>
                <i style={{ background: i.kleur }} />
                <span>{i.tijd}</span>
                <b>{i.titel}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
