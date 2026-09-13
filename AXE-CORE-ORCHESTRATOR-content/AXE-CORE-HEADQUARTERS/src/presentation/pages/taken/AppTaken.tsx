/**
 * Eén app: zijn deadlines, en eronder zijn dagen.
 *
 * ## Waarom deze twee onder elkaar horen
 *
 * De deadlinelijst zegt WAT er ligt en hoe dringend; de dagenlijst zegt WANNEER.
 * Dat zijn twee vragen over dezelfde taken, en ze los van elkaar zetten
 * betekent dat je van de ene naar de andere moet kijken om een plan te maken.
 *
 * ## Waarom de kleur uit de prioriteit komt
 *
 * Het voorbeeld kleurt op categorie (Work, Health, Learning). Die categorieën
 * bestaan hier niet -- verzinnen zou betekenen dat elke taak er een moet
 * krijgen die niemand invult, en dan is alles grijs. Prioriteit staat er wél
 * op, bij elke taak, en het is wat je wilt zien: niet "welk soort" maar "hoe
 * erg".
 */
import { Check, Trash2, TriangleAlert } from 'lucide-react';
import { wanneer } from '@/domain/deadlineWoorden';

export interface AppTaak {
  id: string;
  titel: string;
  /** Aan wie hij hangt. Staat onder de titel, zoals het project in het voorbeeld. */
  van: string;
  prioriteit: 'low' | 'medium' | 'high' | 'critical';
  /** ms sinds epoch, of undefined als er geen datum op staat. */
  deadline?: number;
  /** 0-100. */
  voortgang: number;
  klaar: boolean;
  /** De kanban-stand. Voor de tellers bovenin. */
  stand: 'todo' | 'in-progress' | 'done' | 'blocked';
}

const PRIO_KLEUR: Record<AppTaak['prioriteit'], string> = {
  critical: 'var(--m-broken)',
  high: 'var(--m-broken)',
  medium: 'var(--m-budget)',
  low: 'var(--m-structure)',
};


