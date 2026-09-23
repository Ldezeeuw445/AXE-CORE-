import { describe, it, expect } from 'vitest';
import { revealCut } from './speechChunks';
import {
  zichtbareChatTekst,
  oudeTtsGateTekst,
  firstTokenWachtOp,
  raceFirstToken,
  voorwerkVoorFirstToken,
  RAG_FIRST_TOKEN_BUDGET_MS,
} from './chatLatency';

const REPLY = 'Morning, Luka. Companion is live.';

describe('zichtbareChatTekst — TTS mag de bubble niet leeghouden', () => {
  it('toont de hele reply terwijl de stem nog op fraction 0 staat', () => {
    // Het oude pad: beginSpeechProgress zet fraction 0, revealCut geeft 0.
    expect(revealCut(REPLY, 0)).toBe(0);
    expect(oudeTtsGateTekst(REPLY, { text: REPLY, fraction: 0 })).toBe('');

    expect(zichtbareChatTekst(REPLY, { text: REPLY, fraction: 0 })).toBe(REPLY);
    expect(zichtbareChatTekst(REPLY, { text: REPLY, fraction: 0 }).length).toBeGreaterThan(0);
  });

  it('toont de hele reply halverwege het spreken, niet alleen het uitgesproken deel', () => {
    const half = oudeTtsGateTekst(REPLY, { text: REPLY, fraction: 0.3 });
    expect(half.length).toBeLessThan(REPLY.length);
    expect(zichtbareChatTekst(REPLY, { text: REPLY, fraction: 0.3 })).toBe(REPLY);
  });

  it('houdt de tekst ook vast als er geen speech-progress is', () => {
    expect(zichtbareChatTekst(REPLY, null)).toBe(REPLY);
    expect(zichtbareChatTekst(REPLY, { text: null, fraction: 0 })).toBe(REPLY);
  });
});

describe('first-token wacht niet op zwaar voorwerk', () => {
  it('RAG, skills, TTS en embeddings mogen first-token niet blokkeren', () => {
    expect(firstTokenWachtOp('rag')).toBe(false);
    expect(firstTokenWachtOp('skills')).toBe(false);
    expect(firstTokenWachtOp('tts')).toBe(false);
    expect(firstTokenWachtOp('embeddings')).toBe(false);
    expect(RAG_FIRST_TOKEN_BUDGET_MS).toBe(0);
  });

  it('wacht niet op een trage RAG-belofte voordat de LLM mag starten', async () => {
    let ragKlaar = false;
    const rag = new Promise<string>(resolve => {
      setTimeout(() => {
        ragKlaar = true;
        resolve('## AXE Global Brain\n- een herinnering');
      }, 200);
    });
    const extra = await voorwerkVoorFirstToken({
      rag,
      skills: new Promise(resolve => setTimeout(() => resolve('SKILLS'), 200)),
    });
    expect(ragKlaar).toBe(false);
    expect(extra.memoryBlock).toBe('');
    expect(extra.skillsBlock).toBe('');
  });

  it('geeft fallback meteen terug bij budget 0, zonder de belofte te annuleren', async () => {
    let later = '';
    const p = new Promise<string>(resolve => {
      setTimeout(() => {
        later = 'laat';
        resolve('laat');
      }, 30);
    });
    const eerste = await raceFirstToken(p, 'nu', 0);
    expect(eerste).toBe('nu');
    await new Promise(r => setTimeout(r, 40));
    expect(later).toBe('laat');
  });
});
