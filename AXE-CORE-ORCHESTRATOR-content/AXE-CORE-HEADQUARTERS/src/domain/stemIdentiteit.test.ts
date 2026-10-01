/**
 * Eén stem, één naam.
 *
 * Deze tests beschreven tot 1 okt 2026 het ontwerp van vóór 29 september:
 * George via een lokale Kokoro-dienst, met Cedar als terugval. Dat is bewust
 * vervangen door één centrale Marin-stem (`27d95ce1`, `393c88ce`, `01bc6eee`)
 * en de tests zijn toen niet meegegaan -- elf rode tests die het verkeerde
 * ontwerp bewaakten.
 *
 * Wat hieronder staat bewaakt wat er nu geldt, plus de twee dingen die bij
 * die omzetting zijn kwijtgeraakt: de controle dat de server dezelfde stem
 * noemt, en het feit dat de naam op precies één plek hoort te staan.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { AXE_STEM_ID, AXE_STEM_NAAM, STEM_UI, stemStandVanHealth } from './stemIdentiteit';

const ROOT = join(__dirname, '..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Zonder commentaar: uitleggen waaróm de oude naam weg is, is geen terugval. */
const code = (rel: string) =>
  bron(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('de naam staat op één plek', () => {
  it('Marin, en de UI-teksten bouwen zichzelf daaruit op', () => {
    expect(AXE_STEM_NAAM).toBe('Marin');
    expect(AXE_STEM_ID).toBe('marin');
    expect(STEM_UI.uitleg).toContain(AXE_STEM_NAAM);
    expect(STEM_UI.label).toContain(AXE_STEM_NAAM);
    expect(STEM_UI.volledigeNaam).toContain(AXE_STEM_NAAM);
  });

  /* De schermen herhaalden de naam als letterlijke tekst: Settings had
     'AXE Voice · Marin' en 'Central TTS · same Marin' hardgecodeerd staan.
     Verander je de stem, dan verandert het scherm niet mee. */
  it('geen enkel scherm typt de naam zelf nog in', () => {
    for (const bestand of [
      'presentation/pages/SettingsPage.tsx',
      'presentation/components/layout/Sidebar.tsx',
    ]) {
      expect(code(bestand), bestand).not.toMatch(/['"`][^'"`]*\bMarin\b/);
    }
  });

  /* George en de Kokoro-dienst waren de oude stem. Zolang die namen nog in de
     sprekende code staan, is er geen één stem maar twee. */
  it('de oude stemnamen staan niet meer in de code die spreekt', () => {
    for (const bestand of [
      'infrastructure/gateways/globalTts.ts',
      'infrastructure/gateways/openAiTtsService.ts',
      'domain/stemIdentiteit.ts',
    ]) {
      expect(code(bestand), bestand).not.toMatch(/bm_george/i);
    }
  });
});

describe('stemStandVanHealth', () => {
  it('online en de juiste stem is groen', () => {
    expect(stemStandVanHealth({ online: true, voice: AXE_STEM_ID }))
      .toEqual({ ok: true, regel: STEM_UI.live, watNu: null });
  });

  it('offline is rood, met de reden van de server erbij', () => {
    const s = stemStandVanHealth({ online: false, reason: 'not_configured' });
    expect(s.ok).toBe(false);
    expect(s.watNu).toContain('not_configured');
  });

  it('een losse fout komt er ook doorheen in plaats van stil te blijven', () => {
    expect(stemStandVanHealth(null, 'ECONNREFUSED').watNu).toContain('ECONNREFUSED');
  });

  /* Dit is de klep die op 29 september sneuvelde: `verkeerdeStemRegel` en de
     controle erop verdwenen samen met de oude terugval, waardoor élke stem
     die de server noemde groen werd. AXE wisselt niet ongemerkt van stem. */
  it('een ándere stem van de server is rood, met de naam erbij', () => {
    const s = stemStandVanHealth({ online: true, voice: 'af_sarah' });
    expect(s.ok).toBe(false);
    expect(s.watNu).toContain('af_sarah');
    expect(s.watNu).toContain(AXE_STEM_NAAM);
  });
});