export function AppTaken({
  label, kleur, blurb, taken, opTaak, opNieuw, opKlaar, opWeg,
}: {
  label: string;
  kleur: string;
  blurb: string;
  taken: AppTaak[];
  opTaak?: (t: AppTaak) => void;
  opNieuw: () => void;
  /** Afvinken. Zat op de oude kaarten en hoort niet te verdwijnen omdat de
   *  vorm verandert -- dan kun je een taak wel maken maar niet afsluiten. */
  opKlaar: (t: AppTaak) => void;
  opWeg: (t: AppTaak) => void;
}) {
  const open = taken.filter(t => !t.klaar);
  const telaat = open.filter(t => t.deadline !== undefined && wanneer(t.deadline).telaat);
  const metDatum = open
    .filter(t => t.deadline !== undefined)
    .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));

  return (
    <section className="axe-app">
      <header className="axe-app-kop">
        <div className="min-w-0">
          <div className="axe-app-titel" style={{ color: kleur }}>{label}</div>
          <div className="axe-app-onder">{blurb}</div>
        </div>
        <div className="axe-app-tellers">
          {telaat.length > 0 && (
            <span style={{ color: 'var(--m-broken)' }}>
              <TriangleAlert size={11} />{telaat.length} te laat
            </span>
          )}
          <button onClick={opNieuw} title={`Nieuwe taak voor ${label}`}>+</button>
        </div>
      </header>

      {/* De cijfers van DEZE app.
        *
        * Ze stonden als één rij bovenaan de pagina, over alle apps opgeteld.
        * Dat getal beantwoordt geen enkele vraag die je hebt: "twaalf te doen"
        * zegt niets als je wil weten of Companion achterloopt. Per kaart, dus,
        * op dezelfde plek in alle vijf. */}
      <div className="axe-app-cijfers">
        {([
          ['Totaal', taken.length, 'var(--text-primary)'],
          ['Te doen', taken.filter(t => t.stand === 'todo').length, 'var(--text-muted)'],
          ['Bezig', taken.filter(t => t.stand === 'in-progress').length, 'var(--m-structure)'],
          ['Klaar', taken.filter(t => t.stand === 'done').length, 'var(--m-happened)'],
        ] as const).map(([naam, waarde, tint]) => (
          <div key={naam}>
            <span className="axe-app-cijfer" style={{ color: tint }}>{waarde}</span>
            <span className="axe-app-cijfernaam">{naam}</span>
          </div>
        ))}
      </div>

      <div className="axe-app-rol">
        {open.length === 0 ? (
          <div className="axe-app-leeg">Niets open. Klik op + voor een taak.</div>
        ) : (
          <ul className="axe-app-lijst">
            {open.map(t => {
              const w = t.deadline !== undefined ? wanneer(t.deadline) : null;
              return (
                <li key={t.id} className="axe-app-li">
                  <button className="axe-app-rij" onClick={() => opTaak?.(t)}>
                    <i className="axe-app-prio" style={{ background: PRIO_KLEUR[t.prioriteit] }} />
                    <span className="min-w-0 flex-1">
                      <span className="axe-app-taaknaam">{t.titel}</span>
                      <span className="axe-app-taakvan">{t.van}</span>
                      {/* De balk alleen als er echt voortgang is. Een balk op
                          nul zegt niets en staat er bij elke nieuwe taak. */}
                      {t.voortgang > 0 && (
                        <span className="axe-app-balk">
                          <i style={{ width: `${Math.min(100, t.voortgang)}%`, background: kleur }} />
                        </span>
                      )}
                    </span>
                    <span className="axe-app-wanneer" style={{ color: w?.telaat ? 'var(--m-broken)' : undefined }}>
                      {w?.tekst ?? 'geen datum'}
                    </span>
                  </button>
                  {/* Afvinken en weghalen, naast de rij en niet erin: een knop
                      IN een knop is geen knop -- de klik komt op de buitenste
                      terecht. Ze verschijnen pas als je op de rij staat, want
                      twee knopjes maal twintig rijen vragen allemaal even hard
                      om aandacht. */}
                  <span className="axe-app-rijknoppen">
                    <button onClick={() => opKlaar(t)} title="Afvinken"><Check size={12} /></button>
                    <button onClick={() => opWeg(t)} title="Weghalen"><Trash2 size={12} /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── De dagen ─────────────────────────────────────────────────────
          Dezelfde taken, maar op datum gegroepeerd. Alleen wat een datum
          HEEFT: een taak zonder deadline op een dag zetten zou een datum
          verzinnen. */}
      <div className="axe-app-dagen">
        {metDatum.length === 0 ? (
          <div className="axe-app-leeg">Nog niets met een datum.</div>
        ) : (
          groepeerPerDag(metDatum).map(([dag, lijst]) => (
            <div key={dag} className="axe-app-dag">
              <div className="axe-app-dagkop">{dagLabel(dag)}</div>
              {lijst.map(t => (
                <button key={t.id} className="axe-app-dagrij" onClick={() => opTaak?.(t)}>
                  <i style={{ background: PRIO_KLEUR[t.prioriteit] }} />
                  <span className="axe-app-dagtijd">{tijdLabel(t.deadline!)}</span>
                  <span className="axe-app-dagnaam">{t.titel}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function dagSleutel(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Op dag gegroepeerd, in volgorde. Map houdt de invoegvolgorde, en de lijst
 *  komt al gesorteerd binnen -- dus geen tweede sortering nodig. */
function groepeerPerDag(taken: AppTaak[]): Array<[string, AppTaak[]]> {
  const map = new Map<string, AppTaak[]>();
  for (const t of taken) {
    const k = dagSleutel(t.deadline!);
    const lijst = map.get(k);
    if (lijst) lijst.push(t); else map.set(k, [t]);
  }
  return [...map.entries()];
}

function dagLabel(sleutel: string): string {
  const d = new Date(`${sleutel}T12:00:00`);
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function tijdLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}
