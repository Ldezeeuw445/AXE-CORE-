import type { ArchitectureRows, ArchitectureSnapshot, ArchitectureTable } from '@/domain/architecture/architectureGraph';
import { ARCHITECTURE_TABLES, mergeArchitectureLive } from '@/domain/architecture/architectureGraph';
import generated from '@/domain/architecture/architecture.generated.json';
import { sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';

const STATIC = generated as unknown as ArchitectureSnapshot['manifest'];

async function loadTable(table: ArchitectureTable): Promise<{ table: ArchitectureTable; rows: Record<string, unknown>[]; error?: string }> {
  try {
    const rows = await sbGetRows<Record<string, unknown>>(table, { limit: 500 });
    return { table, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    return { table, rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadArchitectureSnapshot(): Promise<ArchitectureSnapshot> {
  const results = await Promise.all(ARCHITECTURE_TABLES.map(loadTable));
  const rows: ArchitectureRows = {};
  const issues = results.flatMap(result => result.error ? [`${result.table}: ${result.error}`] : []);
  for (const result of results) {
    if (!result.error) rows[result.table] = result.rows;
  }
  const loaded = ARCHITECTURE_TABLES.filter(table => !issues.some(issue => issue.startsWith(`${table}:`))).length;
  const state = loaded === 0 ? 'offline' : loaded === ARCHITECTURE_TABLES.length ? 'connected' : 'partial';
  return {
    manifest: mergeArchitectureLive(STATIC, rows),
    live: { state, loadedAt: new Date().toISOString(), issues },
  };
}

export function staticArchitectureManifest() {
  return STATIC;
}
