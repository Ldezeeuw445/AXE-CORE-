/**
 * Eén cron-tabel: één app, één rij per schema.
 *
 * ## Waarom een tabel en geen kaarten
 *
 * Het waren kaarten in een raster, één per schema. Zes kaarten zijn zes
 * blokken die je stuk voor stuk moet lezen; zes rijen zijn één blik. Bij
 * schema's is dat het hele punt -- je kijkt niet naar één job, je kijkt of er
 * eentje rood staat.
 *
 * ## Waarom er geen "Duration" in staat
 *
 * Het voorbeeld heeft die kolom. Wij weten hem niet: CronSchedule draagt
 * next_run_at, last_run_at en last_status, maar geen looptijd -- de API meet
 * hem niet. Een kolom vol streepjes is erger dan geen kolom, dus staat er
 * Soort: welke motor de job draait. Dat is wél bekend en het is wat je moet
 * weten voordat je op Nu klikt.
 *
 * Wil je de looptijd echt, dan moet /cron/schedules hem gaan rapporteren. Dat
 * is backend-werk, geen opmaak.
 */
import { Play, RefreshCw, Power, Trash2 } from 'lucide-react';
import type { CronSchedule } from '@/infrastructure/gateways/axeCoreApiService';

export interface TabelActies {
  runNow: (s: CronSchedule) => void;
  toggle: (s: CronSchedule) => void;
  remove: (s: CronSchedule) => void;
  bezig: (id: string) => boolean;
}

export interface KolomTekst {
  soort: (s: CronSchedule) => string;
  soortKleur: (s: CronSchedule) => string;
  menselijk: (expr: string) => string;
  tijd: (iso: string | null) => string;
}

export function CronTabel({
  titel, onderschrift, kleur, schemas, acties, tekst, compact, opNieuw,
}: {
  titel: string;
  onderschrift: string;
  kleur: string;
  schemas: CronSchedule[];
  acties: TabelActies;
  tekst: KolomTekst;
  /** De vier naast elkaar: minder kolommen, want ze zijn een kwart zo breed. */
  compact?: boolean;
  opNieuw: () => void;
}) {
  const draait = schemas.filter(s => s.enabled).length;
  const stuk = schemas.filter(s => s.last_status === 'fail').length;

  return (
    <section className="axe-cron">
      <header className="axe-cron-kop">
        <div className="min-w-0">
          {/* De naam in de KLEUR van de app, niet een gekleurd vlakje ernaast:
              kleur zit in de letters (wet 10). */}
          <div className="axe-cron-titel" style={{ color: kleur }}>{titel}</div>
          <div className="axe-cron-onder">{onderschrift}</div>
        </div>
        <div className="axe-cron-tellers">
          {/* Alleen tonen wat er IS. Een teller op nul is ruis: "0 mislukt"
              leest als een probleemkolom die er niet hoort te zijn. */}
          {draait > 0 && (
            <span><i className="axe-cron-stip" style={{ background: 'var(--m-structure)' }} />{draait} actief</span>
          )}
          {stuk > 0 && (
            <span style={{ color: 'var(--m-broken)' }}>
              <i className="axe-cron-stip" style={{ background: 'var(--m-broken)' }} />{stuk} mislukt
            </span>
          )}
          <button onClick={opNieuw} title={`Nieuw schema voor ${titel}`}>+</button>
        </div>
      </header>

      {schemas.length === 0 ? (
        <div className="axe-cron-leeg">Nog geen schema’s. Klik op + om er een te maken.</div>
      ) : (
        <div className="axe-cron-rol">
          <table className="axe-cron-tabel">
            <thead>
              <tr>
                <th>Job</th>
                <th>Schema</th>
                {!compact && <th className="axe-cron-r">Laatste</th>}
                <th className="axe-cron-r">Volgende</th>
                <th>Status</th>
                {!compact && <th>Soort</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {schemas.map(s => (
                <tr key={s.id} data-uit={s.enabled ? undefined : 'ja'}>
                  <td className="axe-cron-naam" title={s.name}>{s.name}</td>
                  <td className="axe-cron-expr" title={tekst.menselijk(s.cron_expr)}>{s.cron_expr}</td>
                  {!compact && <td className="axe-cron-r axe-cron-zacht">{tekst.tijd(s.last_run_at)}</td>}
                  <td className="axe-cron-r axe-cron-zacht">{s.enabled ? tekst.tijd(s.next_run_at) : 'uit'}</td>
                  <td>
                    <span className="axe-cron-stand" data-stand={stand(s)}>
                      <i className="axe-cron-stip" />
                      {standTekst(s)}
                    </span>
                  </td>
                  {!compact && (
                    <td className="axe-cron-zacht" style={{ color: tekst.soortKleur(s) }}>{tekst.soort(s)}</td>
                  )}
                  <td className="axe-cron-knoppen">
                    <button onClick={() => acties.toggle(s)} disabled={acties.bezig(s.id)}
                      title={s.enabled ? 'Uitzetten' : 'Aanzetten'}>
                      <Power size={12} />
                    </button>
                    <button onClick={() => acties.runNow(s)} disabled={acties.bezig(s.id)} title="Nu uitvoeren">
                      {acties.bezig(s.id) ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                    </button>
                    <button onClick={() => acties.remove(s)} disabled={acties.bezig(s.id)} title="Weghalen">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Vier standen en niet twee.
 *
 * "Uit" is geen mislukking en geen succes -- het is een job die met opzet niet
 * draait, en die hoort niet groen te zijn omdat de vorige keer toevallig goed
 * ging. Dat onderscheid ontbrak: een uitgezette job was niet te onderscheiden
 * van een draaiende.
 */
function stand(s: CronSchedule): 'uit' | 'stuk' | 'goed' | 'nieuw' {
  if (!s.enabled) return 'uit';
  if (s.last_status === 'fail') return 'stuk';
  if (s.last_status === 'ok') return 'goed';
  return 'nieuw';
}

function standTekst(s: CronSchedule): string {
  switch (stand(s)) {
    case 'uit': return 'Uit';
    case 'stuk': return 'Mislukt';
    case 'goed': return 'Gelukt';
    default: return 'Wacht';
  }
}
