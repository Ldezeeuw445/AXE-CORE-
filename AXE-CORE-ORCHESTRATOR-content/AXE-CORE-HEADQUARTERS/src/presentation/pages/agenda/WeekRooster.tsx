/**
 * De weekweergave: zeven kolommen, de uren erlangs, de afspraken erin.
 *
 * Het rekenwerk staat in domain/weekRooster (welke dagen, waar valt een blok,
 * welk urenbereik) -- met tests, want daar zitten de randgevallen: de week
 * begint op maandag terwijl getDay() op zondag begint, een blok van tien
 * minuten moet leesbaar blijven, en een afspraak buiten het bereik mag niet
 * bovenaan blijven plakken.
 *
 * Hier staat alleen de opmaak.
 */
import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
  weekDagen, datumSleutel, blokjesVoor, urenBereik, WERKDAG_START, type RoosterItem,
} from '@/domain/weekRooster';

const DAGNAAM = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function uurLabel(u: number): string {
  return `${String(u).padStart(2, '0')}:00`;
}

export function WeekRooster({
  anker, items, opAnker, opKies, soorten,
}: {
  /** Een datum in de week die je wilt zien. */
  anker: Date;
  items: RoosterItem[];
  opAnker: (d: Date) => void;
  opKies?: (item: RoosterItem) => void;
  /** De legenda onderaan: soort → kleur. */
  soorten: ReadonlyArray<{ label: string; kleur: string }>;
}) {
  const dagen = weekDagen(anker);
  const sleutels = dagen.map(datumSleutel);
  /* De hele dag, 00:00 tot 23:00. Vast, zodat de rij waar 14:00 staat elke dag
     en elke week dezelfde is. */
  const { van, tot } = urenBereik();
  const uren = Array.from({ length: tot - van }, (_, i) => van + i);
  const vandaag = datumSleutel(new Date());
  const rol = useRef<HTMLDivElement>(null);

  /* Bij het openen naar het werkuur toe schuiven. 24 rijen passen niet in
     beeld; zonder dit kijk je naar 02:00 en moet je elke keer zelf naar
     beneden. Eén keer, niet bij elke week -- anders springt hij terug terwijl
     je aan het bladeren bent. */
  useEffect(() => {
    const el = rol.current;
    if (!el) return;
    const celHoog = parseFloat(getComputedStyle(el).getPropertyValue('--celhoog')) || 44;
    el.scrollTop = WERKDAG_START * celHoog;
  }, []);

  const verschuif = (weken: number) => {
    const d = new Date(anker);
    d.setDate(d.getDate() + weken * 7);
    opAnker(d);
  };

  const eerste = dagen[0];
  const laatste = dagen[6];
  const zelfdeMaand = eerste.getMonth() === laatste.getMonth();
  const titel = zelfdeMaand
    ? `${eerste.getDate()} – ${laatste.getDate()} ${laatste.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`
    : `${eerste.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${laatste.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <section className="axe-week">
      <header className="axe-week-kop">
        <span className="axe-week-titel"><Clock size={14} />{titel}</span>
        <span className="axe-week-nav">
          <button onClick={() => verschuif(-1)} title="Vorige week"><ChevronLeft size={15} /></button>
          <button className="axe-week-nu" onClick={() => opAnker(new Date())}>Deze week</button>
          <button onClick={() => verschuif(1)} title="Volgende week"><ChevronRight size={15} /></button>
        </span>
      </header>

      <div className="axe-week-rol" ref={rol}>
        <div className="axe-week-raster" style={{ ['--uren' as string]: uren.length }}>
          {/* Hoek linksboven: leeg, maar hij moet er staan om de kolommen te
              laten kloppen. */}
          <div className="axe-week-hoek" />
          {dagen.map((d, i) => {
            const sleutel = datumSleutel(d);
            const aantal = items.filter(it => it.datum === sleutel).length;
            return (
              <div key={sleutel} className="axe-week-dagkop" data-vandaag={sleutel === vandaag ? 'ja' : undefined}>
                <span className="axe-week-dagnaam">{DAGNAAM[i]}</span>
                <span className="axe-week-dagnr">{d.getDate()}</span>
                {/* Hoeveel er die dag staat. Nul laten we weg: een lege dag
                    hoort leeg te zijn, niet "0". */}
                <span className="axe-week-dagtel">{aantal > 0 ? aantal : ' '}</span>
              </div>
            );
          })}

          {uren.map(u => (
            <div key={`u${u}`} className="axe-week-uur" style={{ gridRow: `${uren.indexOf(u) + 2}` }}>
              {uurLabel(u)}
            </div>
          ))}

          {sleutels.map((sleutel, kolom) => (
            <div
              key={`k${sleutel}`}
              className="axe-week-kolom"
              data-vandaag={sleutel === vandaag ? 'ja' : undefined}
              style={{ gridColumn: kolom + 2, gridRow: `2 / span ${uren.length}` }}
            >
              {uren.map(u => <div key={u} className="axe-week-cel" />)}

              {blokjesVoor(items, sleutel, van, tot).map(b => (
                <button
                  key={b.item.id}
                  type="button"
                  className="axe-week-blok"
                  onClick={() => opKies?.(b.item)}
                  style={{
                    top: `calc(${b.vanUur} * var(--celhoog))`,
                    height: `calc(${b.hoogUur} * var(--celhoog) - 2px)`,
                    /* De kleur zit in de linkerrand en in de TITEL, niet in een
                       gevuld blok (wet 10). Een gevulde balk in vier kleuren
                       naast elkaar is het drukste ding op het scherm, en dan
                       zegt de kleur niets meer. */
                    borderLeftColor: b.item.kleur,
                  }}
                >
                  <span className="axe-week-bloktitel" style={{ color: b.item.kleur }}>{b.item.titel}</span>
                  <span className="axe-week-bloktijd">{b.item.tijd}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <footer className="axe-week-voet">
        {soorten.map(s => (
          <span key={s.label}><i style={{ background: s.kleur }} />{s.label}</span>
        ))}
      </footer>
    </section>
  );
}
