import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bron = readFileSync(join(__dirname, 'PhoneDeveloper.tsx'), 'utf8');
const pagina = readFileSync(join(__dirname, '../CodeEditorPage.tsx'), 'utf8');

describe('AXE Developer op de telefoon', () => {
  it('krijgt de GitHub-registry, niet alleen de host-checkout', () => {
    expect(bron).toContain('telefoonRepoLijst');
    expect(bron).toContain('github');
    expect(bron).not.toContain('Pick a project');
    expect(bron).not.toContain('no AXE composer');
    expect(pagina).toContain('loadRepoConfigs()');
    expect(pagina).toContain('github={loadRepoConfigs()}');
    expect(pagina).toMatch(/mobielStudio && !phoneProjects && \(\s*<MobileStudioBar/);
    expect(pagina).toContain('style={isMobile && phoneProjects ? { display: \'none\' } : undefined}');
  });
});
