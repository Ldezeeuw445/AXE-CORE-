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
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
  weekDagen, datumSleutel, blokjesVoor, banenVoor, urenBereik, type RoosterItem,
} from '@/domain/weekRooster';

const DAGNAAM = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** 09:00 + 45 min → "09:00 – 09:45". */
function tijdVak(tijd: string, duurMin: number): string {
  const [h, m] = tijd.split(':').map(Number);
  if (!Number.isFinite(h)) return tijd;
  const eind = h * 60 + (m || 0) + Math.max(0, duurMin);
  const hh = String(Math.floor(eind / 60) % 24).padStart(2, '0');
  const mm = String(eind % 60).padStart(2, '0');
  return duurMin > 0 ? `${tijd} – ${hh}:${mm}` : tijd;
}

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

  // De nu-lijn schuift elke minuut mee; bij openen staat het rooster rond nu.
  const [nu, setNu] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNu(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const nuPct = ((nu.getHours() - van) + nu.getMinutes() / 60) / (tot - van) * 100;
  const rol = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rol.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (el.scrollHeight * (nu.getHours() - van - 1.5)) / (tot - van));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    ? `${eerste.getDate()} – ${laatste.getDate()} ${laatste.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    : `${eerste.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${laatste.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <section className="axe-week">
      <header className="axe-week-kop">
        <span className="axe-week-titel"><Clock size={14} />{titel}</span>
        <span className="axe-week-nav">
          <button onClick={() => verschuif(-1)} title="Previous week"><ChevronLeft size={15} /></button>
          <button className="axe-week-nu" onClick={() => opAnker(new Date())}>This week</button>
          <button onClick={() => verschuif(1)} title="Next week"><ChevronRight size={15} /></button>
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
              {nuPct >= 0 && nuPct <= 100 && (
                <i className="axe-week-nulijn" data-vandaag={sleutel === vandaag ? 'ja' : undefined} style={{ top: `${nuPct}%` }} />
              )}

              {(() => {
                const bl = blokjesVoor(items, sleutel, van, tot);
                const ba = banenVoor(bl);
                // Hooguit drie naast elkaar; wat erboven valt komt samen in één
                // "+N"-blok in de derde baan -- anders worden het streepjes.
                const MAX = 3;
                const zicht = ba.map(x => x.banen <= MAX || x.baan < MAX - 1);
                const meer = new Map<number, { van: number; tot: number; n: number; eerste: number }>();
                bl.forEach((b, bi) => {
                  if (zicht[bi]) return;
                  const g = meer.get(ba[bi].groep) ?? { van: b.vanUur, tot: b.vanUur + b.hoogUur, n: 0, eerste: bi };
                  g.van = Math.min(g.van, b.vanUur); g.tot = Math.max(g.tot, b.vanUur + b.hoogUur); g.n += 1;
                  meer.set(ba[bi].groep, g);
                });
                const breed = (bi: number) => Math.min(ba[bi].banen, MAX);
                return (<>
                {[...meer.values()].map(g => (
                  <button
                    key={`meer-${g.eerste}`}
                    type="button"
                    className="axe-week-blok axe-week-meer"
                    onClick={() => opKies?.(bl[g.eerste].item)}
                    style={{
                      top: `${(g.van / uren.length) * 100}%`,
                      height: `calc(${(Math.max(0.5, g.tot - g.van) / uren.length) * 100}% - 3px)`,
                      left: `calc(${((MAX - 1) / MAX) * 100}% + 3px)`,
                      width: `calc(${100 / MAX}% - 6px)`,
                      right: 'auto',
                    }}
                  >
                    <span className="axe-week-bloktijd">+{g.n}</span>
                    <span className="axe-week-bloksoort">more</span>
                  </button>
                ))}
                {bl.map((b, bi) => zicht[bi] && (
                <button
                  key={b.item.id}
                  type="button"
                  className="axe-week-blok"
                  onClick={() => opKies?.(b.item)}
                  title={`${tijdVak(b.item.tijd, b.item.duurMin)} · ${b.item.titel}`}
                  style={{
                    /* Percentage van de KOLOM: de kolom is precies het urenbereik
                       hoog, dus 9:00 staat op 9/24 hoe hoog het rooster ook is. */
                    top: `${(b.vanUur / uren.length) * 100}%`,
                    height: `calc(${(b.hoogUur / uren.length) * 100}% - 3px)`,
                    ['--blok' as string]: b.item.kleur,
                    // Tegelijk = naast elkaar, elk een eigen baan.
                    left: `calc(${(ba[bi].baan / breed(bi)) * 100}% + 3px)`,
                    width: `calc(${100 / breed(bi)}% - 6px)`,
                    right: 'auto',
                  }}
                >
                  <span className="axe-week-bloktijd">{tijdVak(b.item.tijd, b.item.duurMin)}</span>
                  <span className="axe-week-bloksoort">{b.item.soort}</span>
                  <span className="axe-week-bloktitel">{b.item.titel}</span>
                </button>
                ))}
                </>);
              })()}
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
