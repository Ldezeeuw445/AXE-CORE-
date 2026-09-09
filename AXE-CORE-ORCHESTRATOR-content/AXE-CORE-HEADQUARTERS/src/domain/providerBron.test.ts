import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROVIDER_KEY_CATALOGUE } from './providerCatalogue';

/**
 * Instellingen en de uitschuifbalk moeten hetzelfde tonen.
 *
 * Ze deden dat niet: de balk had een eigen lijstje van vijf ids terwijl
 * Instellingen de catalogus las. Bij een verschil weet je dan niet welke van
 * de twee je moet geloven, en dat is erger dan één plek die het fout heeft.
 *
 * Deze test bewaakt de bron, niet de vorm. De balk mag er anders uitzien --
 * regels in plaats van kaarten -- zolang hij uit dezelfde lijst leest.
 */
const WIDGET = 'src/presentation/components/widgets/ModelStatusWidget.tsx';
const SETTINGS = 'src/presentation/pages/SettingsPage.tsx';

describe('één bron voor providers', () => {
  it('de uitschuifbalk leest de catalogus', () => {
    const tekst = readFileSync(WIDGET, 'utf8');
    expect(tekst).toContain('PROVIDER_KEY_CATALOGUE');
  });

  it('de uitschuifbalk verzint geen eigen providerlijst', () => {
    const tekst = readFileSync(WIDGET, 'utf8');
    // Precies de vorm die er stond: een lijst met provider-ids erin.
    expect(tekst).not.toMatch(/const MODEL_KEYS\s*=\s*\[/);
  });

  it('Instellingen leest dezelfde catalogus', () => {
    const tekst = readFileSync(SETTINGS, 'utf8');
    expect(tekst).toContain("from '@/domain/providerCatalogue'");
  });

  it('beide gebruiken dezelfde woorden voor een stand', () => {
    for (const pad of [WIDGET]) {
      expect(readFileSync(pad, 'utf8')).toContain('providerCardStand');
    }
  });

  it('de catalogus bevat wat er draait, en niet wat weg is', () => {
    const ids = PROVIDER_KEY_CATALOGUE.map(p => p.id);
    for (const nodig of ['openai', 'anthropic', 'google', 'groq', 'cerebras',
                         'hermes', 'ollama', 'openrouter', 'openrouter2']) {
      expect(ids, `${nodig} hoort erin`).toContain(nodig);
    }
    // Luka heeft deze twee expliciet weggehaald. Ze staan hier zodat niemand
    // ze "voor de volledigheid" terugzet -- dat is precies hoe ze er de eerste
    // keer in kwamen.
    expect(ids, 'smartthings is eruit gehaald').not.toContain('smartthings');
    expect(ids, 'Grok (xAI) is eruit gehaald').not.toContain('xai');
  });

  it('elke provider heeft alles wat een kaart nodig heeft', () => {
    for (const p of PROVIDER_KEY_CATALOGUE) {
      expect(p.name, p.id).toBeTruthy();
      expect(p.icon, p.id).toBeTruthy();
      expect(p.accent, p.id).toMatch(/^#|^var\(/);
      expect(typeof p.needsKey, p.id).toBe('boolean');
    }
  });
});
