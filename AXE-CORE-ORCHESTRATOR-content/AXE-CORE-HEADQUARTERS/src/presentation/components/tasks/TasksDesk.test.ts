import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lees = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('TasksDesk v3', () => {
  it('matches the mockup structure: filters, inbox, detail, Mark done', () => {
    const src = lees('./TasksDesk.tsx');
    expect(src).toMatch(/data-axe-tasks-desk="v3"/);
    expect(src).toMatch(/Alle open/);
    expect(src).toMatch(/Mark done/);
    expect(src).toMatch(/\+ Nieuwe task/);
    expect(src).not.toMatch(/<aside[\s>]/);
  });

  it('is wired from Tasks.tsx', () => {
    const pagina = lees('../../pages/Tasks.tsx');
    expect(pagina).toMatch(/TasksDesk/);
    expect(pagina).toMatch(/data-axe-tasks="v3"/);
  });
});
