import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Apps / Brief / Ledger / Finance v3', () => {
  it('pages tagged v3', () => {
    const apps = readFileSync(resolve(__dirname, 'AppsPage.tsx'), 'utf8');
    const brief = readFileSync(resolve(__dirname, 'DailyBrief.tsx'), 'utf8');
    const ledger = readFileSync(resolve(__dirname, 'Grootboek.tsx'), 'utf8');
    const finance = readFileSync(resolve(__dirname, 'Finance.tsx'), 'utf8');
    expect(apps).toContain('data-axe-apps="v3"');
    expect(brief).toContain('data-axe-brief="v3"');
    expect(ledger).toContain('data-axe-ledger="v3"');
    expect(finance).toContain('data-axe-finance="v3"');
  });
  it('keeps core functionality hooks', () => {
    const apps = readFileSync(resolve(__dirname, 'AppsPage.tsx'), 'utf8');
    const brief = readFileSync(resolve(__dirname, 'DailyBrief.tsx'), 'utf8');
    const ledger = readFileSync(resolve(__dirname, 'Grootboek.tsx'), 'utf8');
    const finance = readFileSync(resolve(__dirname, 'Finance.tsx'), 'utf8');
    expect(apps).toContain('AddAppDialog');
    expect(brief).toContain('Daily Brief');
    expect(ledger).toContain('TopbalkSlot');
    expect(finance).toContain('Income ledger');
  });
});
