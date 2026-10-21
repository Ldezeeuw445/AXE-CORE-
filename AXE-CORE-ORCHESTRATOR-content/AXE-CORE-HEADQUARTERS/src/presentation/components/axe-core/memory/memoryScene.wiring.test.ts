import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hq = join(__dirname, '..');

function bron(rel: string): string {
  return readFileSync(join(hq, rel), 'utf8');
}

describe('memory scene — echte hubinhoud, geen overlap', () => {
  it('Terrain opent het leesbare hubpaneel in plaats van alleen een spinrag', () => {
    const terrain = bron('NeuralMemorySystem.tsx');
    expect(terrain).toContain('MemoryHubDetailPanel');
    expect(terrain).toContain('collectHubRecords');
    expect(terrain).toContain('MemoryAgentActivity');
    expect(terrain).not.toMatch(/Click a hub to zoom into its peak and explore sub-hubs/);
  });

  it('hubdetail is een zijpaneel, niet over het midden van de graaf', () => {
    const css = bron('memory/MemoryHubDetailPanel.css');
    expect(css).not.toMatch(/left:\s*50%/);
    expect(css).toContain('transform: none');
    expect(css).toContain('--axe-chat-links');
    expect(css).toContain('min(340px');
    const panel = bron('memory/MemoryHubDetailPanel.tsx');
    expect(panel).toContain('unique ·');
    expect(panel).toContain('sampleHubRecords');
  });

  it('Neural gebruikt echte records en dezelfde hubkleuren als Distribution', () => {
    const neural = bron('NeuralBrain.tsx');
    expect(neural).not.toContain('TREE_DATA');
    expect(neural).toContain('branchesFromRecords');
    expect(neural).toContain('MemoryHubDetailPanel');
    expect(neural).toContain('MemoryTypeLegend');
    expect(neural).toContain('resolveLabelCollisions');
    expect(neural).toContain('buildBrainGeometry(48000, 900)');
    expect(neural).toContain('sampleHubRecords');
  });

  it('Terrain tekent geen bladlabels over de composer', () => {
    const map = bron('terrain/MemoryTerrainMap.tsx');
    expect(map).toContain('showLeafLabels={false}');
  });
});
