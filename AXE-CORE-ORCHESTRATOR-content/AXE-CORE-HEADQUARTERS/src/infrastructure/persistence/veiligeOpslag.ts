/**
 * Schrijven naar localStorage zonder dat een volle opslag een pagina sloopt.
 *
 * ## Wat er gebeurde
 *
 * Settings en EVE lieten allebei "This page crashed" zien. De melding die het
 * crashscherm eindelijk toonde: `The quota has been exceeded.` Dat is geen
 * provider die een verzoek weigert en geen netwerkfout -- het is WebKit's eigen
 * opslag die vol is. Opnieuw proberen helpt niet, en ergens een account bijvullen
 * ook niet.
 *
 * Beide pagina's schreven onbeschermd: `localStorage.setItem(...)` in een
 * effect. Zit de opslag vol, dan gooit die, React vangt het bij de
 * ErrorBoundary, en je hele scherm is weg omdat een VOORKEUR niet kon worden
 * onthouden. Dat is de verkeerde verhouding: een cache die niet landt is
 * vervelend, een pagina die niet opent is stuk.
 *
 * `userSettingsService.writeLocalCopy` had dit al goed -- met een comment die
 * precies deze fout beschrijft. Dit is dezelfde oplossing, maar dan bruikbaar
 * voor de andere 140 schrijfplekken.
 *
 * ## Waarom het meer doet dan try/catch
 *
 * Alleen vangen betekent dat de opslag vol BLIJFT, en dan landt er vanaf dat
 * moment niets meer -- je voorkeuren gaan stilletjes verloren tot je zelf je
 * gegevens wist. Daarom ruimt hij eerst op en probeert opnieuw.
 *
 * Alleen wat aantoonbaar opnieuw op te bouwen is: logs, caches, browsergeschiedenis.
 * Nooit sleutels, instellingen of notities. Bij twijfel blijft het staan en
 * mislukt de schrijfactie -- gegevens weggooien om ruimte te maken voor een
 * voorkeur is een ruil die niemand heeft gevraagd.
 */

/** Sleutels die weg mogen om ruimte te maken. Allemaal opnieuw op te bouwen.
 *
 *  Volgorde is de weggooivolgorde: het minst waardevolle eerst. */
export const OPOFFERBAAR: readonly string[] = [
  'axe_browser_history',   // groeit onbegrensd bij elke bezochte pagina
  'axe_core_logs',
  'axe_routing_log',
  'axe_ollama_model_health',
  'axe_smarthome_cache',
] as const;

/** Herkent een volle opslag, over motoren heen.
 *
 *  Chromium gooit QuotaExceededError (code 22), WebKit QUOTA_EXCEEDED_ERR (1014)
 *  en Firefox NS_ERROR_DOM_QUOTA_REACHED. Op één daarvan controleren is
 *  hetzelfde als op geen. */
export function isVolleOpslag(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const f = e as { name?: string; code?: number; message?: string };
  return (
    f.name === 'QuotaExceededError' ||
    f.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    f.code === 22 || f.code === 1014 ||
    /quota/i.test(f.message || '')
  );
}

export interface OpslagUitslag {
  gelukt: boolean;
  /** Welke sleutels zijn opgeofferd om ruimte te maken. Leeg als dat niet nodig was. */
  opgeruimd: string[];
  reden?: string;
}

/**
 * Schrijf een waarde weg. Gooit nooit.
 *
 * @param opslag meestal `localStorage`; ontbreekt in privémodus en in tests.
 */
export function zetItem(
  sleutel: string,
  waarde: string,
  opslag: Storage | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): OpslagUitslag {
  if (!opslag) return { gelukt: false, opgeruimd: [], reden: 'geen opslag beschikbaar' };

  try {
    opslag.setItem(sleutel, waarde);
    return { gelukt: true, opgeruimd: [] };
  } catch (e) {
    if (!isVolleOpslag(e)) {
      return { gelukt: false, opgeruimd: [], reden: e instanceof Error ? e.message : String(e) };
    }

    // Opruimen en één keer opnieuw. Eén keer, want lukt het daarna nog niet,
    // dan is wat je schrijft groter dan wat er ooit vrij komt -- en dan is
    // blijven proberen een lus in plaats van een oplossing.
    const opgeruimd: string[] = [];
    for (const kandidaat of OPOFFERBAAR) {
      if (kandidaat === sleutel) continue; // niet het ding wissen dat je schrijft
      try {
        if (opslag.getItem(kandidaat) === null) continue;
        opslag.removeItem(kandidaat);
        opgeruimd.push(kandidaat);
      } catch { /* verder met de volgende */ }

      try {
        opslag.setItem(sleutel, waarde);
        return { gelukt: true, opgeruimd };
      } catch { /* nog steeds vol; volgende kandidaat */ }
    }

    return {
      gelukt: false,
      opgeruimd,
      reden: 'opslag vol, ook na opruimen',
    };
  }
}

/** Zelfde, maar voor een waarde die eerst door JSON moet. */
export function zetJson(
  sleutel: string,
  waarde: unknown,
  opslag?: Storage | null,
): OpslagUitslag {
  let json: string;
  try {
    json = JSON.stringify(waarde);
  } catch (e) {
    // Een kringverwijzing hoort hier te stranden en niet in de aanroeper.
    return { gelukt: false, opgeruimd: [], reden: `niet te serialiseren: ${e instanceof Error ? e.message : e}` };
  }
  return zetItem(sleutel, json, opslag);
}
