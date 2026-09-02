/**
 * Samenvoegen van providerverbindingen over apparaten heen.
 *
 * ## De storing die dit tegenhoudt
 *
 * `axe_llm_connections` wordt als één rij bewaard en als één geheel
 * weggeschreven. Elk apparaat schreef dus zijn eigen beeld over dat van alle
 * andere heen — en een apparaat dat de sleutels niet had, maakte ze overal leeg.
 *
 * Op 2 sep 2026 gebeurde dat. De instellingenpagina zaaide haar sleutels uit
 * `import.meta.env.VITE_*`; die zaten in de Tauri-build maar zijn die ochtend
 * uit de webbundel gehaald omdat ze publiek leesbaar bleken. De gehoste app
 * startte dus met een lege set, en de eerste druk op Test schreef die naar
 * Supabase. Zeven providers weg, zonder melding, want vanuit de code klopte
 * elke stap: de gebruiker drukte op een knop, de knop sloeg de toestand op.
 *
 * ## Waarom een domeinmodule
 *
 * Welke waarde wint is een regel, geen schermgedrag. Hij geldt voor elke
 * schrijver, hij is met een paar objecten te controleren, en hij hoort niet
 * verstopt te zitten in een pagina van 1500 regels waar niemand hem terugvindt
 * als het nog eens misgaat.
 */

export interface ProviderConn {
  key?: string;
  model?: string;
  models?: string[];
  baseUrl?: string;
  lastTest?: 'ok' | 'fail' | 'testing';
  lastTestAt?: string;
  lastError?: string;
}

export type ProviderConnections = Record<string, ProviderConn>;

/**
 * Voegt de lokale toestand samen met wat de cloud had.
 *
 * Het verschil tussen `undefined` en `''` draagt hier de hele beslissing:
 *
 *   · `undefined` — dit apparaat weet niets van deze sleutel. De cloud wint,
 *     want niets weten is geen reden om iets weg te gooien.
 *   · `''` — dit veld is bewust leeggemaakt. Dat is een keuze en komt door.
 *
 * Zonder dat onderscheid krijg je een van twee kwaden: sleutels die stilletjes
 * verdwijnen, of een veld dat je niet meer leeg kunt maken.
 */
export function mergeConnections(
  cloud: ProviderConnections,
  local: ProviderConnections,
): ProviderConnections {
  const merged: ProviderConnections = {};

  for (const id of new Set([...Object.keys(cloud), ...Object.keys(local)])) {
    const remote = cloud[id] ?? {};
    const mine = local[id] ?? {};

    // Per veld, niet per provider. Een spread op providerniveau gooit elk veld
    // weg dat dit apparaat niet toevallig ook heeft -- baseUrl en models
    // verdwenen zo net zo stil als de sleutels.
    const conn: ProviderConn = { ...remote, ...mine };

    // Onwetendheid is geen wisopdracht.
    if (remote.key && mine.key === undefined) conn.key = remote.key;

    merged[id] = conn;
  }

  return merged;
}
