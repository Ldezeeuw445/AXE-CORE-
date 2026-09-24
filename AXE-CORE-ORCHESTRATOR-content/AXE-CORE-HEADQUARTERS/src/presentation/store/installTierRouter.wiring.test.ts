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
    expect(tekst).toMatch(/voerJobsUit/);
    expect(tekst).toMatch(/createDurableTask/);
    expect(tekst).toMatch(/pushTierRoute/);
  });

  it('knipte jobs starten op de achtergrond — sendMessage wacht niet', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/splitsAxeBeurten/);
    expect(tekst).toMatch(/function startAxeJobs/);
    expect(tekst).toMatch(/void startJobsParallel/);
    expect(tekst).toMatch(/void monitorTier3/);
    expect(tekst).not.toMatch(/await startAxeJobs/);
    expect(tekst).not.toMatch(/await startJobsParallel/);
    expect(tekst).not.toMatch(/await monitorTier3/);
    expect(tekst).toMatch(/injecteerJobResultaat/);
    expect(tekst).toMatch(/speakZonderKap/);
    expect(tekst).toMatch(/sessieSamenvatting/);
    expect(tekst).not.toMatch(/auto_send_qualification|auto_reply_nonbinding|auto_send_followups/);
  });

  it('de agents-balk zit in de composer, niet alleen als los bestand', () => {
    const vak = bron('presentation/components/layout/AxeComposerVak.tsx');
    expect(vak).toMatch(/<AxeAgentsBalk\s*\/>/);
    const balk = bron('presentation/components/layout/AxeAgentsBalk.tsx');
    expect(balk).toMatch(/balkLabel/);
    expect(balk).toMatch(/surface-bg/);
    expect(balk).toMatch(/tint-line/);
  });

  it('Whisper-lus: Esc stopt, job-spraak wacht tot de gebruiker klaar is', () => {
    const tekst = bron('presentation/store/installWhisperVoice.ts');
    expect(tekst).toMatch(/e\.key !== 'Escape'/);
    expect(tekst).toMatch(/stopListening\(\)/);
    expect(tekst).toMatch(/flushAxeSpraakRij/);
    expect(tekst).toMatch(/conversationActive/);
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
