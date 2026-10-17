/**
 * Welke core_notifications-rijen een échte Android-melding mogen worden.
 *
 * De bel toont alles. Het schaduwscherm van de A17 mag dat niet: 173 van de
 * eerste 186 rijen waren "provider weg", en dat is geen reden om het toestel
 * te laten trillen. Vier gebeurtenissen wel, en die schrijft de backend al:
 *
 *   - goedkeuring nodig (vraag_luka / schrijf_goedkeuring_melding)
 *   - taak mislukt (TaskCompletionToasts: "Stuck: …")
 *   - agent/taak klaar (TaskCompletionToasts: "Done: …")
 *   - NorthSea needs-your-OK ("Yes needed: DEAL-…")
 *
 * Zelfde regel in Kotlin (`docs/android/notify/AxePush.kt` isShadeEvent):
 * wijzig je hier een geval, dan daar ook, anders hoort de telefoon iets
 * anders dan de tests beloven.
 */
import { notificationText } from '@/domain/notification';

export type NativeMeldingSoort = 'approval' | 'task_failed' | 'agent_done' | 'northsea_ok';

const DEAL = /\bdeal-\d+\b/i;

export function nativeMeldingSoort(message: string): NativeMeldingSoort | null {
  const raw = (message ?? '').trim();
  const { title, detail } = notificationText(raw);
  const kop = title.trim();
  const alles = `${title}\n${detail}`;

  if (/^stuck:/i.test(raw) || /^failed:/i.test(raw) || /^(stuck|failed)$/i.test(kop)) return 'task_failed';
  if (/^done:/i.test(raw) || /^done$/i.test(kop)) return 'agent_done';

  const deal = DEAL.test(alles) || /\bnorthsea\b/i.test(alles);
  const jaNodig = /\byes needed\b/i.test(alles)
    || /needs your ok/i.test(alles)
    || /goedkeuring nodig/i.test(alles)
    || /approve\?/i.test(alles);
  if (deal && (jaNodig || /^yes needed/i.test(kop))) return 'northsea_ok';

  if (
    /goedkeuring nodig/i.test(alles)
    || /needs your ok/i.test(alles)
    || /waiting.?approval/i.test(alles)
    || /approve\?/i.test(alles)
    || /^yes needed/i.test(kop)
  ) return 'approval';

  return null;
}

export function isNativeSchaduwMelding(message: string): boolean {
  return nativeMeldingSoort(message) !== null;
}
