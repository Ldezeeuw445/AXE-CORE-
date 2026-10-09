import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const conf = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')) as {
  app: { security: { capabilities: Array<{ permissions: string[] }> } };
};
const rechten = new Set(conf.app.security.capabilities.flatMap(c => c.permissions));

/**
 * `core:window:default` bevat alleen lezen (positie, maat, ...). Een venster tonen, focussen, minimaliseren
 * of bovenaan houden is een apart recht, en zonder dat weigert Tauri het STIL in de verpakte app -- precies
 * wat Computer Use en de zwevende vensters deden (9 okt): het venster "terughalen" of "klein maken" deed
 * niets, zonder foutmelding die iemand zag.
 *
 * Deze test koppelt elke vensteraanroep die de code doet aan het recht dat hij nodig heeft.
 */
const VEREIST: ReadonlyArray<[aanroep: RegExp, recht: string]> = [
  [/\.setFocus\(\)/, 'core:window:allow-set-focus'],
  [/\.show\(\)/, 'core:window:allow-show'],
  [/\.minimize\(\)/, 'core:window:allow-minimize'],
  [/\.unminimize\(\)/, 'core:window:allow-unminimize'],
  [/\.setAlwaysOnTop\(/, 'core:window:allow-set-always-on-top'],
  [/visibleOnAllWorkspaces/, 'core:window:allow-set-visible-on-all-workspaces'],
  [/\.startDragging\(\)/, 'core:window:allow-start-dragging'],
  [/\.startResizeDragging\(/, 'core:window:allow-start-resize-dragging'],
  [/\.close\(\)/, 'core:window:allow-close'],
];

const BESTANDEN = [
  'src/infrastructure/gateways/windowManagerService.ts',
  'src/infrastructure/gateways/zwevendeVensters.ts',
  'src/presentation/components/notities/FloatChrome.tsx',
  'src/presentation/pages/ComputerUseOverlay.tsx',
];

describe('Tauri-rechten voor de vensters', () => {
  for (const bestand of BESTANDEN) {
    const bron = readFileSync(join(ROOT, bestand), 'utf8');
    for (const [aanroep, recht] of VEREIST) {
      if (!aanroep.test(bron)) continue;
      it(`${bestand.split('/').pop()} gebruikt ${aanroep} en heeft ${recht}`, () => {
        expect(rechten.has(recht), `${recht} ontbreekt in tauri.conf.json`).toBe(true);
      });
    }
  }

  it('de vensters met een axe-label vallen onder de rechten', () => {
    const conf2 = readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8');
    expect(conf2).toContain('"axe-*"');
  });
});
