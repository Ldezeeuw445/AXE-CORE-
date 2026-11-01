import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PlaatViewSwitch v3 labels', () => {
  it('matches mockup segment names AXE · Neural · Terrain · Runtime', () => {
    const src = readFileSync(resolve(__dirname, 'PlaatViewSwitch.tsx'), 'utf8');
    expect(src).toContain("label: 'AXE'");
    expect(src).toContain("label: 'Neural'");
    expect(src).toContain("label: 'Terrain'");
    expect(src).toContain("label: 'Runtime'");
    expect(src).not.toContain("label: 'Architecture'");
    expect(src).not.toContain("label: 'Core'");
  });
});
