/**
 * Of de app draait OP de machine waar `127.0.0.1` naar wijst.
 *
 * ## Waarom dit één regel op één plek is
 *
 * `127.0.0.1` betekent niet "de Mac" maar "het apparaat waarop deze pagina
 * draait". In de Tauri-app en in `vite dev` is dat de Mac. In de PWA op
 * axeheadquarters.com is het de telefoon of de iPad, en daar draait geen
 * shell-server en geen `run-local.sh`.
 *
 * Gemeten 2 okt 2026 kostte dat op twee plekken iets:
 *
 *   * de Terminal-tab toonde vier vakken op `ws://127.0.0.1:4022` met een groen
 *     stipje, die op de telefoon bij elke klik faalden met `code 1006`;
 *   * `agentHost` probeert `http://127.0.0.1:8001/health` om te kiezen tussen
 *     de lokale agent en de VPS. Vanaf een https-pagina is dat mixed content:
 *     de browser blokkeert hem, de catch leest dat als "lokaal draait niet", en
 *     de terugval naar de VPS is juist -- maar het is elke minuut opnieuw een
 *     verzoek dat niet kón slagen, met een fout in de console erbij.
 *
 * Beide vroegen dezelfde vraag, en een vraag die twee keer apart beantwoord
 * wordt gaat een keer uit elkaar lopen. Vandaar één functie, in domain, met
 * zijn omgeving als argument zodat hij te testen is.
 */
export interface Omgeving {
  /** Draait dit in de verpakte Tauri-app? */
  tauri: boolean;
  /** `location.hostname` van de pagina zelf. */
  paginaHost: string;
}

const LOKALE_NAMEN = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function opDezeMachine({ tauri, paginaHost }: Omgeving): boolean {
  // De verpakte app draait op de Mac, en zijn eigen hostnaam is `tauri.localhost`
  // -- die hoort hier niet als "pagina van localhost" te gelden maar als Tauri.
  if (tauri) return true;
  return LOKALE_NAMEN.has((paginaHost || '').toLowerCase());
}
