import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Statische vangrail, geen vervanging voor database-tests met echte rollen.
// Historische migraties blijven ongewijzigd; vanaf vandaag moet elke nieuwe
// public-tabel zijn toegang in dezelfde migratie expliciet vastleggen.
function missingAccess(sql: string): string[] {
  const clean = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').replace(/"/g, '');
  const errors: string[] = [];
  const tables = clean.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi);
  for (const [, schema, table] of tables) {
    if (schema && schema.toLowerCase() !== 'public') continue;
    const name = `(?:public\\.)?${table}\\b`;
    if (!new RegExp(`alter\\s+table\\s+${name}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(clean)) {
      errors.push(`${table}: RLS ontbreekt`);
    }
    if (!new RegExp(`grant\\s+(?:select|insert|update|delete|all)[^;]*\\s+on\\s+(?:table\\s+)?${name}[^;]*\\s+to\\s+(?:authenticated|service_role|anon)\\b`, 'i').test(clean)) {
      errors.push(`${table}: expliciete tabelrechten ontbreken`);
    }
  }
  return errors;
}

describe('Supabase explicit migration access', () => {
  it('rejects implicit access, including grants hidden in comments', () => {
    expect(missingAccess('CREATE TABLE public.example (id uuid); -- GRANT ALL ON public.example TO anon;')).toHaveLength(2);
  });
  it('accepts server-only tables without opening them to clients', () => {
    expect(missingAccess('CREATE TABLE public.example (id uuid); ALTER TABLE public.example ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT ON TABLE public.example TO service_role;')).toEqual([]);
  });
  it('requires separate access declarations for each public table', () => {
    expect(missingAccess('CREATE TABLE first (id uuid); CREATE TABLE second (id uuid); ALTER TABLE first ENABLE ROW LEVEL SECURITY; GRANT SELECT ON first TO authenticated;')).toEqual(['second: RLS ontbreekt', 'second: expliciete tabelrechten ontbreken']);
  });
  it('checks all new migrations in both repository migration directories', () => {
    for (const dir of [resolve('supabase/migrations'), resolve('../../supabase/migrations')]) {
      for (const file of readdirSync(dir).filter(f => /^\d{8}/.test(f) && f.slice(0, 8) >= '20261014' && f.endsWith('.sql'))) {
        expect(missingAccess(readFileSync(resolve(dir, file), 'utf8')), file).toEqual([]);
      }
    }
  });
});
