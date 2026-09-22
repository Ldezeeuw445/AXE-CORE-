import { describe, it, expect, vi, beforeEach } from 'vitest';

const balken = vi.fn();
const schrijf = vi.fn();

vi.mock('@/infrastructure/gateways/lseMarketData', () => ({
  lseBalken: (...a: unknown[]) => balken(...a),
}));
vi.mock('@/infrastructure/persistence/deskFeitenService', () => ({
  schrijfDeskFeit: (...a: unknown[]) => schrijf(...a),
}));
const komend = vi.fn();
const verleden = vi.fn();
const historie = vi.fn();
vi.mock('@/infrastructure/gateways/researchSources', () => ({
  fetchEconomicReleases: () => komend(),
  fetchPastReleases: () => verleden(),
}));
vi.mock('@/application/tradingIntel/historyService', () => ({
  getHistory: (...a: unknown[]) => historie(...a),
}));

const { draaiDeskHartslag, draaiImpactMeting, __resetHartslag, HARTSLAG_INTERVAL_MS } =
  await import('@/application/tradingIntel/deskHartslag');

const UUR = 3_600_000;

/** Genoeg balken op een gedeeld raster om boven MIN_OVERLAP uit te komen. */
function reeks(n = 60, fn: (i: number) => number = (i) => 100 + Math.sin(i)) {
  return Array.from({ length: n }, (_, i) => {
    const c = fn(i);
    return { t: i * UUR, o: c, h: c, l: c, c, v: 0 };
  });
}

beforeEach(() => {
  balken.mockReset();
  schrijf.mockReset();
  __resetHartslag();
  schrijf.mockResolvedValue(true);
});

describe('de bureauhartslag', () => {
  it('haalt de paren serieel op en schrijft één correlatiefeit weg', async () => {
    balken.mockImplementation((sym: string) =>
      Promise.resolve(reeks(60, (i) => 100 + Math.sin(i + sym.length))));

    const uit = await draaiDeskHartslag();

    expect(uit.gedaan).toBe(true);
    expect(balken).toHaveBeenCalledTimes(8);
    expect(schrijf).toHaveBeenCalledTimes(1);

    const feit = schrijf.mock.calls[0][0];
    expect(feit.soort).toBe('correlatie');
    expect(feit.sleutel).toBe('H1');
    expect(feit.agentTekst).toContain('CORRELATIE');
  });

  it('schrijft niets weg als er te weinig reeksen zijn', async () => {
    // Drie paren met data, vijf zonder. Een matrix over drie paren die als "de
    // correlatie van het bureau" de agents in gaat is smaller dan hij lijkt.
    let n = 0;
    balken.mockImplementation(() => Promise.resolve(n++ < 3 ? reeks() : null));

    const uit = await draaiDeskHartslag();

    expect(uit.gedaan).toBe(false);
    expect(uit.reden).toContain('3');
    expect(schrijf).not.toHaveBeenCalled();
  });

  it('noemt ontbrekende paren als onbekend, niet als ongecorreleerd', async () => {
    balken.mockImplementation((sym: string) =>
      Promise.resolve(sym === 'US500' ? null : reeks(60, (i) => 100 + Math.sin(i + sym.length))));

    await draaiDeskHartslag();

    const tekst = schrijf.mock.calls[0][0].agentTekst as string;
    expect(tekst).toContain('US500');
    expect(tekst).toContain('onbekend, niet ongecorreleerd');
  });

  it('meet niet opnieuw binnen het interval', async () => {
    balken.mockImplementation(() => Promise.resolve(reeks()));
    await draaiDeskHartslag();
    balken.mockClear();

    const tweede = await draaiDeskHartslag();
    expect(tweede.gedaan).toBe(false);
    expect(balken).not.toHaveBeenCalled();
  });

  it('meet wél opnieuw als erom gevraagd wordt', async () => {
    balken.mockImplementation(() => Promise.resolve(reeks()));
    await draaiDeskHartslag();
    balken.mockClear();

    await draaiDeskHartslag(true);
    expect(balken).toHaveBeenCalledTimes(8);
  });

  it('wacht geen twee uur na een mislukte schrijving', async () => {
    // Anders kost één storing in Supabase je twee uur aan verse feiten, en
    // zeggen de agents ondertussen "niets gemeten".
    balken.mockImplementation(() => Promise.resolve(reeks()));
    schrijf.mockResolvedValue(false);
    await draaiDeskHartslag();
    balken.mockClear();

    schrijf.mockResolvedValue(true);
    const tweede = await draaiDeskHartslag();
    expect(tweede.gedaan).toBe(true);
    expect(balken).toHaveBeenCalledTimes(8);
  });

  it('het interval is twee uur, niet korter dan het quotum toelaat', () => {
    // Acht aanroepen per meting bij tien per uur: korter zetten zet de
    // Correlatie-tab droog.
    expect(HARTSLAG_INTERVAL_MS).toBeGreaterThanOrEqual(2 * UUR);
  });
});

