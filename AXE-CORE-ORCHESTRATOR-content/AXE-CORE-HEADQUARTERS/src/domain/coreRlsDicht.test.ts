import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIE = '20261028120000_core_anon_dicht.sql';
const SCHRIJF_TABELLEN = [
  'core_ai_state', 'core_context', 'core_deployments', 'core_events',
  'core_integrations', 'core_memory', 'core_metrics', 'core_models',
  'core_routing', 'core_services', 'core_sessions',
  'core_system_logs', 'core_workflows',
] as const;
const TABELLEN = [...SCHRIJF_TABELLEN, 'core_permissions'] as const;

function sql(): string {
  return readFileSync(resolve('supabase/migrations', MIGRATIE), 'utf8');
}

describe('core_* dicht voor anon', () => {
  it('staat in de HQ-migraties', () => {
    const files = readdirSync(resolve('supabase/migrations'));
    expect(files).toContain(MIGRATIE);
  });

  it('maakt core_owner() die Luka opzoekt in auth.users en anonieme sessies weigert', () => {
    const tekst = sql();
    expect(tekst).toMatch(/create or replace function public\.core_owner\(\)/i);
    expect(tekst).toContain('acff7a12-1111-481d-a7a9-cc07583b8069');
    expect(tekst).toMatch(/from auth\.users/i);
    expect(tekst).toMatch(/u\.id = \(select auth\.uid\(\)\)/);
    expect(tekst).toMatch(/u\.is_anonymous is not true/);
    expect(tekst).toMatch(/grant execute on function public\.core_owner\(\) to authenticated/i);
    expect(tekst).toMatch(/revoke all on function public\.core_owner\(\) from anon/i);
  });

  it('dropt anon_all, trekt anon-rechten in, en zet per-operatie Luka-policies', () => {
    const tekst = sql();
    for (const tabel of TABELLEN) {
      expect(tekst, tabel).toContain(`drop policy if exists anon_all_${tabel} on public.${tabel}`);
      expect(tekst, tabel).toMatch(new RegExp(`revoke all on table public\\.${tabel} from anon`, 'i'));
      expect(tekst, tabel).not.toMatch(new RegExp(`grant [^;]*on table public\\.${tabel}[^;]*to anon`, 'i'));
    }
    for (const tabel of SCHRIJF_TABELLEN) {
      for (const op of ['select', 'insert', 'update', 'delete'] as const) {
        expect(tekst, `${tabel} ${op}`).toContain(`create policy luka_${op}_${tabel} on public.${tabel}`);
        expect(tekst, `${tabel} ${op}`).toContain('to authenticated');
      }
      expect(tekst, tabel).toContain('public.core_owner()');
    }
  });

  it('geeft core_permissions geen schrijfrechten terug: alleen SELECT voor Luka', () => {
    const tekst = sql();
    expect(tekst).toContain('drop policy if exists anon_all_core_permissions on public.core_permissions');
    expect(tekst).toContain('create policy luka_select_core_permissions on public.core_permissions');
    expect(tekst).not.toMatch(/create policy luka_insert_core_permissions/);
    expect(tekst).not.toMatch(/create policy luka_update_core_permissions/);
    expect(tekst).not.toMatch(/create policy luka_delete_core_permissions/);
    expect(tekst).toMatch(/revoke insert, update, delete, truncate on table public\.core_permissions from authenticated/i);
    expect(tekst).toMatch(/grant select on table public\.core_permissions to authenticated/i);
    expect(tekst).not.toMatch(/grant select, insert, update, delete on table public\.core_permissions/i);
    expect(tekst).toMatch(/revoke all on table public\.core_permissions from anon/i);
  });

  it('laat service_role met rust en sluit core_task_events voor clients', () => {
    const tekst = sql();
    expect(tekst).not.toMatch(/revoke all on table public\.core_system_logs from service_role/i);
    expect(tekst).not.toMatch(/drop policy if exists service_role/i);
    expect(tekst).toContain('drop policy if exists rw_core_task_events on public.core_task_events');
    expect(tekst).toMatch(/revoke all on table public\.core_task_events from anon, authenticated/i);
    expect(tekst).toContain('service_role_only blijft staan');
  });

  it('past niets toe: alleen een SQL-bestand, geen apply-script', () => {
    const tekst = sql();
    expect(tekst).toMatch(/NIET toepassen op live tot de clients/i);
  });
});
