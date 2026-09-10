/**
 * Van AXE's symboolnaam naar die van LSE.
 *
 * AXE noemt goud `XAUUSD`, LSE noemt het `XAU/USD` in de dataset `commodity`.
 * Voor indices verschilt zelfs de vorm: `NAS100` hier, `NAS100/USD` daar.
 *
 * ## Waarom uit de catalogus en niet uit een tabel
 *
 * Een handgeschreven tabel is een tweede waarheid die stilletjes veroudert.
 * LSE's catalogus noemt 22.700 instrumenten en zegt zelf in welke dataset ze
 * zitten — en die dataset moet mee in de aanvraag. Zoeken in wat er ís kan niet
 * verouderen.
 *
 * ## Wat het NIET doet: hernoemingen raden
 *
 * `GER40` heet bij LSE `DE30/EUR`. Dat is geen patroon maar een andere naam, en
 * die kan deze functie niet kennen. Dan geeft hij niets terug, en dat is het
 * eerlijke antwoord — een gok die er plausibel uitziet levert straks een
 * grafiek van het verkeerde instrument, en dat zie je niet aan de vorm.
 */

export interface LseCatalogusRegel {
  dataset: string;
  symbol: string;
  name?: string;
}

export interface LseTreffer {
  dataset: string;
  symbol: string;
}

function plat(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Zoek `symbool` in de catalogus.
 *
 * Eerst de hele naam plat vergeleken (`XAUUSD` ↔ `XAU/USD`), dan het deel vóór
 * de schuine streep (`NAS100` ↔ `NAS100/USD`). Die tweede ronde is nodig omdat
 * LSE indices altijd een munt achtervoegt en AXE ze zonder noemt.
 *
 * Datasets met een voorkeur, want één naam kan meermaals voorkomen: `SPY` staat
 * zowel bij `options` als bij `stocks`, en voor een koersgrafiek wil je de
 * tweede. Prijsdatasets eerst, afgeleiden achteraan.
 */
const VOORKEUR = ['fx', 'commodity', 'index', 'crypto', 'stocks', 'etf', 'futures', 'bonds'];

export function zoekLseSymbool(
  symbool: string,
  catalogus: readonly LseCatalogusRegel[],
): LseTreffer | null {
  const doel = plat(symbool);
  if (!doel) return null;

  const treffers = catalogus.filter(r => {
    const vol = plat(r.symbol);
    if (vol === doel) return true;
    const basis = plat(r.symbol.split('/')[0]);
    return basis === doel;
  });
  if (!treffers.length) return null;

  const rang = (ds: string) => {
    const i = VOORKEUR.indexOf(ds);
    return i === -1 ? VOORKEUR.length : i;
  };
  /* Bij gelijke rang wint de VOLLEDIGE naamtreffer: `US30` moet `US30/USD`
     vinden en niet een aandeel dat toevallig zo heet. */
  const beste = [...treffers].sort((a, b) => {
    const r = rang(a.dataset) - rang(b.dataset);
    if (r !== 0) return r;
    return (plat(b.symbol) === doel ? 1 : 0) - (plat(a.symbol) === doel ? 1 : 0);
  })[0];

  return { dataset: beste.dataset, symbol: beste.symbol };
}
