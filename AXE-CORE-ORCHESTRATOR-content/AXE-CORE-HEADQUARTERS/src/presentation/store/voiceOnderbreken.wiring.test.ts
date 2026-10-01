/**
 * Erdoorheen kunnen praten is bedrading, geen functie.
 *
 * `RealtimeVoiceSession.interrupt()` bestond al en had nul aanroepers; Escape
 * hing altijd het hele gesprek op. Dat is precies het soort gat dat een groene
 * unit-test niet ziet -- de functie wérkte, er riep alleen niemand hem aan.
 * Daarom leest dit de bron: wordt hij aangeroepen, en in welke volgorde.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('onderbreken is aangesloten', () => {
  const installer = () => bron('presentation/store/installOpenAIRealtimeVoice.ts');

  it('Escape legt hem eerst stil, en hangt pas daarna op', () => {
    const tekst = installer();
    const esc = tekst.indexOf("e.key !== 'Escape'");
    expect(esc).toBeGreaterThan(0);
    const staart = tekst.slice(esc, esc + 1200);
    const stil = staart.indexOf('session.interrupt()');
    const ophangen = staart.indexOf('stopListening()');
    expect(stil).toBeGreaterThan(0);
    expect(ophangen).toBeGreaterThan(stil);
  });

  it('de sneltoets doet hetzelfde onderscheid', () => {
    const tekst = installer();
    const sneltoets = tekst.indexOf('SNELTOETS_EVENT');
    expect(tekst.slice(sneltoets).indexOf('session.interrupt()')).toBeGreaterThan(0);
  });

  /* `responseActive` stond in de installer-closure terwijl de sneltoetsen
     daarbuiten leven -- Escape kon dus niet eens zien of AXE praatte. */
  it('de installer weet op modulebereik of AXE praat', () => {
    expect(installer()).toMatch(/^let responseActive = false;$/m);
  });

  /* `audioEl.pause()` zonder bijbehorende `play()` maakte onderbreken
     eenrichtingsverkeer: daarna bleef AXE de rest van het gesprek stil. */
  it('onderbreken dempt de sessie niet permanent', () => {
    const gateway = bron('infrastructure/gateways/openAiRealtimeVoice.ts');
    const i = gateway.indexOf('interrupt: () => {');
    expect(i).toBeGreaterThan(0);
    const body = gateway.slice(i, gateway.indexOf('},', i));
    expect(body).not.toMatch(/audioEl\.pause\(\)/);
    expect(body).toMatch(/response\.cancel/);
    // Zonder truncate denkt het model dat je zijn hele antwoord hoorde.
    expect(body).toMatch(/conversation\.item\.truncate/);
  });

  /* De rij waar job-spraak in parkeert als jij of AXE aan het woord is. Hij
     had zijn enige afvoer in de Whisper-lus, en die is weg. */
  it('gewachte job-spraak wordt alsnog uitgesproken', () => {
    expect(bron('presentation/store/installTierRouter.ts')).toMatch(/flushAxeSpraakRij\(\)/);
  });
});
