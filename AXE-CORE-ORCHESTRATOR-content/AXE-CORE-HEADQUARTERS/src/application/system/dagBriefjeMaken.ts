/**
 * Het dagbriefje maken, want er was alleen een lezer.
 *
 * `dailyBriefing.ts` leest een rij uit `core_notifications` die een VPS-cron zou
 * schrijven. Gemeten 1 okt 2026: geen migratie, seed of script in deze repo maakt
 * die `core_schedules`-rij aan, dus die lezer geeft vrijwel zeker altijd null en
 * de groet valt stil terug op "AXE is online". Een lezer zonder schrijver ziet
 * eruit alsof de functie bestaat, dus niemand bouwt hem.
 *
 * Hier staat de schrijver, en hij draait lokaal -- geen cron die er misschien is.
 * De grondstof komt uit `haalTier1Kijk`, die taken en agenda al samenstelt met
 * een timeout per bron; de regel (de top 3, de gesproken tekst) staat puur in
 * `domain/dagBriefje.ts`.
 *
 * **Welke wint, als de VPS er ooit wél een schrijft:** die van de VPS. Hij heeft
 * meer gezien dan deze app -- mail, cron-uitslagen, wat er 's nachts gebeurde --
 * en als hij bestaat is hij rijker. Deze schrijver is de terugval, niet de
 * concurrent. Dat staat hier expliciet omdat het anders onbepaald is, en dan krijg
 * je in het slechtste geval twee briefjes achter elkaar te horen.
 */
import { dagBriefjeTekst, briefjeSlug, type DagKijk } from '@/domain/dagBriefje';
import { mapSleutel } from '@/domain/memory/mappen';
import { haalTier1Kijk } from '@/application/tierRouter/haalTier1Kijk';
import { loadTodaysBriefing } from './dailyBriefing';
import { remember } from '@/infrastructure/persistence/agentMemoryService';

/** Wat er vandaag speelt, uit de bronnen die er al zijn. Module-eigen: alleen
 *  `dagBriefjeVanVandaag` heeft hem nodig, en een export zonder aanroeper is
 *  precies wat dodeCode.test.ts terecht tegenhoudt. */
async function haalDagKijk(): Promise<DagKijk> {
  // 'priorities' is de enige soort die zowel taken als agenda ophaalt.
  const kijk = await haalTier1Kijk('priorities');
  return {
    teLaat: kijk.teLaatTitels,
    open: kijk.titels,
    agenda: kijk.agenda,
    openTaken: kijk.openTasks,
    teLateTaken: kijk.overdueTasks,
  };
}

/**
 * Het briefje van vandaag als gesproken tekst, of null als er niets te melden is.
 *
 * Eerst kijken of de VPS er een schreef; die gaat voor (zie de kop). Anders zelf
 * bouwen uit de opgeslagen data.
 */
export async function dagBriefjeVanVandaag(): Promise<string | null> {
  const vanDeVps = await loadTodaysBriefing().catch(() => null);
  if (vanDeVps) return vanDeVps;

  try {
    const tekst = dagBriefjeTekst(await haalDagKijk());
    return tekst || null;
  } catch (err) {
    console.warn('[dagBriefje] kon het briefje niet bouwen:', err);
    return null;
  }
}

/**
 * Het briefje in de inbox zetten, zodat AXE er later naar kan terugwijzen.
 *
 * Eén rij per dag: de sleutel is `inbox/briefje-<datum>` en de tabel heeft een
 * unieke index op `(agent, key)`, dus twee keer schrijven werkt de rij bij in
 * plaats van een tweede aan te maken. Faalt het, dan is dat geen reden om de
 * groet niet te zeggen -- vandaar de losse catch.
 */
export async function bewaarDagBriefje(tekst: string, nu = new Date()): Promise<void> {
  if (!tekst.trim()) return;
  try {
    await remember({
      kind: 'event',
      category: 'inbox',
      key: mapSleutel('inbox', briefjeSlug(nu)),
      content: tekst,
      tags: ['briefje', 'dag'],
      source: 'dagBriefje',
    });
  } catch (err) {
    console.warn('[dagBriefje] niet bewaard:', err);
  }
}
