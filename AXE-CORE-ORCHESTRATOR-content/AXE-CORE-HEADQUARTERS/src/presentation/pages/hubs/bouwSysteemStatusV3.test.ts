import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Bouwen / Systeem / Status v3', () => {
  it('hubs use HubV3 mockup tiles', () => {
    const bouw = readFileSync(resolve(__dirname, 'BouwenHub.tsx'), 'utf8');
    const sys = readFileSync(resolve(__dirname, 'SysteemHub.tsx'), 'utf8');
    expect(bouw).toContain("label: 'Repos'");
    expect(bouw).toContain("label: 'Code'");
    expect(sys).toContain("label: 'Infra'");
    expect(sys).toContain("label: 'MCP'");
  });
  it('status tagged v3 and keeps health check', () => {
    const st = readFileSync(resolve(__dirname, '../StatusPage.tsx'), 'utf8');
    expect(st).toContain('data-axe-status="v3"');
    expect(st).toContain('Health check');
    expect(st).toContain('runCheck');
  });
});
