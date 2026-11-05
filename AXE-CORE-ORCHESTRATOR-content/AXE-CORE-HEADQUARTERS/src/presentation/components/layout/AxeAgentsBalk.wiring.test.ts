import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = readFileSync(join(__dirname, 'AxeAgentsBalk.tsx'), 'utf8');

describe('AxeAgentsBalk biedt Fix voor lint/project-check', () => {
  it('leest taakFoutVan inclusief result/metadata en toont de gekozen actie', () => {
    expect(bron).toMatch(/taakFoutVan\(r\.error,\s*r\.title/);
    expect(bron).toMatch(/result:/);
    expect(bron).toMatch(/metadata:\s*r\.metadata/);
    expect(bron).toMatch(/taakActieLabel\(m\.actie\)/);
    expect(bron).toMatch(/select\('id,title,status,error,assignee,capability,updated_at,metadata,result'\)/);
  });

  it('Fix start een reparatietaak, Retry blijft niet de default voor actie fix', () => {
    expect(bron).toMatch(/fixDurableTask/);
    expect(bron).toMatch(/soort === 'fix'/);
    expect(bron).toMatch(/archiveerTaak\(m\.id/);
    expect(bron).toMatch(/Could not start a lint repair|Could not start a repair/);
    expect(bron).toMatch(/doe\(m,\s*m\.actie\)/);
    // Retry mag blijven bestaan voor andere fouten, maar Fix is een eigen pad.
    expect(bron).toMatch(/retryDurableTask/);
    expect(bron).not.toMatch(/else void retryDurableTask\(m\.id\)/);
  });

  it('Dismiss archiveert nog steeds via metadata.archived', () => {
    expect(bron).toMatch(/metadata: \{ \.\.\.meta, archived: true/);
    expect(bron).toMatch(/if \(r\.metadata\?\.archived\) return false/);
  });
});
