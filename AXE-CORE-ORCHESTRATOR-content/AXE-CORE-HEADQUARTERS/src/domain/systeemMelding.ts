/**
 * Welke meldingen uit de bel ook een echte systeemmelding worden.
 *
 * ## Waarom
 *
 * De bel ziet alleen wie naar de app kijkt. Een cron die faalt of een product
 * dat offline gaat moet ook binnenkomen als het venster dicht is of achter
 * Mail zit. In de Tauri-app gaat dat via het meldingscentrum van macOS
 * (tauri-plugin-notification); op de A17 via Device Manager (NotificationManager).
 * De PWA houdt web-push; dat is niet het pad van de Samsung.
 *
 * ## Waarom dit een eigen regel is
 *
 * De bel laadt tot 400 rijen en ververst elke 30 seconden. Zonder regels krijg
 * je bij het opstarten 400 meldingen tegelijk, en daarna dezelfde zin elke keer
 * dat een provider wegvalt (173 van de eerste 186 rijen waren precies dat).
 * Dus:
 *
 *   - de eerste lading is de nulstand: wat er al stond is al gezien;
 *   - alleen nieuwe, ongelezen rijen van de laatste tien minuten tellen;
 *   - hetzelfde onderwerp hooguit eens per tien minuten;
 *   - hooguit drie per verversing, de rest als één samenvatting.
 *
 * `infrastructure/tauri/systeemMelding.ts` voert alleen uit wat hier besloten is.
 */

export interface MeldingRij {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
  read: boolean;
}

export interface SysteemMelding {
  title: string;
  body: string;
  /** Rij-id, zodat Android dezelfde melding niet twee keer post. */
  id?: string;
}

export interface SysteemMeldingStand {
  /** False tot de eerste lading binnen is: die zet alleen de nulstand. */
  gestart: boolean;
  gezien: ReadonlySet<string>;
  /** Wanneer een onderwerp het laatst als systeemmelding getoond is. */
  laatstPerTitel: ReadonlyMap<string, number>;
}

export const BEGINSTAND: SysteemMeldingStand = {
  gestart: false,
  gezien: new Set(),
  laatstPerTitel: new Map(),
};

/** Ouder dan dit is geen nieuws meer, ook al zag deze app hem nog niet. */
export const VERS_MS = 10 * 60_000;
/** Zelfde onderwerp niet vaker dan dit. */
export const DEMPING_MS = 10 * 60_000;
/** Meer dan dit per verversing wordt één samenvatting. */
export const MAX_PER_KEER = 3;

const MAX_TITEL = 80;
const MAX_TEKST = 240;

function kort(tekst: string, max: number): string {
  const t = tekst.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function kiesSysteemMeldingen(
  rijen: readonly MeldingRij[],
  stand: SysteemMeldingStand,
  nu: number,
): { tonen: SysteemMelding[]; stand: SysteemMeldingStand } {
  const gezien = new Set(stand.gezien);
  const laatstPerTitel = new Map(stand.laatstPerTitel);

  if (!stand.gestart) {
    for (const r of rijen) gezien.add(r.id);
    return { tonen: [], stand: { gestart: true, gezien, laatstPerTitel } };
  }

  const nieuw = rijen
    .filter(r => !gezien.has(r.id))
    .sort((a, b) => a.timestamp - b.timestamp);
  for (const r of nieuw) gezien.add(r.id);

  const kandidaten: MeldingRij[] = [];
  for (const r of nieuw) {
    if (r.read || nu - r.timestamp > VERS_MS) continue;
    const vorige = laatstPerTitel.get(r.title);
    if (vorige !== undefined && nu - vorige < DEMPING_MS) continue;
    // Binnen één verversing telt een onderwerp ook maar één keer.
    laatstPerTitel.set(r.title, nu);
    kandidaten.push(r);
  }

  const alsMelding = (r: MeldingRij): SysteemMelding => ({
    title: kort(r.title, MAX_TITEL),
    body: kort(r.detail, MAX_TEKST),
    id: r.id,
  });

  let tonen: SysteemMelding[];
  if (kandidaten.length <= MAX_PER_KEER) {
    tonen = kandidaten.map(alsMelding);
  } else {
    const rest = kandidaten.slice(MAX_PER_KEER - 1);
    tonen = [
      ...kandidaten.slice(0, MAX_PER_KEER - 1).map(alsMelding),
      {
        title: `AXE Core: nog ${rest.length} meldingen`,
        body: kort(rest.map(r => r.title).join(' · '), MAX_TEKST),
      },
    ];
  }

  // De set mag niet eindeloos groeien: alleen wat nog in de lijst staat telt.
  const inLijst = new Set(rijen.map(r => r.id));
  for (const id of gezien) if (!inLijst.has(id)) gezien.delete(id);

  return { tonen, stand: { gestart: true, gezien, laatstPerTitel } };
}
