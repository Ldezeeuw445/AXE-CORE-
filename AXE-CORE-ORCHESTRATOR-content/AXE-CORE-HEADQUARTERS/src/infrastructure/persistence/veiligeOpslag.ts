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
/** Sleutels die NOOIT opgeofferd mogen worden bij quota-opruiming.
 *  Gesprekken (`axe_conv_v2_*`) en skills (`axe_custom_skills`) zijn primaire
 *  localStorage-stores (zie chatPersistence.ts), geen rebuildable caches. */
export const BESCHERMDE_OPSLAG_PREFIXEN: readonly string[] = [
  'axe_conv_v2_',
  'sb-', // auth tokens
] as const;
export const BESCHERMDE_OPSLAG_SLEUTELS: readonly string[] = [
  'axe_custom_skills',
] as const;

export const OPOFFERBAAR: readonly string[] = [
  'axe_browser_history',   // groeit onbegrensd bij elke bezochte pagina
  'axe_core_logs',
  'axe_routing_log',
  'axe_ollama_model_health',
  'axe_smarthome_cache',
  // Grote rebuildable caches — gemeten 2026-11-04: alleen axe_rag_memory was
  // al ~4 MB en duwde WKWebView over de ~5 MB quota, zodat supabase-js de
  // sessie niet kon bewaren ("The quota has been exceeded.").
  'axe_embed_cache_v1',
  'axe_trading_intel_reports',
  'axe_trading_decision_traces',
  'axe_trading_cycle_journal',
  'axe_kb_docs',
  'axe_obsidian_local_cache',
  'axe_planner_in_geheugen',
  'axe_trading_funnel_last_run',
] as const;

/**
 * Extra caches met "memory" in de naam. Niet in OPOFFERBAAR: die lijst mag
 * geen echte herinneringen/notities suggereren. Voor auth-persist mag dit
 * wél weg — de cloud/RAG-store is de bron, localStorage is alleen cache.
 */
export const AUTH_CACHE_OPOFFERBAAR: readonly string[] = [
  'axe_rag_memory',
  'axe_global_memory_cache',
  'axe_core_memory_local',
  'axe_memory_feedback_v1',
  'axe_memory_growth_history',
] as const;

/** Wis rebuildable caches zodat een auth-token nog past. */
export function ruimCachesVoorAuth(
  opslag: Storage | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): string[] {
  if (!opslag) return [];
  const opgeruimd: string[] = [];
  for (const kandidaat of [...OPOFFERBAAR, ...AUTH_CACHE_OPOFFERBAAR]) {
    try {
      if (opslag.getItem(kandidaat) === null) continue;
      opslag.removeItem(kandidaat);
      opgeruimd.push(kandidaat);
    } catch { /* volgende */ }
  }
  // NOOIT axe_conv_v2_* of axe_custom_skills wissen: chatPersistence.ts
  // gebruikt localStorage als primaire store voor gesprekken; skills idem.
  return opgeruimd;
}

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

    // Laatste redmiddel: auth/sessie-caches (RAG/embed) — anders kan
    // supabase-js de sessie niet bewaren en ziet Luka precies WebKit's
    // "The quota has been exceeded." op het login-scherm.
    for (const kandidaat of AUTH_CACHE_OPOFFERBAAR) {
      if (kandidaat === sleutel) continue;
      try {
        if (opslag.getItem(kandidaat) === null) continue;
        opslag.removeItem(kandidaat);
        opgeruimd.push(kandidaat);
      } catch { /* */ }
      try {
        opslag.setItem(sleutel, waarde);
        return { gelukt: true, opgeruimd };
      } catch { /* */ }
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
