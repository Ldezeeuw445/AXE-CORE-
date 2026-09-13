import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * De galerij-demo is geen belofte: de echte Code Editor moet dezelfde
 * indeling hebben, anders bouwt Luka een maquette die in de app niet bestaat.
 *
 * Deze test leest de bron, niet een screenshot. Hij faalt als de terminal of
 * de agent terug in een PlaatSlot naast de composer belandt, of als de drie
 * standen uit de pagina verdwijnen.
 */
const pagina = readFileSync(new URL('../presentation/pages/CodeEditorPage.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../design/code-studio.css', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../presentation/components/layout/PlaatChat.tsx', import.meta.url), 'utf8');

describe('code studio staat in de echte tab, niet alleen in de galerij', () => {
  it('gebruikt geen PlaatPanel voor terminal of agent', () => {
    expect(pagina).not.toMatch(/<PlaatPanel/);
  });

  it('heeft de drie standen Code / Canvas / Preview', () => {
    expect(pagina).toMatch(/data-stand=\{studioStand\}/);
    expect(pagina).toMatch(/setStudioStand\('code'\)/);
    expect(pagina).toMatch(/setStudioStand\('canvas'\)/);
    expect(pagina).toMatch(/setStudioStand\('preview'\)/);
  });

  it('zet de terminal onder de editor, opvouwbaar', () => {
    expect(pagina).toMatch(/axe-studio-term/);
    expect(css).toMatch(/\.axe-studio-term\s*\{/);
    expect(css).toMatch(/data-term='uit'[\s\S]*28px/);
    expect(css).toMatch(/\.axe-studio-editor[\s\S]*148px/);
  });

  it('kiest de motor in de zuil rechts van de composer, en vraagt via de composer', () => {
    // De balk bovenin is weg (13 sep): de motoren staan naast de composer, zoals
    // de tabs op trading. Vragen gaat via de composer zelf -- en ⌘K blijft.
    expect(pagina).toMatch(/\['native', 'openhands', \.\.\.CLI_MOTOR_KNOPPEN/);
    expect(pagina).toMatch(/kies=\{id => setAgentEngine\(id as AgentEngine\)\} kant="rechts"/);
    expect(pagina).toMatch(/focusComposer/);
  });

  it('stuurt de AXE-composer op deze tab naar de code-agent', () => {
    expect(chat).toMatch(/code-editor/);
    expect(chat).toMatch(/designAgentBridge\.send/);
  });
});
