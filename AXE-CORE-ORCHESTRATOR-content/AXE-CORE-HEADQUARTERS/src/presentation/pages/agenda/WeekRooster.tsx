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
  weekDagen, datumSleutel, urenVanDag, urenBereik, routineNaam, type RoosterItem, type UurCel,
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

/** Eén leesbare regel in de week: tijd en titel, op volle breedte. */
function Regel({ item, opKies }: { item: RoosterItem; opKies?: (item: RoosterItem) => void }) {
  return (
    <button
      type="button"
      className="axe-week-regel"
      onClick={() => opKies?.(item)}
      title={`${tijdVak(item.tijd, item.duurMin)} · ${item.titel}`}
      style={{ ['--blok' as string]: item.kleur }}
    >
      <span className="axe-week-regeltijd">{item.tijd}</span>
      <span className="axe-week-regeltitel">{item.titel}</span>
    </button>
  );
}

/** Alle routines van dit uur samen; klik voor de dagweergave met alles los. */
function RoutineRegel({ routines, opKies }: { routines: RoosterItem[]; opKies?: (item: RoosterItem) => void }) {
  const namen = [...new Set(routines.map(routineNaam))];
  const tekst = routines.length === 1 ? namen[0] : `${routines.length} routines`;
  return (
    <button
      type="button"
      className="axe-week-regel axe-week-regel--routine"
      onClick={() => opKies?.(routines[0])}
      title={namen.join('\n')}
      style={{ ['--blok' as string]: routines[0].kleur }}
    >
      <span className="axe-week-regeltitel">{tekst}</span>
    </button>
  );
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
  const nuUur = nu.getHours();
  const nuInUur = (nu.getMinutes() / 60) * 100;
  const rol = useRef<HTMLDivElement>(null);
  const nuRij = useRef<HTMLDivElement>(null);
  const heeftItems = items.length > 0;
  // Bij openen, en nog één keer als de items binnen zijn: de rijen groeien mee
  // met wat erin staat, dus "nu" staat pas daarna op zijn echte plek.
  useEffect(() => {
    const el = rol.current;
    const rij = nuRij.current;
    if (!el || !rij) return;
    el.scrollTop += rij.getBoundingClientRect().top - el.getBoundingClientRect().top - 120;
  }, [heeftItems]);

  const perDag = new Map(sleutels.map((k) => [k, new Map<number, UurCel>(urenVanDag(items, k, van, tot).map((c) => [c.uur, c]))]));

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

          {uren.map((u, rij) => (
            <div
              key={`u${u}`}
              ref={u === nuUur ? nuRij : undefined}
              className="axe-week-uur"
              style={{ gridRow: rij + 2 }}
            >
              {uurLabel(u)}
            </div>
          ))}

          {uren.flatMap((u, rij) => sleutels.map((sleutel, kolom) => {
            const cel = perDag.get(sleutel)?.get(u);
            return (
              <div
                key={`${sleutel}-${u}`}
                className="axe-week-uurcel"
                data-vandaag={sleutel === vandaag ? 'ja' : undefined}
                style={{ gridColumn: kolom + 2, gridRow: rij + 2 }}
              >
                {u === nuUur && (
                  <i className="axe-week-nulijn" data-vandaag={sleutel === vandaag ? 'ja' : undefined} style={{ top: `${nuInUur}%` }} />
                )}
                {cel?.regels.map((item) => <Regel key={item.id} item={item} opKies={opKies} />)}
                {cel && cel.meer.length > 0 && (
                  <button type="button" className="axe-week-regel axe-week-regel--routine" onClick={() => opKies?.(cel.meer[0])}>
                    <span className="axe-week-regeltitel">+{cel.meer.length} more</span>
                  </button>
                )}
                {cel && cel.routines.length > 0 && <RoutineRegel routines={cel.routines} opKies={opKies} />}
              </div>
            );
          }))}
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
