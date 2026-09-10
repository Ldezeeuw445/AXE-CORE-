import { describe, it, expect, vi, beforeEach } from 'vitest';

const balken = vi.fn();
const schrijf = vi.fn();

vi.mock('@/infrastructure/gateways/lseMarketData', () => ({
  lseBalken: (...a: unknown[]) => balken(...a),
}));
vi.mock('@/infrastructure/persistence/deskFeitenService', () => ({
  schrijfDeskFeit: (...a: unknown[]) => schrijf(...a),
}));

const { draaiDeskHartslag, __resetHartslag, HARTSLAG_INTERVAL_MS } =
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
