/**
 * De agenda als lijst: op dag gegroepeerd, met de tijd ervoor.
 *
 * ## Waarom dit in de schuifbalk hoort
 *
 * In de maandweergave staat er naast de kalender een paneel voor de gekozen
 * dag; in de week is elke dag al een kolom en zou zo'n paneel alleen breedte
 * kosten. Maar de VRAAG blijft in allebei dezelfde -- "wat komt eraan" -- en
 * die hoort dus op een plek die in allebei bestaat: de rechter schuifbalk, die
 * je opent als je hem nodig hebt en die verder niets kost.
 *
 * ## Vandaag en morgen in woorden
 *
 * "Vandaag · woensdag 18 maart" en niet "2026-03-18". Een datum moet je
 * omrekenen naar vandaag voordat hij iets betekent, en dat rekenwerk doe je op
 * een drukke dag niet -- dus zie je niet dat iets nu is.
 */
import { ChevronRight } from 'lucide-react';
import { datumSleutel, type RoosterItem } from '@/domain/weekRooster';

/** Vandaag, morgen, of gewoon de weekdag. */
function dagKop(sleutel: string, nu: Date): { kop: string; onder: string } {
  const d = new Date(`${sleutel}T12:00:00`);
  const vandaag = datumSleutel(nu);
  const morgenDatum = new Date(nu);
  morgenDatum.setDate(morgenDatum.getDate() + 1);
  const vol = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  if (sleutel === vandaag) return { kop: 'Vandaag', onder: vol };
  if (sleutel === datumSleutel(morgenDatum)) return { kop: 'Morgen', onder: vol };
  return { kop: d.toLocaleDateString('nl-NL', { weekday: 'long' }), onder: vol };
}

export function AgendaLijst({
  items, titel, vanaf, tot, opKies, leegTekst,
}: {
  items: RoosterItem[];
  titel: string;
  /** Alleen dagen vanaf deze sleutel (YYYY-MM-DD). Leeg = alles. */
  vanaf?: string;
  /** Alleen deze ene dag. Voor de maandweergave: het gaat dan om de dag die je
   *  hebt aangeklikt en niet om wat er daarna komt. */
  tot?: string;
  opKies?: (item: RoosterItem) => void;
  leegTekst: string;
}) {
  const nu = new Date();
  const zichtbaar = items
    .filter(i => (vanaf ? i.datum >= vanaf : true))
    .filter(i => (tot ? i.datum === tot : true))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.tijd.localeCompare(b.tijd));

  const dagen = new Map<string, RoosterItem[]>();
  for (const i of zichtbaar) {
    const l = dagen.get(i.datum);
    if (l) l.push(i); else dagen.set(i.datum, [i]);
  }

  return (
    <section className="axe-agenda">
      <header className="axe-agenda-kop">
        <span className="axe-agenda-titel">{titel}</span>
        {/* Alleen tonen als er iets IS. "0 komend" is ruis. */}
        {zichtbaar.length > 0 && (
          <span className="axe-agenda-tel">{zichtbaar.length} komend</span>
        )}
      </header>

      {zichtbaar.length === 0 ? (
        <div className="axe-agenda-leeg">{leegTekst}</div>
      ) : (
        [...dagen.entries()].map(([sleutel, lijst]) => {
          const { kop, onder } = dagKop(sleutel, nu);
          return (
            <div key={sleutel} className="axe-agenda-dag">
              <div className="axe-agenda-dagkop">
                <span className="axe-agenda-dagnaam">{kop}</span>
                <span className="axe-agenda-dagdatum">{onder}</span>
                <span className="axe-agenda-dagtel">
                  {lijst.length} {lijst.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              {lijst.map(i => (
                <button key={i.id} className="axe-agenda-rij" onClick={() => opKies?.(i)}>
                  <span className="axe-agenda-tijd">{i.tijd}</span>
                  {/* De kleur is een stip en de titel; het vlak blijft leeg
                      (wet 10). */}
                  <i className="axe-agenda-stip" style={{ background: i.kleur }} />
                  <span className="axe-agenda-naam">{i.titel}</span>
                  <ChevronRight size={12} className="axe-agenda-pijl" />
                </button>
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}
