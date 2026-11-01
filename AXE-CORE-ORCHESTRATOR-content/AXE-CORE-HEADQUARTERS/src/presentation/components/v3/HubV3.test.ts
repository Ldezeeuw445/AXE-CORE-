import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('HubV3', () => {
  it('exports HubV3 with data-axe-hub=v3', () => {
    const src = readFileSync(resolve(__dirname, 'HubV3.tsx'), 'utf8');
    expect(src).toContain('data-axe-hub="v3"');
    expect(src).toContain('axe-hub-v3-tile');
  });
});
