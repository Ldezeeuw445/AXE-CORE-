import { describe, expect, it } from 'vitest';
import type { ArchitectureManifest } from '@/domain/architecture/architectureGraph';
import { ALL_GROUPS, architectureNodeFromClick, mapArchitectureGraph, OVERVIEW, selectedArchitectureNodeFromFlow } from './architectureGraphMapper';

const manifest: ArchitectureManifest = {
  schemaVersion: 1,
  sources: [{ path: 'test', kind: 'test' }],
  warnings: [],
  nodes: [
    { id: 'app:axe_core', kind: 'app', label: 'AXE Core HQ', details: {}, sources: ['test'] },
    { id: 'service:axe-core-api', kind: 'service', label: 'axe-core-api', appId: 'app:axe_core', details: {}, sources: ['test'] },
    { id: 'app:northsea', kind: 'app', label: 'NorthSea', details: {}, sources: ['test'] },
    { id: 'mcp:northsea-mcp', kind: 'mcp', label: 'northsea-mcp', appId: 'app:northsea', details: {}, sources: ['test'] },
  ],
  edges: [
    { id: 'e1', source: 'app:axe_core', target: 'service:axe-core-api', relation: 'runs-service', sources: ['test'] },
    { id: 'e2', source: 'app:northsea', target: 'mcp:northsea-mcp', relation: 'uses-mcp', sources: ['test'] },
    { id: 'e3', source: 'service:axe-core-api', target: 'mcp:northsea-mcp', relation: 'proxies', sources: ['test'] },
  ],
};

describe('mapArchitectureGraph', () => {
  it('overview collapses nodes per app and keeps only cross-app edges', () => {
    const mapped = mapArchitectureGraph(manifest, { group: OVERVIEW, kind: 'all', query: '' });
    expect(mapped.overview).toBe(true);
    expect(mapped.nodes.map(n => n.id).sort()).toEqual(['app:axe_core', 'app:northsea']);
    expect(mapped.edges).toHaveLength(1);
    expect(mapped.edges[0]?.source).toBe('app:axe_core');
    expect(mapped.edges[0]?.target).toBe('app:northsea');
  });

  it('search keeps matching nodes and their edges', () => {
    const mapped = mapArchitectureGraph(manifest, { group: ALL_GROUPS, kind: 'all', query: 'northsea-mcp' });
    expect(mapped.overview).toBe(false);
    expect(mapped.nodes.some(n => n.id === 'mcp:northsea-mcp')).toBe(true);
    expect(mapped.visibleCount).toBe(1);
  });

  it('does not match a node just because After= mentions another unit', () => {
    const noisy: ArchitectureManifest = {
      ...manifest,
      nodes: [...manifest.nodes, {
        id: 'service:northsea-mcp', kind: 'service', label: 'northsea-mcp', appId: 'app:northsea',
        details: { after: 'network-online.target axe-core-api.service' }, sources: ['test'],
      }],
    };
    const mapped = mapArchitectureGraph(noisy, { group: ALL_GROUPS, kind: 'all', query: 'axe-core-api' });
    expect(mapped.nodes.some(n => n.id === 'service:northsea-mcp')).toBe(false);
    expect(mapped.nodes.some(n => n.id === 'service:axe-core-api')).toBe(true);
  });

  it('clicking a node card selects that node, not the group frame', () => {
    const api = manifest.nodes[1]!;
    expect(architectureNodeFromClick({
      label: api.label, kind: api.kind, node: api, groupId: 'app:axe_core', childCount: 0,
    }, api.id, manifest.nodes)).toEqual({ type: 'node', node: api });
  });

  it('inspector reads the selected flow node from the canvas store', () => {
    const api = manifest.nodes[1]!;
    expect(selectedArchitectureNodeFromFlow([
      { selected: true, type: 'architectureGroup', data: { label: 'HQ', kind: 'group', groupId: 'app:axe_core', childCount: 1 } },
      { selected: true, type: 'architecture', data: { label: api.label, kind: api.kind, node: api, groupId: 'app:axe_core', childCount: 0 } },
    ])).toEqual(api);
  });
});
