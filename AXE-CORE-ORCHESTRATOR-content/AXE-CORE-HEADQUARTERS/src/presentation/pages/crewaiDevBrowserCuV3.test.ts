import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CrewAI / Developer / Browser / Computer-use v3', () => {
  it('tagged', () => {
    expect(readFileSync(resolve(__dirname, 'CrewAI.tsx'), 'utf8')).toContain('data-axe-crewai="v3"');
    expect(readFileSync(resolve(__dirname, 'CommandCenter.tsx'), 'utf8')).toContain('data-axe-developer="v3"');
    expect(readFileSync(resolve(__dirname, 'BrowserPage.tsx'), 'utf8')).toContain('data-axe-browser="v3"');
    expect(readFileSync(resolve(__dirname, 'ComputerUse.tsx'), 'utf8')).toContain('data-axe-computer-use="v3"');
  });
});
