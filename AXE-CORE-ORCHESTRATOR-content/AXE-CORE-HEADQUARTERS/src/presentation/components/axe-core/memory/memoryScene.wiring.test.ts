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

  it('Neural gebruikt echte records en dezelfde hubkleuren als Distribution', () => {
    const neural = bron('NeuralBrain.tsx');
    expect(neural).not.toContain('TREE_DATA');
    expect(neural).toContain('branchesFromRecords');
    expect(neural).toContain('MemoryHubDetailPanel');
    expect(neural).toContain('MemoryTypeLegend');
    expect(neural).toContain('resolveLabelCollisions');
    expect(neural).toContain('buildBrainGeometry(48000, 900)');
  });

  it('Terrain tekent geen bladlabels over de composer', () => {
    const map = bron('terrain/MemoryTerrainMap.tsx');
    expect(map).toContain('showLeafLabels={false}');
  });
});
