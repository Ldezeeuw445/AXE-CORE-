import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Memory / Obsidian / Knowledge v3', () => {
  it('tags v3 without removing brain/terrain lenses', () => {
    const hub = readFileSync(resolve(__dirname, 'MemoryHub.tsx'), 'utf8');
    expect(hub).toContain('data-axe-memory="v3"');
    expect(hub).toContain("'neural'");
    expect(hub).toContain("'terrain'");
    expect(hub).toContain('MemoryLibraryPanel');
  });
  it('explore/trading/obsidian/knowledge tagged', () => {
    expect(readFileSync(resolve(__dirname, 'Memory.tsx'), 'utf8')).toContain('data-axe-memory-explore="v3"');
    expect(readFileSync(resolve(__dirname, 'TradingMemory.tsx'), 'utf8')).toContain('data-axe-memory-trading="v3"');
    expect(readFileSync(resolve(__dirname, 'ObsidianMemory.tsx'), 'utf8')).toContain('data-axe-obsidian="v3"');
    expect(readFileSync(resolve(__dirname, 'KnowledgeBase.tsx'), 'utf8')).toContain('data-axe-knowledge="v3"');
  });
});
