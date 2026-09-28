/**
 * providerKoeling — onthouden dat een gratis tegoed op is, zodat de rest blijft werken.
 *
 * ## De meting
 *
 * Groq is overal de eerste keuze, en nergens de enige. `resolveWhisperConfig()`
 * (whisperService.ts) kiest Groq zodra er een sleutel is en pakt OpenAI pas als
 * die sleutel ontbreekt — niet als Groq weigert. `snelSlot()`
 * (presentation/store/installTierRouter.ts) doet hetzelfde voor tier 2 én voor
 * de klassificeerder: `getProviderKeySlot('groq')` vóór Cerebras en Google.
 *
 * Wat er dan gebeurt als het dagtegoed op is: `transcribeAudio` werpt op een
 * 429 en niemand onthoudt dat. De lus doet één beurt via Web Speech en vraagt
 * bij de vólgende zin gewoon weer Groq. Dat blijft de hele dag zo, want er is
 * geen enkele plek waar "Groq zei nee" langer leeft dan die ene beurt. Tier 2
 * en de klassificeerder vallen intussen elke beurt terug op het trage oude pad.
 *
 * Er is dus een sleutel, er is een alternatief, en toch werkt het niet — omdat
 * een weigering nergens blijft staan.
 *
 * ## Waarom dit een eigen module is, en wat hij níet doet
 *
 * Hij doet geen netwerk en kent geen enkele provider bij naam. Hij krijgt een
 * status, een body en de headers van een antwoord dat iemand anders al heeft
 * opgehaald, en beantwoordt twee vragen: "is dit een limiet, en tot wanneer?"
 * en "koelt deze naam nog?". Daardoor kunnen whisperService, snelSlot en de
 * klassificeerder er alle drie op leunen zonder elkaar te kennen, en is het
 * hele ding te testen zonder één fetch.
 *
 * ## Waarom localStorage en niet het geheugen
 *
 * Een dagtegoed loopt over het herstarten van de app heen. Stond de stand in
 * het geheugen, dan zou elke herstart — en dat is bij Tauri elke keer dat de
 * app opengaat — meteen weer tegen dezelfde limiet aan lopen, precies op de
 * dag dat dit iets waard is. Vergelijk llmGateway.ts, dat de abonnements-
 * koeling om dezelfde reden in localStorage zet.
 *
 * ## Waarom de klok een parameter is
 *
 * Een koeling tot middernacht is niet te testen door te wachten. Elke functie
 * die tijd nodig heeft krijgt hem als laatste, optionele parameter; de app
 * roept ze gewoon zonder aan, de test stuurt de klok.
 */

/** Waar de stand staat. Eén sleutel, één object: {provider: tijdstempel}. */
export const KOELING_SLEUTEL = 'axe-provider-koeling';

/**
 * Waar de koppen vandaan mogen komen.
 *
 * `Headers` van een echte fetch, maar ook het kale object dat een test of een
 * doorgeefluik aanlevert — anders zou elke aanroeper eerst een Headers moeten
 * bouwen om deze module iets te kunnen vragen.
 */
export type KoppenBron =
  | Headers
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

/** Hoe lang er niet meer gevraagd wordt: een duur in ms, of tot middernacht UTC. */
export type KoelDuur = number | 'dag';

type Stand = Record<string, number>;

/**
 * Alleen de noodoplossing.
 *
 * In de privémodus, en in een testomgeving zonder DOM, bestaat localStorage
 * niet of weigert hij. Dan is een koeling die alleen deze sessie meegaat nog
 * altijd oneindig veel beter dan geen koeling — maar zodra localStorage er wél
 * is, is díe de enige waarheid, zodat twee vensters niet uit elkaar lopen.
 */
let geheugen: Stand = {};

function opslag(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null; // privémodus werpt al bij het aanraken van localStorage
  }
}

function lees(): Stand {
  const s = opslag();
  if (!s) return { ...geheugen };
  try {
    const rauw = s.getItem(KOELING_SLEUTEL);
    const g: unknown = rauw ? JSON.parse(rauw) : null;
    if (!g || typeof g !== 'object') return {};
    // De enige plek waar gekeurd wordt: hierna is elke waarde in de stand een
    // eindig getal, en hoeft niemand verderop nog te twijfelen.
    //
    // Eindig, niet zomaar een getal. Een tekst valt vanzelf af bij het
    // vergelijken (elke > wordt false), maar Infinity niet — en JSON kan dat
    // dragen, want `1e999` parseert ernaartoe. Dat is precies de waarde die
    // een provider voor altijd zou uitzetten zonder dat iets het uitlegt.
    const uit: Stand = {};
    for (const [naam, tot] of Object.entries(g as Record<string, unknown>)) {
      if (typeof tot === 'number' && Number.isFinite(tot)) uit[naam] = tot;
    }
    return uit;
  } catch {
    return { ...geheugen }; // kapotte JSON: dan maar wat we nog wisten
  }
}

function schrijf(stand: Stand): void {
  geheugen = stand;
  const s = opslag();
  if (!s) return;
  try {
    s.setItem(KOELING_SLEUTEL, JSON.stringify(stand));
  } catch {
    /* privémodus of vol: de stand leeft dan alleen deze sessie */
  }
}

