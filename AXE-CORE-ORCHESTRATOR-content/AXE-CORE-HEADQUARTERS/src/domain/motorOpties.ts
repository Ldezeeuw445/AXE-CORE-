/**
 * Welke abonnementen in het menu van een hoofd-agent staan (Settings → Agents).
 *
 * Luka, 20 nov: "geen dubbele agents of dingen die helemaal niet kloppen".
 * Gemeten: "Claude-abonnement · <gmail>" stond twee keer in elk menu (map 1 én
 * map 2 op de Mac mini zijn op hetzelfde account ingelogd), en elk menu bood
 * vier abonnementen aan die nergens ingelogd zijn.
 *
 * Regels:
 * - niet ingelogd → niet in het menu, BEHALVE als het de huidige keuze is
 *   (dan blijft hij staan, zodat je ziet dat het fout staat);
 * - hetzelfde account twee keer → één keer (de eerste map wint);
 * - 'sleutels' (API-sleutels) staat er altijd in.
 */
import type { MotorStatus } from '@/domain/motorNaam';

export function motorOpties<M extends string>(
  opties: readonly M[],
  accounts: Readonly<Record<string, MotorStatus | undefined>>,
  huidig: M,
): M[] {
  const gezien = new Set<string>();
  const uit: M[] = [];
  for (const m of opties) {
    const st = accounts[m];
    const isHuidig = m === huidig;
    if (m !== 'sleutels' && !isHuidig && st && st.ingelogd === false) continue;
    const account = st?.ingelogd === true ? (st.account || '').trim().toLowerCase() : '';
    if (account) {
      const sleutel = `${m.replace(/\d+$/, '')}:${account}`;
      if (gezien.has(sleutel) && !isHuidig) continue;
      gezien.add(sleutel);
    }
    uit.push(m);
  }
  return uit;
}

/**
 * Modellen uit het menu halen waarvan de provider bij de laatste test faalde
 * (geen tegoed, onbekend model, 400...). De huidige keuze blijft staan, zodat
 * je ziet dat die het niet doet. Alleen het menu: wat er draait verandert niet.
 */
export function zonderFalende<K extends { provider: string; model: string }>(
  keuzes: readonly K[],
  verbindingen: Readonly<Record<string, { lastTest?: string } | undefined>>,
  huidig?: string | null,
): K[] {
  return keuzes.filter((k) => verbindingen[k.provider]?.lastTest !== 'fail' || `${k.provider}:${k.model}` === huidig);
}
