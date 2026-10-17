import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hq = resolve(new URL('../../..', import.meta.url).pathname);

describe('Architecture panel wiring', () => {
  it('Home Architecture still mounts RuntimeWorkspace, now the graph', () => {
    const home = readFileSync(resolve(hq, 'src/presentation/pages/Home.tsx'), 'utf8');
    const canvas = readFileSync(resolve(hq, 'src/presentation/components/axe-core/RuntimeCanvas.tsx'), 'utf8');
    const workspace = readFileSync(resolve(hq, 'src/presentation/architecture/ArchitectureWorkspace.tsx'), 'utf8');
    expect(home).toContain("import { RuntimeWorkspace } from '@/presentation/components/axe-core/RuntimeCanvas'");
    expect(home).toContain('<RuntimeWorkspace />');
    expect(canvas).toContain("ArchitectureWorkspace as RuntimeWorkspace");
    expect(workspace).toContain('loadArchitectureSnapshot');
    expect(workspace).toContain('mapArchitectureGraph');
    expect(workspace).toContain('ArchitectureInspector');
    expect(workspace).toContain('onSelectionChange');
    expect(workspace).toContain('axe-architecture-inspector-panel');
  });
});
