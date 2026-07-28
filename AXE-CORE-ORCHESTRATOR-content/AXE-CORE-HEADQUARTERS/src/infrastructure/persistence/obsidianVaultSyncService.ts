/**
 * obsidianVaultSyncService — two-way Core <-> local Obsidian vault (.md files).
 * Only works inside the Tauri desktop app (real filesystem). Web builds no-op.
 *
 * Push:  core_obsidian_notes (Supabase) → {vaultRoot}/{path}
 * Pull:  {vaultRoot}/AXE/**.md → core_obsidian_notes (Supabase)
 * Example: path "AXE/Reflections/foo.md" → ~/Obsidian/MyVault/AXE/Reflections/foo.md
 *
 * Pull is scoped to the AXE/ subtree only — never the user's whole vault —
 * so editing a note by hand in Obsidian (inside AXE/) round-trips back into
 * memory, without AXE ever ingesting unrelated personal notes it was never
 * given access to.
 */

import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import {
  listRecentObsidianNotes,
  getObsidianNoteByPath,
  writeObsidianNote,
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

interface VaultFile {
  relative_path: string;
  content: string;
  mtime_ms: number;
}

/** Inverse of noteToMarkdown(): strip optional YAML frontmatter + a leading
 *  `# Title` line that just restates the filename, recover tags/source. */
function markdownToNote(raw: string): { title: string; content: string; tags: string[]; source?: string } {
  let body = raw;
  let tags: string[] = [];
  let source: string | undefined;

  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    body = body.slice(fm[0].length);
    const tagsLine = fm[1].match(/^tags:\s*\[(.*)\]\s*$/m);
    if (tagsLine) {
      tags = tagsLine[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    const sourceLine = fm[1].match(/^source:\s*(.+)$/m);
    if (sourceLine) source = sourceLine[1].trim();
  }

  body = body.replace(/^\r?\n+/, '');
  let title = '';
  const h1 = body.match(/^#\s+(.+?)\r?\n\r?\n?/);
  if (h1) {
    title = h1[1].trim();
    body = body.slice(h1[0].length);
  }
  return { title, content: body.trimEnd(), tags, source };
}

export interface VaultPullReport {
  total: number;
  pulled: number;
  skipped: number;
  errors: string[];
  vault: string;
}

/**
 * Pull hand-edited notes back from {vaultRoot}/AXE/**.md into Supabase.
 * Only overwrites a Supabase note when the disk file's mtime is newer than
 * the note's updated_at (or the note doesn't exist in Supabase yet) — a
 * note nobody touched on disk since the last push is left alone, so this
 * never clobbers a fresher AXE-side edit with a stale disk copy.
 */
export async function pullNotesFromVault(): Promise<VaultPullReport> {
  const vault = getVaultPath();
  if (!vaultSyncAvailable()) {
    return { total: 0, pulled: 0, skipped: 0, errors: ['Not running in Tauri'], vault: vault || '' };
  }
  if (!vault) {
    return { total: 0, pulled: 0, skipped: 0, errors: ['Set a vault folder first'], vault: '' };
  }

  let files: VaultFile[];
  try {
    files = await invokeTauri<VaultFile[]>('list_vault_files', { vaultRoot: vault, subfolder: 'AXE' });
  } catch (err) {
    return { total: 0, pulled: 0, skipped: 0, errors: [String(err)], vault };
  }

  const report: VaultPullReport = { total: files.length, pulled: 0, skipped: 0, errors: [], vault };

  for (const file of files) {
    try {
      const existing = await getObsidianNoteByPath(file.relative_path);
      const diskUpdatedAt = new Date(file.mtime_ms);
      if (existing?.updated_at && new Date(existing.updated_at) >= diskUpdatedAt) {
        report.skipped++;
        continue;
      }
      const parsed = markdownToNote(file.content);
      const title = parsed.title || existing?.title || file.relative_path.split('/').pop()?.replace(/\.md$/, '') || file.relative_path;
      await writeObsidianNote({
        path: file.relative_path,
        title,
        content: parsed.content,
        tags: parsed.tags.length ? parsed.tags : existing?.tags,
        source: 'sync',
        metadata: { ...(existing?.metadata ?? {}), pulledFromVaultAt: new Date().toISOString() },
      });
      report.pulled++;
    } catch (err) {
      report.skipped++;
      if (report.errors.length < 8) report.errors.push(`${file.relative_path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return report;
}

/** Push then pull — a real two-way "Sync now". */
export async function syncVaultBidirectional(limit = 200): Promise<{ push: VaultSyncReport; pull: VaultPullReport }> {
  const push = await syncAllNotesToVault(limit);
  const pull = await pullNotesFromVault();
  return { push, pull };
}
