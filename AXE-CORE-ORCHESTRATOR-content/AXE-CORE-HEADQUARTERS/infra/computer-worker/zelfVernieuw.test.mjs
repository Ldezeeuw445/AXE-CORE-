import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vingerafdruk, codeVeranderd } from './zelfVernieuw.mjs';

describe('worker ziet zijn eigen nieuwe code', () => {
  it('verandert bij een aangepast bestand, niet bij een test', () => {
    const map = mkdtempSync(join(tmpdir(), 'axe-zv-'));
    writeFileSync(join(map, 'worker.mjs'), 'a');
    const start = vingerafdruk(map);
    expect(codeVeranderd(map, start)).toBe(false);
    writeFileSync(join(map, 'x.test.mjs'), 'test');
    expect(codeVeranderd(map, start)).toBe(false);
    writeFileSync(join(map, 'worker.mjs'), 'ab');
    utimesSync(join(map, 'worker.mjs'), new Date(), new Date(Date.now() + 5000));
    expect(codeVeranderd(map, start)).toBe(true);
  });

  it('onleesbaar of geen startafdruk: niet stoppen', () => {
    expect(codeVeranderd('/bestaat/niet', 'iets')).toBe(false);
    expect(codeVeranderd(tmpdir(), '')).toBe(false);
  });
});
