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
 * ## Hernoemingen komen uit de registry, niet uit een gok
 *
 * Vorm-regels lossen `XAUUSD` en `NAS100` op, maar niet een ander wóórd. Gemeten
 * op 10 september viel `US500` daardoor uit de correlatiematrix: geen enkele
 * catalogusregel plat naar `US500`, dus een lege kolom en geen aanwijzing
 * waarom. Wat LSE er wél voor voert is van hieruit niet te controleren — het
 * antwoord staat in hun catalogus, niet in dit bestand.
 *
 * Daarom vraagt deze functie het de catalogus, één keer per naam die de desk
 * voor hetzelfde instrument kent. Die namen staan al in `pairRegistry`: US500
 * draagt SP500/SPX500/S&P500/SPX, GER40 draagt DE40/DAX40/DAX/GER30. Dat is de
 * "one vocabulary" waar metaApiSymbolResolver naar verwijst, en dit bestand was
 * er de tweede private kopie naast. De aliasronde loopt ná de eigen ronden, dus
 * de catalogus blijft leidend en de registry vult alleen in wat vorm niet kan.
 *
 * Nog steeds geen gokken: een naam die noch in de catalogus noch in de registry
 * staat levert null. Een treffer die er plausibel uitziet geeft straks een
 * grafiek van het verkeerde instrument, en dat zie je niet aan de vorm.
 */

import { pairSpec } from '@/domain/tradingIntel/pairRegistry';

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

function zoekOpNaam(
  doel: string,
  catalogus: readonly LseCatalogusRegel[],
): LseCatalogusRegel[] {
  return catalogus.filter(r => {
    const vol = plat(r.symbol);
    if (vol === doel) return true;
    const basis = plat(r.symbol.split('/')[0]);
    return basis === doel;
  });
}

export function zoekLseSymbool(
  symbool: string,
  catalogus: readonly LseCatalogusRegel[],
): LseTreffer | null {
  const doel = plat(symbool);
  if (!doel) return null;

  let treffers = zoekOpNaam(doel, catalogus);

  if (!treffers.length) {
    // De registry kent de namen die vorm niet oplost. De canonieke id ook
    // proberen, want er kan een alias binnenkomen in plaats van een id.
    const spec = pairSpec(symbool);
    if (spec) {
      for (const naam of [spec.id, ...spec.aliases]) {
        const alt = plat(naam);
        if (alt === doel) continue;
        treffers = zoekOpNaam(alt, catalogus);
        if (treffers.length) break;
      }
    }
  }

  if (!treffers.length) return null;

  const rang = (ds: string) => {
    const i = VOORKEUR.indexOf(ds);
    return i === -1 ? VOORKEUR.length : i;
  };
  /* Bij gelijke rang wint de VOLLEDIGE naamtreffer: `US30` moet `US30/USD`
     vinden en niet een aandeel dat toevallig zo heet. Vergeleken met de naam
     die de treffers opleverde — na een aliasronde is dat niet meer `doel`. */
  const gevonden = plat(treffers[0].symbol.split('/')[0]);
  const beste = [...treffers].sort((a, b) => {
    const r = rang(a.dataset) - rang(b.dataset);
    if (r !== 0) return r;
    return (plat(b.symbol) === gevonden ? 1 : 0) - (plat(a.symbol) === gevonden ? 1 : 0);
  })[0];

  return { dataset: beste.dataset, symbol: beste.symbol };
}
