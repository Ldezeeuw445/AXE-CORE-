import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../..');

function bron(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('tier-router is aangesloten, niet alleen gebouwd', () => {
  it('main.tsx zet de router ná stable chat en vóór de whisper-guard', () => {
    const tekst = bron('app/main.tsx');
    const stable = tekst.indexOf('installStableChat()');
    const router = tekst.indexOf('installTierRouter()');
    const guard = tekst.indexOf('installWhisperVoiceSendGuard()');
    expect(stable).toBeGreaterThan(0);
    expect(router).toBeGreaterThan(stable);
    expect(guard).toBeGreaterThan(router);
  });

  it('onderschept sendMessage en valt terug op het oude pad', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/kiesAxeRoute\s*\(/);
    expect(tekst).toMatch(/if\s*\(\s*!keuze\.intercept\s*\)/);
    expect(tekst).toMatch(/await original\(text\)/);
    expect(tekst).toMatch(/voerTier1Uit/);
    expect(tekst).toMatch(/voerTier3Uit/);
    expect(tekst).toMatch(/createDurableTask\s*\(/);
    expect(tekst).toMatch(/pushTierRoute/);
  });

  it('tier 1 wacht niet op RAG of het grote model', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/groetAntwoord\s*\(/);
    expect(tekst).toMatch(/haalTier1Kijk\s*\(/);
    expect(tekst).not.toMatch(/await\s+buildRagContext\s*\(/);
    expect(tekst).not.toMatch(/auto_send_qualification|auto_reply_nonbinding|auto_send_followups/);
  });

  it('de cognitive stream toont de gekozen tier', () => {
    const tekst = bron('presentation/pages/AICore.tsx');
    expect(tekst).toMatch(/evt\.routeTier/);
    expect(tekst).toMatch(/route · tier/);
  });
});
