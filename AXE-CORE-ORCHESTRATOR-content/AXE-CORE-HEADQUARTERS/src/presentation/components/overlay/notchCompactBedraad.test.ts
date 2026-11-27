/**
 * De compacte notch (Luka 27 nov) is ook echt aangesloten: FloatAxe kiest de
 * compacte hoogte, de notch heeft de knop en ⌘E, Opnieuw is bewaakt en de
 * voorbeelddata zit achter ontwerpmodus.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTCH_COMPACT_HOOGTE, NOTCH_HOOGTE, notchMaten } from '@/domain/overlay/notchMaten';

const dir = dirname(fileURLToPath(import.meta.url));
const lees = (p: string) => readFileSync(join(dir, p), 'utf8');
const notch = lees('AxeOverlayNotch.tsx');
const floatAxe = lees('../../pages/FloatAxe.tsx');
const ontwerp = lees('notchOntwerp.ts');
const sneltoetsen = lees('../../hooks/useKeyboardShortcuts.ts');

describe('compact open is de standaard, groot alleen op verzoek', () => {
  it('compact is de strook plus één kaart, en kleiner dan groot', () => {
    const m = notchMaten(1440, 900);
    expect(m.compactH).toBe(NOTCH_COMPACT_HOOGTE);
    expect(m.compactH).toBeGreaterThan(NOTCH_HOOGTE);
    expect(m.compactH).toBeLessThan(m.uitklapH);
  });

  it('FloatAxe zet het open venster op compact of groot', () => {
    const dock = floatAxe.slice(floatAxe.indexOf('async function dockTop'));
    expect(dock).toMatch(/open \? \(groot \? m\.uitklapH : m\.compactH\)/);
    expect(floatAxe).toContain('onGrootteChange=');
  });

  it('de notch heeft de knop, ⌘E/Esc en onthoudt de keuze', () => {
    expect(notch).toContain("aria-label={zichtbaar === 'groot' ? 'Compact view' : 'Large view'}");
    expect(notch).toContain('toetsActie(e)');
    expect(notch).toContain('bewaarGrootte(opslag(), g)');
    expect(notch).toContain("useState<Tab>('home')");
  });

  it('⌘-letters van de app navigeren het notch-venster niet weg', () => {
    expect(sneltoetsen).toMatch(/location\.pathname\.startsWith\('\/float\/'\)\) return;/);
    expect(notch).toContain("window.addEventListener('keydown', op, true)");
  });
});

describe('veilig: niets keurt goed, Opnieuw alleen zonder risico', () => {
  it('Opnieuw roept retryDurableTask alleen na magOpnieuw', () => {
    const blok = notch.slice(notch.indexOf('const opnieuw = async'), notch.indexOf('const opnieuw = async') + 900);
    expect(blok).toMatch(/if \(!t \|\| !magOpnieuw\(t\)\) return;/);
    expect(blok.indexOf('magOpnieuw')).toBeLessThan(blok.indexOf('retryDurableTask'));
  });

  it('de compacte kaart roept geen goedkeuring aan', () => {
    const start = notch.indexOf('{compact && (() => {');
    const eind = notch.indexOf('{open && !compact && (');
    const compact = notch.slice(start, eind);
    expect(start).toBeGreaterThan(0);
    expect(compact).not.toMatch(/beslisApproval|beslisOk|approve/i);
  });

  it('voorbeelddata alleen in ontwerpmodus', () => {
    expect(ontwerp).toContain('if (!ontwerpModus()) return null;');
  });
});
