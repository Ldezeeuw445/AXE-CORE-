import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('Home-podium is aangesloten op echte bronnen (25 nov)', () => {
  it('SphereStage leest projectie, chat en agenttelling, geen Math.random', () => {
    const stage = bron('SphereStage.tsx');
    expect(stage).toContain('podiumKaartenVan');
    expect(stage).toContain('antwoordIsHuidig');
    expect(stage).toContain('streamVanDezeBeurt');
    expect(stage).toContain('axe-podium-kaart-beweging');
    expect(stage).toContain('useSphereProjectionStore');
    expect(stage).toContain('useVoiceStore');
    expect(stage).toContain('agenten');
    expect(stage).toContain('goedkeuringen');
    expect(stage).toContain('podiumKrachtVan');
    expect(stage).toContain("podiumDemoAan(demoVlag(), import.meta.env.DEV)");
    expect(stage).not.toMatch(/Math\.random/);
    expect(stage).toContain('data-axe-podium');
    expect(stage).toContain('MarkdownMessage');
    expect(stage).toContain('ProjectionBody');
  });

  it('Home zet de bol in het midden van het kern-gat en geeft de live telling door', () => {
    const home = bron('../../../pages/Home.tsx');
    expect(home).toContain('<AxeCoreSphere midden />');
    expect(home).toContain('agenten={live.werkend}');
    expect(home).toContain('goedkeuringen={live.goedkeuringen.length}');
  });

  it('HomeStage toont hetzelfde podium, niet een losse bol', () => {
    const stage = bron('../../../pages/HomeStage.tsx');
    expect(stage).toContain('SphereStage');
    expect(stage).toContain('<AxeCoreSphere midden />');
  });

  it('compacte kaarten hebben een hoogte, anders is DocumentProjection een lege rand', () => {
    const css = bron('axePodium.css');
    expect(css).toMatch(/\.axe-podium-kaart--compact \{[^}]*min-height: 9\.5rem/);
    expect(css).toMatch(/\.axe-podium-kaart-beweging \{[^}]*width: 100%/);
    expect(css).toMatch(/\.axe-podium-kaart-beweging \{[^}]*height: 100%/);
  });

  it('AxeCoreSphere midden is 0.5; telefoon en zwever blijven 0.36', () => {
    const bol = bron('AxeCoreSphere.tsx');
    expect(bol).toContain('const BOL_HOOGTE = 0.36');
    expect(bol).toContain('const BOL_MIDDEN = 0.5');
    expect(bol).toContain('hoogteRef.current = telefoon ? BOL_HOOGTE : midden ? BOL_MIDDEN : BOL_HOOGTE');
  });

  it('grafiek zonder series verzint geen weekdagen', () => {
    const chart = bron('projections/ChartProjection.tsx');
    expect(chart).not.toContain("label: 'Mon'");
    expect(chart).toContain('No series in this projection.');
    expect(chart).toContain('return [];');
  });

  it('chartResolver verzint geen BTC-sample als de feed uitblijft', () => {
    const resolver = bron('../../../../application/sphere/projectionResolvers/chartResolver.ts');
    expect(resolver).not.toContain('64200');
    expect(resolver).toContain("source: 'empty'");
    expect(resolver).toContain('No live series');
  });
});

describe('3D-vak in rust (26 nov, fase 1+2)', () => {
  it('leest de aandachtstegels uit het dashboard, geen eigen fetch', () => {
    const stage = bron('SphereStage.tsx');
    expect(stage).toContain('usePodiumAandacht');
    expect(stage).toContain('zichtbareTegels');
    expect(stage).toContain('antwoordBlijft');
    expect(stage).not.toMatch(/\bfetch\(|usePoll\(/);
  });

  it('openId bestaat voordat iets hem leest (anders crasht Home: TDZ, tsc ziet het niet)', () => {
    const stage = bron('SphereStage.tsx');
    const def = stage.indexOf('const [openId, setOpenId]');
    expect(def).toBeGreaterThan(0);
    const eersteGebruik = stage.search(/[^[]\bopenId\b(?!, setOpenId)/);
    expect(eersteGebruik).toBeGreaterThan(def);
  });
});
