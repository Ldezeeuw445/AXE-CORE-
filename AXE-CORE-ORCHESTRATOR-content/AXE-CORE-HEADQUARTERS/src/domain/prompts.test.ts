import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { AXE_SYSTEM_PROMPT, CONVERSATION_FIRST_RULE } from './prompts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('AXE_SYSTEM_PROMPT — conversation first', () => {
  it('leert het model dat een begroeting geen tool-marker nodig heeft', () => {
    expect(CONVERSATION_FIRST_RULE).toMatch(/ZERO tools and ZERO markers/i);
    expect(CONVERSATION_FIRST_RULE).toMatch(/hey axe/i);
    expect(AXE_SYSTEM_PROMPT).toContain(CONVERSATION_FIRST_RULE);
    expect(AXE_SYSTEM_PROMPT).toMatch(/Never invent a tool call for social chat/i);
    expect(AXE_SYSTEM_PROMPT).toMatch(/No marker required/i);
  });

  it('installStableChat hangt de regel aan simple-chat en sanitizet het antwoord', () => {
    const bron = readFileSync(join(ROOT, 'src/presentation/store/installStableChat.ts'), 'utf8');
    expect(bron).toMatch(/CONVERSATION_FIRST_RULE/);
    expect(bron).toMatch(/zichtbareAxeAntwoord/);
    expect(bron).toMatch(/isSocialChatTurn/);
  });
});
