/**
 * obsidianVaultSyncService — one-way Core → local Obsidian vault (.md files).
 * Only works inside the Tauri desktop app (real filesystem). Web builds no-op.
 *
 * Flow: core_obsidian_notes (Supabase) → {vaultRoot}/{path}
 * Example: path "AXE/Reflections/foo.md" → ~/Obsidian/MyVault/AXE/Reflections/foo.md
 */

import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import {
  listRecentObsidianNotes,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';

const LS_VAULT = 'axe_obsidian_vault_path';

export function getVaultPath(): string | null {
  try {
    const p = localStorage.getItem(LS_VAULT)?.trim();
    return p || null;
  } catch {
    return null;
  }
}

export function setVaultPath(path: string | null): void {
  try {
    if (!path?.trim()) localStorage.removeItem(LS_VAULT);
    else localStorage.setItem(LS_VAULT, path.trim());
  } catch { /* */ }
}

export function vaultSyncAvailable(): boolean {
  return isTauriRuntime();
}

async function invokeTauri<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** Build markdown file body with optional YAML frontmatter for tags. */
export function noteToMarkdown(note: ObsidianNote): string {
  const tags = note.tags || [];
  const lines: string[] = [];
  if (tags.length || note.source) {
    lines.push('---');
    if (note.source) lines.push(`source: ${note.source}`);
    if (tags.length) lines.push(`tags: [${tags.map(t => JSON.stringify(t)).join(', ')}]`);
    if (note.updated_at) lines.push(`updated: ${note.updated_at}`);
    lines.push('---');
    lines.push('');
  }
  // Prefer title as H1 if body doesn't already start with one
  const body = note.content || '';
  if (!/^#\s/m.test(body.slice(0, 80))) {
    lines.push(`# ${note.title}`);
    lines.push('');
  }
  lines.push(body);
  if (!body.endsWith('\n')) lines.push('');
  return lines.join('\n');
}

/** Write a single note into the vault (if path configured + Tauri). */
export async function pushNoteToVault(note: ObsidianNote): Promise<{ ok: boolean; error?: string }> {
  if (!vaultSyncAvailable()) return { ok: false, error: 'Vault sync only works in the Tauri desktop app' };
  const vault = getVaultPath();
  if (!vault) return { ok: false, error: 'No vault folder configured' };

  let rel = note.path.replace(/^\/+/, '');
  if (!rel.toLowerCase().endsWith('.md')) rel = `${rel}.md`;

  try {
    await invokeTauri('write_vault_file', {
      vaultRoot: vault,
      relativePath: rel,
      content: noteToMarkdown(note),
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[vaultSync] push failed:', msg);
    return { ok: false, error: msg };
  }
}

export interface VaultSyncReport {
  total: number;
  written: number;
  failed: number;
  errors: string[];
  vault: string;
}

/** Pull all recent notes from Supabase and write them into the vault folder. */
export async function syncAllNotesToVault(limit = 200): Promise<VaultSyncReport> {
  const vault = getVaultPath();
  if (!vaultSyncAvailable()) {
    return { total: 0, written: 0, failed: 0, errors: ['Not running in Tauri'], vault: vault || '' };
  }
  if (!vault) {
    return { total: 0, written: 0, failed: 0, errors: ['Set a vault folder first'], vault: '' };
  }

  try {
    const exists = await invokeTauri<boolean>('vault_path_exists', { path: vault });
    if (!exists) {
      return { total: 0, written: 0, failed: 0, errors: [`Folder does not exist: ${vault}`], vault };
    }
  } catch (err) {
    return { total: 0, written: 0, failed: 0, errors: [String(err)], vault };
  }

  const notes = await listRecentObsidianNotes(limit);
  const report: VaultSyncReport = { total: notes.length, written: 0, failed: 0, errors: [], vault };

  for (const note of notes) {
    const r = await pushNoteToVault(note);
    if (r.ok) report.written++;
    else {
      report.failed++;
      if (r.error && report.errors.length < 8) report.errors.push(`${note.path}: ${r.error}`);
    }
  }
  return report;
}
