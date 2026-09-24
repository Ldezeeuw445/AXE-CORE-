import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Wachters op het pad dat Luka ziet: composer → installStableChat →
 * MarkdownMessage in de presence-dock. Groene unit-tests op helpers zeggen
 * niets als de live aanroeper het oude trage pad blijft doen.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function bron(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('het live chat-pad wacht niet op TTS of RAG voor first-token', () => {
  it('useSpokenReveal toont tekst via zichtbareChatTekst, niet via revealCut', () => {
    const tekst = bron('presentation/hooks/useSpokenReveal.ts');
    expect(tekst).toMatch(/zichtbareChatTekst/);
    expect(tekst).not.toMatch(/revealCut\(/);
  });

  it('installStableChat start de LLM zonder op RAG of skills te wachten', () => {
    const tekst = bron('presentation/store/installStableChat.ts');
    // Het oude pad: await buildRagContext / await getSkillsPromptForAgent
    // vóór callProvider. Dat is precies de 1,5s+ stilte vóór first token.
    expect(tekst).not.toMatch(/await\s+buildRagContext\s*\(/);
    expect(tekst).not.toMatch(/await\s+getSkillsPromptForAgent\s*\(/);
    expect(tekst).toMatch(/voorwerkVoorFirstToken|raceFirstToken/);
    expect(tekst).toMatch(/streamProvider\s*\(/);
    expect(tekst).toMatch(/volgendeAxeBericht\s*\(/);
  });

  it('installStableChat opent en sluit de leerlus zonder die first-token te laten blokkeren', () => {
    const tekst = bron('presentation/store/installStableChat.ts');
    // #172: chat.opened / chat.closed. Simple chat liep hier, niet via
    // voiceStore, dus noteOwnerOutcome daar was niet genoeg.
    expect(tekst).toMatch(/noteRetrieval\s*\(/);
    expect(tekst).toMatch(/noteOwnerOutcome\s*\(/);
    expect(tekst).toMatch(/'chat'/);
  });

  it('de tier-router start tier 2 zonder op RAG te wachten', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/streamProvider\s*\(/);
    expect(tekst).toMatch(/volgendeAxeBericht\s*\(/);
    expect(tekst).not.toMatch(/await\s+buildRagContext\s*\(/);
    const streamIdx = tekst.indexOf('streamProvider');
    const ragIdx = tekst.indexOf('buildRagContext');
    expect(ragIdx).toBe(-1);
    expect(streamIdx).toBeGreaterThan(0);
  });

  it('publishAxeReply start TTS ná zichtbare tekst, niet als poort ernaartoe', () => {
    const tekst = bron('presentation/store/installStableChat.ts');
    expect(tekst).toMatch(/speakAxe\s*\(/);
    expect(tekst).toMatch(/startAxeSpraakStroom/);
    expect(tekst).toMatch(/stroom\.voer\(/);
    // De bubble moet al tokens hebben vóór speakAxe: volgendeAxeBericht
    // tijdens de stream, speakAxe blijft voor ack/agentic.
    const streamIdx = tekst.indexOf('volgendeAxeBericht');
    const stroomIdx = tekst.indexOf('stroom.voer');
    const speakIdx = tekst.lastIndexOf('speakAxe(');
    expect(streamIdx).toBeGreaterThan(0);
    expect(stroomIdx).toBeGreaterThan(streamIdx);
    expect(speakIdx).toBeGreaterThan(0);
  });
});
