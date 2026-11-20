/**
 * Getypt een afspraak in de agenda zetten, zonder model.
 *
 * Zelfde opslag en dezelfde botsingscheck als de stem-tool agenda_add
 * (toolRegistry.agenda.ts); alleen komen de velden hier uit afspraakUitZin in
 * plaats van uit het model. Het antwoord is voor Luka, dus gewone taal.
 */
import { afspraakUitZin } from '@/domain/agenda/afspraakUitZin';
import { botsingen, maakAfspraak, type Afspraak } from '@/domain/agenda/afspraken';
import { wijzigAfspraken } from '@/infrastructure/persistence/afsprakenService';

function wanneer(a: Afspraak, nu: Date): string {
  const [j, m, d] = a.datum.split('-').map(Number);
  const dag = new Date(j, m - 1, d);
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const verschil = Math.round((dag.getTime() - vandaag.getTime()) / 86_400_000);
  const naam = verschil === 0 ? 'today'
    : verschil === 1 ? 'tomorrow'
      : dag.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${naam} at ${a.tijd}`;
}

export async function zetInAgenda(tekst: string, nu: Date = new Date()): Promise<string> {
  const zin = afspraakUitZin(tekst);
  if (!zin) return "I didn't catch what to put in your calendar. Try: \"put dinner in my calendar Friday 19:30\".";
  if (!zin.tijd) return `What time should "${zin.titel || 'it'}" be? Say it again with a time, like 19:30.`;
  const nieuw = maakAfspraak({ titel: zin.titel, datum: zin.datum, tijd: zin.tijd, status: 'gepland' }, nu);
  if ('fout' in nieuw) return nieuw.fout;
  const { uitkomst: botst, gesynct } = await wijzigAfspraken(huidig => ({
    lijst: [...huidig, nieuw], uitkomst: botsingen(huidig, nieuw),
  }));
  return [
    `Done: "${nieuw.titel}" is in your calendar ${wanneer(nieuw, nu)}.`,
    botst.length ? `Heads up, that overlaps with ${botst.map(b => `"${b.titel}" at ${b.tijd}`).join(' and ')}.` : '',
    gesynct ? '' : "It's saved here but hasn't synced yet, so your other devices will see it a bit later.",
  ].filter(Boolean).join(' ');
}
