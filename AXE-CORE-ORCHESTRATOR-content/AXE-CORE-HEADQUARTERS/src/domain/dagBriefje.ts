/**
 * Het dagelijkse briefje: plan, top 3, agenda.
 *
 * ## Wat hier kapot was
 *
 * Bouwlijst 6.6 noemt het briefje als ontbrekend. Dat is maar half waar, en de
 * andere helft is erger: er is wél een LEZER. `application/system/dailyBriefing.ts`
 * haalt een rij uit `core_notifications` die begint met "Daily Briefing:", en
 * `axeBootstrap` spreekt hem uit bij de eerste groet van de dag. Maar de
 * SCHRIJVER zou een VPS-cron zijn via `core_schedules`, en gemeten 1 okt 2026
 * maakt geen enkele migratie, seed of script in deze repo die rij aan. De lezer
 * geeft dus vrijwel zeker altijd null, en beide aanroepers vallen stil terug op
 * "AXE is online".
 *
 * Een lezer zonder schrijver is erger dan niets: het ziet eruit alsof de functie
 * bestaat, dus niemand bouwt hem.
 *
 * ## Waarom de tekst hier staat en niet bij het ophalen
 *
 * De grondstof werd al samengesteld (`haalTier1Kijk`: open taken, te late taken,
 * titels, agenda). Wat niet bestond is de REGEL: er was nergens een "top 3",
 * en `titels` is ongeordend en ongelimiteerd. Een top 3 zonder regel is
 * willekeur, en willekeur die hardop wordt voorgelezen is erger dan geen top 3.
 *
 * De regel staat hieronder, puur en getest. Hij gebruikt alleen rangorde die uit
 * echte data komt:
 *
 *   1. over tijd, langst over tijd eerst -- dat is een feit, geen inschatting
 *   2. daarna de orde die de planner zelf geeft
 *
 * Met opzet NIET op `priority` gesorteerd: dat veld is een vrije string in
 * `core_tasks` en ik heb niet gemeten welke waarden er echt in staan. Sorteren op
 * iets waarvan je de waarden niet kent, is een rangorde verzinnen.
 */

export interface DagKijk {
  /** Titels van taken die over tijd zijn, langst over tijd eerst. */
  teLaat: readonly string[];
  /** Open taken in de orde die de planner geeft. */
  open: readonly string[];
  /** Wat er vandaag op de agenda staat, al als regel. */
  agenda: readonly string[];
  openTaken: number;
  teLateTaken: number;
}

export const TOP_AANTAL = 3;

/**
 * De drie dingen die vandaag tellen.
 *
 * Te late taken eerst, daarna de rest in plannerorde, zonder dubbelen. Minder
 * dan drie is geen fout: dan zijn er minder dan drie.
 */
export function topDrie(kijk: DagKijk): string[] {
  const uit: string[] = [];
  const gezien = new Set<string>();
  for (const titel of [...kijk.teLaat, ...kijk.open]) {
    const t = (titel || '').trim();
    if (!t) continue;
    const sleutel = t.toLowerCase();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(t);
    if (uit.length >= TOP_AANTAL) break;
  }
  return uit;
}

/** Een getal met het juiste woord erachter. */
function taakWoord(n: number): string {
  return n === 1 ? '1 open taak' : `${n} open taken`;
}

/**
 * Het briefje zoals AXE het zegt.
 *
 * Nederlands en gesproken: dit gaat door TTS, dus geen opsommingstekens, geen
 * koppen, geen markdown. Korte zinnen die hardop kloppen.
 *
 * Geeft een lege string als er werkelijk niets te melden is. Dat is bewust geen
 * opgewekte zin over een leeg briefje: dan hoort de groet gewoon een groet te
 * zijn, en dat is wat de aanroeper doet.
 */
export function dagBriefjeTekst(kijk: DagKijk): string {
  const top = topDrie(kijk);
  const delen: string[] = [];

  if (kijk.teLateTaken > 0) {
    delen.push(
      kijk.teLateTaken === 1
        ? 'Er staat één taak over tijd.'
        : `Er staan ${kijk.teLateTaken} taken over tijd.`,
    );
  }

  if (top.length > 0) {
    const lijst = top.length === 1
      ? top[0]
      : `${top.slice(0, -1).join(', ')} en ${top[top.length - 1]}`;
    delen.push(top.length === 1 ? `Het belangrijkste: ${lijst}.` : `De top ${top.length}: ${lijst}.`);
  }

  if (kijk.openTaken > top.length) {
    delen.push(`Daarnaast ${taakWoord(kijk.openTaken - top.length)}.`);
  } else if (kijk.openTaken === 0 && top.length === 0) {
    // Niets open: dat is informatie, maar alleen als er ook geen agenda is
    // wordt het briefje leeg (zie onder).
    delen.push('Je hebt geen open taken.');
  }

  const agenda = kijk.agenda.map((a) => a.trim()).filter(Boolean);
  if (agenda.length > 0) {
    delen.push(
      agenda.length === 1
        ? `Op de agenda: ${agenda[0]}.`
        : `Op de agenda: ${agenda.slice(0, 3).join(', ')}${agenda.length > 3 ? `, en nog ${agenda.length - 3}` : ''}.`,
    );
  }

  // Niets open, niets te laat, niets op de agenda: geen briefje.
  if (top.length === 0 && kijk.openTaken === 0 && agenda.length === 0) return '';

  return delen.join(' ');
}

/** Hoe het briefje in het geheugen heet, zodat het per dag één rij blijft. */
export function briefjeSlug(nu: Date): string {
  const d = nu.toISOString().slice(0, 10);
  return `briefje-${d}`;
}