/**
 * De eerstvolgende 00:00 UTC ná dit moment.
 *
 * UTC en niet lokale tijd, omdat Groq's dagvenster op UTC staat: in
 * Nederland zou lokale middernacht er in de zomer twee uur naast zitten, en
 * dat is precies de kant op waar je te vroeg weer vraagt.
 *
 * Strikt ná, nooit gelijk: een limiet die om klokslag middernacht binnenkomt
 * hoort bij het venster dat net vol zat, niet bij het venster dat opengaat.
 */
function volgendeMiddernachtUTC(nu: number): number {
  const d = new Date(nu);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

/**
 * Onthoud dat deze provider op is.
 *
 * Een bestaande koeling wordt nooit ingekort. Bij een dagtegoed dat op is
 * komen er meestal nog een paar 429's achteraan met een retry-after van een
 * paar seconden; die zouden anders de koeling tot middernacht terugzetten
 * naar "over vijf seconden weer proberen", en dan is het hele ding weg.
 */
export function markeerOp(
  provider: string,
  retryAfterMs: KoelDuur,
  nu: () => number = () => Date.now(),
): void {
  const naam = provider.trim();
  if (!naam) return;

  const moment = nu();
  const tot =
    retryAfterMs === 'dag'
      ? volgendeMiddernachtUTC(moment)
      : moment + Math.max(0, retryAfterMs);
  if (!Number.isFinite(tot)) return;

  const stand = lees();
  const eerder = stand[naam];
  schrijf({ ...stand, [naam]: typeof eerder === 'number' && eerder > tot ? eerder : tot });
}

/**
 * Tot wanneer deze provider niets oplevert, of null.
 *
 * Een verlopen koeling geeft null en geen tijdstip uit het verleden: wie dit
 * op het scherm zet, hoort niet "beschikbaar om 14:03" te lezen terwijl het
 * 15:00 is.
 */
export function koelTot(provider: string, nu: () => number = () => Date.now()): number | null {
  const tot = lees()[provider.trim()];
  return tot !== undefined && tot > nu() ? tot : null;
}

/** Koelt deze provider nu nog? */
export function isOp(provider: string, nu: () => number = () => Date.now()): boolean {
  return koelTot(provider, nu) !== null;
}

/** Vergeet de koeling — voor een nieuwe sleutel, een ander plan, of een test. */
export function wisKoeling(provider?: string): void {
  if (provider === undefined) {
    schrijf({});
    return;
  }
  const stand = lees();
  delete stand[provider.trim()];
  schrijf(stand);
}

function kop(bron: KoppenBron, naam: string): string | null {
  if (!bron) return null;
  const headers = bron as Headers;
  if (typeof headers.get === 'function') {
    try {
      return headers.get(naam);
    } catch {
      return null;
    }
  }
  const laag = naam.toLowerCase();
  for (const [k, v] of Object.entries(bron as Record<string, string | string[] | undefined>)) {
    if (k.toLowerCase() !== laag) continue;
    const waarde = Array.isArray(v) ? v[0] : v;
    return waarde ?? null;
  }
  return null;
}

/**
 * Is dit "tegoed op", en zo ja: hoe lang niet meer vragen?
 *
 * Bewust smal. Alleen een 429 telt, en alleen met bewijs erbij — een dagwoord
 * in de body, of een retry-after. Een 429 zonder allebei is meestal de limiet
 * per minuut, en die is over vóór je hem hebt opgeschreven; daar een hele
 * provider een tijd voor uitzetten kost meer dan het oplevert. En een 500 of
 * een netwerkfout is geen limiet: die koelt hier niets af, zodat een storing
 * van tien seconden niet als een dag wordt onthouden.
 *
 * De volgorde is niet willekeurig. Groq stuurt bij een dagtegoed óók een
 * retry-after mee, en die is dan de tijd tot het venster reset — maar we
 * weten uit de body zeker dat het een dag is, en de dagregel is de scherpere
 * van de twee. Dus eerst de body, dan de kop.
 */
export function herkenOp(status: number, body: string, headers?: KoppenBron): KoelDuur | null {
  if (status !== 429) return null;

  const tekst = body ?? '';
  // Groq schrijft het voluit én als afkorting: "on tokens per day (TPD)".
  // Beide vormen meenemen, maar niets breders — "per minute" hoort hier niet.
  if (/\b(tokens|requests)\s+per\s+day\b/i.test(tekst) || /\b(TPD|RPD)\b/.test(tekst)) return 'dag';

  // HTTP zegt: seconden. Groq stuurt er soms een kommagetal in ("7.66").
  // Alleen de getalvorm; de datumvorm uit de RFC komt hier niet voor en zou
  // een tweede klokbron introduceren die niets toevoegt.
  const rauw = kop(headers, 'retry-after')?.trim();
  if (rauw && /^\d+(\.\d+)?$/.test(rauw)) {
    const seconden = Number(rauw);
    if (Number.isFinite(seconden) && seconden > 0) return Math.round(seconden * 1000);
  }

  return null;
}
