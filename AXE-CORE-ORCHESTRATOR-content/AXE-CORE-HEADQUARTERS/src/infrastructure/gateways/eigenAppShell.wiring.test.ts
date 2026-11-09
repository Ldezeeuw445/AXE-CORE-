import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = readFileSync(join(__dirname, 'eigenAppShell.ts'), 'utf8');
const dok = readFileSync(join(__dirname, '../../presentation/components/layout/RadiaalDok.tsx'), 'utf8');

describe('radiale shell gebruikt de sessie-URL, niet een kale site', () => {
  it('opent remote apps via shellUrl + Safari-UA, en logt de hash niet', () => {
    expect(bron).toContain("from '@/domain/eigenAppSessie'");
    expect(bron).toContain('shellUrl(');
    expect(bron).toContain('shellWebviewOpties(app)');
    expect(bron).toContain('axonSessieKlaar');
    expect(bron).toContain('getSession()');
    expect(bron).toContain('urlZonderGeheim');
    expect(bron).not.toContain('service_role');
    expect(bron).not.toContain('SERVICE_ROLE');
    expect(bron).not.toMatch(/console\.(log|info|debug|error|warn)\([^)]*doel/);
    expect(bron).not.toMatch(/console\.(log|info|debug)\([^)]*access_token/);
  });

  it('rechter radial roept openEigenApp aan voor de drie remote apps', () => {
    expect(dok).toContain("openEigen('developer'");
    expect(dok).toContain("openEigen('axon'");
    expect(dok).toContain("openEigen('companion'");
    expect(dok).toContain("openEigen('trading-os'");
    expect(dok).toContain("openEigen('northsea'");
    expect(dok).toContain("from '@/infrastructure/gateways/eigenAppShell'");
  });
});