describe('de impactmeting in de hartslag', () => {
  // Maandag 5 oktober 2026, 12:00 UTC. CPI komt over twee dagen.
  const NU = Date.parse('2026-10-05T12:00:00Z');
  const CPI = ['2026-09-11', '2026-08-12', '2026-07-15', '2026-06-10'];

  /** M15-bars rond 12:30 UTC (08:30 New York) op elke CPI-dag: +0,5% erna. */
  function m15Rond(dagen: string[]) {
    const uit: { time: string; open: number; high: number; low: number; close: number }[] = [];
    for (const d of dagen) {
      const start = Date.parse(`${d}T11:00:00Z`);
      for (let i = 0; i < 12; i++) {
        const t = start + i * 15 * 60_000;
        const c = t >= Date.parse(`${d}T12:30:00Z`) ? 100.5 : 100;
        uit.push({ time: new Date(t).toISOString(), open: c, high: c, low: c, close: c });
      }
    }
    return uit;
  }

  beforeEach(() => {
    komend.mockReset(); verleden.mockReset(); historie.mockReset();
    komend.mockResolvedValue([{ date: '2026-10-07', name: 'Consumer Price Index' }, { date: '2026-11-20', name: 'Gross Domestic Product' }]);
    verleden.mockResolvedValue(CPI.map(date => ({ date, name: 'Consumer Price Index' })));
    historie.mockResolvedValue({ ok: true, candles: m15Rond(CPI) });
  });

  it('meet alleen releases die eraan komen, op USD-paren, uit de MetaAPI-cache', async () => {
    const uit = await draaiImpactMeting(NU);

    expect(balken).not.toHaveBeenCalled(); // geen LSE-quotum
    expect(uit.gemeten).toHaveLength(4); // quotum per slag
    expect(uit.gemeten.every(k => k.startsWith('Consumer Price Index|'))).toBe(true);
    const req = historie.mock.calls[0][0];
    expect(req.timeframe).toBe('m15');
    expect(req.provider).toBe('metaapi');

    const feit = schrijf.mock.calls[0][0];
    expect(feit.soort).toBe('gebeurtenis_impact');
    expect(feit.sleutel).toBe('Consumer Price Index|XAUUSD|60');
    expect(feit.agentTekst).toContain('volgende publicatie 2026-10-07');
    expect(feit.agentTekst).toContain('4 van de 4 keer omhoog');
  });

  it('draait de beurtrol door en meet niets twee keer binnen twintig uur', async () => {
    await draaiImpactMeting(NU);
    const tweede = await draaiImpactMeting(NU + 60_000);
    // Acht paren, US500 heeft geen valuta-split: zeven USD-paren, dus drie over.
    expect(tweede.gemeten).toHaveLength(3);
    const derde = await draaiImpactMeting(NU + 120_000);
    expect(derde.gemeten).toHaveLength(0);
    expect(derde.reden).toBe('alles recent gemeten');
  });

  it('schrijft niets zonder kalender en zegt waarom', async () => {
    verleden.mockResolvedValue([]);
    const uit = await draaiImpactMeting(NU);
    expect(uit.gemeten).toHaveLength(0);
    expect(uit.reden).toContain('kalender');
    expect(schrijf).not.toHaveBeenCalled();
  });

  it('slaat een paar zonder historie over in plaats van een lege meting te schrijven', async () => {
    historie.mockResolvedValue({ ok: false, error: 'No metaapi history' });
    const uit = await draaiImpactMeting(NU);
    expect(uit.gemeten).toHaveLength(0);
    expect(uit.overgeslagen[0]).toContain('No metaapi history');
    expect(schrijf).not.toHaveBeenCalled();
  });
});
