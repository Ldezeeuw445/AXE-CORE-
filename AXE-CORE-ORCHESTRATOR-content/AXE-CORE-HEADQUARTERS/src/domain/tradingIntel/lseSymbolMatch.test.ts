import { describe, it, expect } from 'vitest';
import { zoekLseSymbool } from '@/domain/tradingIntel/lseSymbolMatch';

/** Uit de echte catalogus, opgehaald 10 september 2026. */
const CATALOGUS = [
  { dataset: 'commodity', symbol: 'XAU/USD', name: 'Gold' },
  { dataset: 'commodity', symbol: 'XAG/USD', name: 'Silver' },
  { dataset: 'fx', symbol: 'EUR/USD' },
  { dataset: 'fx', symbol: 'GBP/USD' },
  { dataset: 'index', symbol: 'NAS100/USD' },
  { dataset: 'index', symbol: 'US30/USD' },
  { dataset: 'index', symbol: 'UK100/GBP' },
  { dataset: 'index', symbol: 'DE30/EUR' },
  { dataset: 'crypto', symbol: 'BTC/USD' },
  { dataset: 'options', symbol: 'SPY', name: 'SPY options' },
  { dataset: 'stocks', symbol: 'SPY', name: 'SPDR S&P 500' },
];

/**
 * Dezelfde regels plus een regel onder een aliasnaam. Bewust gescheiden van
 * CATALOGUS hierboven: welke naam LSE voor de S&P werkelijk voert is van buiten
 * hun catalogus niet te controleren, dus die aanname hoort niet in de fixture
 * die "uit de echte catalogus" heet. Wat hier getest wordt is het mechanisme —
 * staat het instrument onder een naam die de registry kent, dan wordt het
 * gevonden — niet dat die naam SPX is.
 */
const MET_ALIAS = [
  ...CATALOGUS,
  { dataset: 'index', symbol: 'SPX/USD', name: 'S&P 500 Index' },
];

describe('AXE-symbool naar LSE', () => {
  it('vindt goud, dat anders heet en anders geschreven wordt', () => {
    expect(zoekLseSymbool('XAUUSD', CATALOGUS)).toEqual({ dataset: 'commodity', symbol: 'XAU/USD' });
  });

  it('vindt een valutapaar', () => {
    expect(zoekLseSymbool('EURUSD', CATALOGUS)).toEqual({ dataset: 'fx', symbol: 'EUR/USD' });
  });

  it('vindt een index, die bij LSE een munt achtervoegt', () => {
    // AXE zegt NAS100, LSE zegt NAS100/USD. Zonder de tweede ronde op het deel
    // voor de schuine streep vindt hij niets.
    expect(zoekLseSymbool('NAS100', CATALOGUS)).toEqual({ dataset: 'index', symbol: 'NAS100/USD' });
    expect(zoekLseSymbool('US30', CATALOGUS)).toEqual({ dataset: 'index', symbol: 'US30/USD' });
    expect(zoekLseSymbool('UK100', CATALOGUS)).toEqual({ dataset: 'index', symbol: 'UK100/GBP' });
  });

  it('kiest de koersdataset boven de optiedataset', () => {
    // SPY staat twee keer. Voor een koersgrafiek wil je het aandeel.
    expect(zoekLseSymbool('SPY', CATALOGUS)?.dataset).toBe('stocks');
  });

  it('vindt een instrument onder een naam uit de registry', () => {
    // US500 staat nergens in de catalogus. De registry weet dat de desk dat
    // instrument ook SP500/SPX500/SPX noemt, dus wordt de catalogus daar
    // opnieuw op bevraagd. Gemeten op 10 september viel US500 zonder deze
    // ronde uit de correlatiematrix — lege kolom, geen uitleg.
    expect(zoekLseSymbool('US500', MET_ALIAS)).toEqual({ dataset: 'index', symbol: 'SPX/USD' });
  });

  it('vindt hetzelfde instrument ook als er een alias binnenkomt', () => {
    // Niet elke aanroeper stuurt de canonieke id. SPX500 is geen catalogusnaam
    // maar wel dezelfde registry-regel, dus komt hij op hetzelfde uit.
    expect(zoekLseSymbool('SPX500', MET_ALIAS)).toEqual({ dataset: 'index', symbol: 'SPX/USD' });
  });

  it('laat de catalogus voorgaan op de registry', () => {
    // Staat de naam zelf in de catalogus, dan wordt er geen alias geprobeerd.
    // Anders zou een registry-regel een instrument kunnen overrulen dat LSE
    // gewoon onder de gevraagde naam voert.
    const eigen = [...MET_ALIAS, { dataset: 'index', symbol: 'US500/USD' }];
    expect(zoekLseSymbool('US500', eigen)).toEqual({ dataset: 'index', symbol: 'US500/USD' });
  });

  it('raadt GEEN hernoemingen', () => {
    // GER40 staat in de registry, maar geen van zijn aliassen (DE40, DAX40,
    // DAX, GER30) is DE30 — en dat is wat deze catalogus voert. Dus null, geen
    // "lijkt er genoeg op". Een gok die er plausibel uitziet geeft een grafiek
    // van het verkeerde instrument, en dat zie je niet aan de vorm.
    expect(zoekLseSymbool('GER40', CATALOGUS)).toBeNull();
  });

  it('geeft niets terug voor een naam die de registry niet kent', () => {
    expect(zoekLseSymbool('NAS100', CATALOGUS)).not.toBeNull();
    expect(zoekLseSymbool('QQQ3X', CATALOGUS)).toBeNull();
  });

  it('geeft niets terug voor wat er niet is', () => {
    expect(zoekLseSymbool('ZZZZ', CATALOGUS)).toBeNull();
    expect(zoekLseSymbool('', CATALOGUS)).toBeNull();
  });
});
