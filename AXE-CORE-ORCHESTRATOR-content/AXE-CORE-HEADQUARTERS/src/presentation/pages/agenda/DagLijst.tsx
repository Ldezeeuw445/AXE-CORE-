/**
 * De dag voor een telefoon: een week-strip om een dag te kiezen en daaronder elke afspraak als kaart
 * met zijn volle titel. Tik een kaart open voor de details (en bij een herhaling alle tijden).
 * De logica staat in domain/dagLijst; hier alleen de opmaak.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { datumSleutel, weekDagen, type RoosterItem } from '@/domain/weekRooster';
import { dagGroepen, ritme, tijdSpan } from '@/domain/dagLijst';

const DAGNAAM = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DagLijst({
  anker, items, opAnker, soorten,
}: {
  /** De dag die je bekijkt. */
  anker: Date;
  items: RoosterItem[];
  opAnker: (d: Date) => void;
  soorten: ReadonlyArray<{ label: string; kleur: string }>;
}) {
  const dagen = weekDagen(anker);
  const gekozen = datumSleutel(anker);
  const vandaag = datumSleutel(new Date());
  const [open, setOpen] = useState<string | null>(null);
  const groepen = useMemo(() => dagGroepen(items, gekozen), [items, gekozen]);
  const nuMin = new Date().getHours() * 60 + new Date().getMinutes();
  const volgende = gekozen === vandaag
    ? groepen.findIndex(g => g.tijden.some(t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) >= nuMin))
    : -1;
  const lijst = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(null); }, [gekozen]);
  // Open op wat er nu aankomt, niet op middernacht.
  useEffect(() => {
    const el = lijst.current?.querySelector<HTMLElement>('[data-volgende="ja"]');
    if (el && lijst.current) lijst.current.scrollTop = Math.max(0, el.offsetTop - 12);
  }, [gekozen, volgende]);

  const schuif = (dagen_: number) => {
    const d = new Date(anker);
    d.setDate(d.getDate() + dagen_);
    opAnker(d);
  };
  const kop = anker.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  const kleurVan = (soort: string) => soorten.find(s => s.label.toLowerCase() === soort.toLowerCase())?.kleur;

  return (
    <section className="axe-dag">
      <header className="axe-dag-kop">
        <button type="button" onClick={() => schuif(-1)} aria-label="Previous day"><ChevronLeft size={18} /></button>
        <div>
          <b>{gekozen === vandaag ? 'Today' : kop.split(',')[0]}</b>
          <span>{kop}</span>
        </div>
        <button type="button" onClick={() => schuif(1)} aria-label="Next day"><ChevronRight size={18} /></button>
      </header>

      <div className="axe-dag-strip" role="tablist" aria-label="Week">
        {dagen.map((d, i) => {
          const sleutel = datumSleutel(d);
          const aantal = items.filter(it => it.datum === sleutel).length;
          return (
            <button
              key={sleutel} type="button" role="tab" aria-selected={sleutel === gekozen}
              data-aan={sleutel === gekozen ? 'ja' : undefined} data-vandaag={sleutel === vandaag ? 'ja' : undefined}
              onClick={() => opAnker(d)}
            >
              <span>{DAGNAAM[i]}</span>
              <b>{d.getDate()}</b>
              <i>{aantal > 0 ? aantal : ''}</i>
            </button>
          );
        })}
      </div>

      <div className="axe-dag-lijst" ref={lijst}>
        {groepen.length === 0 && <p className="axe-dag-leeg">Nothing on this day.</p>}
        {groepen.map((g, gi) => {
          const uit = open === g.id;
          const r = ritme(g.tijden);
          return (
            <button
              key={g.id} type="button" className="axe-dag-kaart" data-open={uit ? 'ja' : undefined}
              data-volgende={gi === volgende ? 'ja' : undefined}
              style={{ ['--blok' as string]: g.kleur }}
              onClick={() => setOpen(uit ? null : g.id)}
              aria-expanded={uit}
            >
              <span className="axe-dag-tijd">{g.tijden[0]}</span>
              <span className="axe-dag-inhoud">
                <b>{g.titel}</b>
                <span className="axe-dag-meta">
                  {g.aantal > 1 ? `${g.aantal}× · ${g.tijden[0]} – ${g.tijden[g.tijden.length - 1]}${r ? ` · ${r}` : ''}` : tijdSpan(g.tijden[0], g.duurMin)}
                  <i>{g.soort}</i>
                </span>
                {uit && (
                  <span className="axe-dag-detail">
                    {g.aantal > 1
                      ? <span className="axe-dag-tijden">{g.tijden.map(t => <i key={t}>{t}</i>)}</span>
                      : <span>{tijdSpan(g.tijden[0], g.duurMin)} · {g.soort}{g.app ? ` · ${g.app}` : ''}</span>}
                    {kleurVan(g.soort) && <span className="axe-dag-bron"><i style={{ background: kleurVan(g.soort) }} />{g.soort}</span>}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
