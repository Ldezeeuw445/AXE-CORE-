import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('NorthseaDesk v3', () => {
  it('keeps desk + tags v3 without dropping WereldKaart', () => {
    const src = readFileSync(resolve(__dirname, 'NorthseaDesk.tsx'), 'utf8');
    expect(src).toContain('data-axe-northsea="v3"');
    expect(src).toContain('WereldKaart');
    expect(src).toContain('ChasePaneel');
  });
});
