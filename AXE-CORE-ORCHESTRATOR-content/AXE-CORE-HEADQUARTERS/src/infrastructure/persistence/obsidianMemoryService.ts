/**
 * obsidianMemoryService.ts
 * ------------------------------------------------------------------
 * Cross-session durable notes via Supabase. After a successful write,
 * optionally mirrors the note into the local Obsidian vault folder
 * (Tauri only — see obsidianVaultSyncService).
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isAxeApiConfigured, sbGetRows, sbInsertRow, sbUpdateRow, sbRunSql } from '@/infrastructure/gateways/axeCoreApiService';

export type ObsidianSource = 'axe' | 'user' | 'reflection' | 'system' | 'sync';

export interface ObsidianNote {
  id?: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  wikilinks: string[];
  source: ObsidianSource;
  user_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

const TABLE = 'core_obsidian_notes';

export function notePathFromTitle(title: string, folder = 'AXE'): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_\u00C0-\u024F]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || `note-${Date.now()}`;
  return `${folder}/${slug}.md`;
}

export function extractWikilinks(content: string): string[] {
  const links = new Set<string>();
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const target = m[1].split('|')[0].trim();
    if (target) links.add(target);
  }
  return [...links];
}

export async function writeObsidianNote(input: {
  path?: string;
  title: string;
  content: string;
  tags?: string[];
  source?: ObsidianSource;
  metadata?: Record<string, unknown>;
}): Promise<{ path: string; id?: string }> {
  const path = input.path?.trim() || notePathFromTitle(input.title);
  const tags = input.tags ?? [];
  const wikilinks = extractWikilinks(input.content);
  const source = input.source ?? 'axe';
  const row: Record<string, unknown> = {
    path,
    title: input.title.trim() || path,
    content: input.content,
    tags,
    wikilinks,
    source,
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  try {
    if (isAxeApiConfigured) {
      await sbRunSql(`
        insert into core_obsidian_notes (path, title, content, tags, wikilinks, source, metadata, updated_at)
        values (
          ${sqlLit(path)},
          ${sqlLit(String(row.title))},
          ${sqlLit(String(row.content))},
          ${sqlArray(tags)},
          ${sqlArray(wikilinks)},
          ${sqlLit(source)},
          ${sqlLit(JSON.stringify(row.metadata))}::jsonb,
          now()
        )
        on conflict (path) do update set
          title = excluded.title,
          content = excluded.content,
          tags = excluded.tags,
          wikilinks = excluded.wikilinks,
          source = excluded.source,
          metadata = excluded.metadata,
          updated_at = now()
        returning id, path;
      `);
      void mirrorToVault(path, String(row.title), String(row.content), tags, source);
      return { path };
    }

    const sb = getSupabase();
    if (!sb) throw new Error('No Supabase client');
    const { data, error } = await sb
      .from(TABLE)
      .upsert(row, { onConflict: 'path' })
      .select('id, path')
      .maybeSingle();
    if (error) throw error;
    void mirrorToVault(path, String(row.title), String(row.content), tags, source);
    return { path: data?.path ?? path, id: data?.id };
  } catch (err) {
    console.error('[obsidianMemory] writeObsidianNote failed:', err);
    try {
      const key = 'axe_obsidian_local_cache';
      const cached: ObsidianNote[] = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = cached.findIndex(n => n.path === path);
      const entry: ObsidianNote = {
        path,
        title: String(row.title),
        content: String(row.content),
        tags,
        wikilinks,
        source,
        metadata: (row.metadata as Record<string, unknown>) || {},
        updated_at: new Date().toISOString(),
      };
      if (idx >= 0) cached[idx] = entry; else cached.push(entry);
      localStorage.setItem(key, JSON.stringify(cached.slice(-200)));
    } catch { /* ignore */ }
    throw err;
  }
}

function mirrorToVault(
  path: string,
  title: string,
  content: string,
  tags: string[],
  source: ObsidianSource,
): void {
  void import('@/infrastructure/persistence/obsidianVaultSyncService')
    .then(({ pushNoteToVault, getVaultPath, vaultSyncAvailable }) => {
      if (!vaultSyncAvailable() || !getVaultPath()) return;
      return pushNoteToVault({
        path,
        title,
        content,
        tags,
        wikilinks: extractWikilinks(content),
        source,
        updated_at: new Date().toISOString(),
      });
    })
    .catch(() => {});
}

export async function searchObsidianNotes(query: string, limit = 20): Promise<ObsidianNote[]> {
  const q = query.trim();
  if (!q) return listRecentObsidianNotes(limit);

  try {
    if (isAxeApiConfigured) {
      const rows = await sbRunSql(`
        select id, path, title, content, tags, wikilinks, source, metadata, created_at, updated_at
        from core_obsidian_notes
        where title ilike ${sqlLit('%' + q + '%')}
           or content ilike ${sqlLit('%' + q + '%')}
           or ${sqlLit(q)} = any(tags)
        order by updated_at desc
        limit ${Math.min(Math.max(limit, 1), 50)};
      `);
      return (Array.isArray(rows) ? rows : []) as ObsidianNote[];
    }

    const sb = getSupabase();
    if (!sb) return loadLocalCache().filter(n => matchesQuery(n, q)).slice(0, limit);

    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as ObsidianNote[];
  } catch (err) {
    console.error('[obsidianMemory] searchObsidianNotes failed:', err);
    return loadLocalCache().filter(n => matchesQuery(n, q)).slice(0, limit);
  }
}

export async function listRecentObsidianNotes(limit = 30): Promise<ObsidianNote[]> {
  try {
    if (isAxeApiConfigured) {
      const rows = await sbGetRows(TABLE, { limit, orderBy: 'updated_at', orderDir: 'desc' });
      return rows as unknown as ObsidianNote[];
    }
    const sb = getSupabase();
    if (!sb) return loadLocalCache().slice(0, limit);
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as ObsidianNote[];
  } catch (err) {
    console.error('[obsidianMemory] listRecentObsidianNotes failed:', err);
    return loadLocalCache().slice(0, limit);
  }
}

export async function getObsidianNoteByPath(path: string): Promise<ObsidianNote | null> {
  try {
    if (isAxeApiConfigured) {
      const rows = await sbRunSql(`
        select * from core_obsidian_notes where path = ${sqlLit(path)} limit 1;
      `);
      const list = Array.isArray(rows) ? rows : [];
      return (list[0] as ObsidianNote) ?? null;
    }
    const sb = getSupabase();
    if (!sb) return loadLocalCache().find(n => n.path === path) ?? null;
    const { data } = await sb.from(TABLE).select('*').eq('path', path).maybeSingle();
    return (data as ObsidianNote) ?? null;
  } catch {
    return loadLocalCache().find(n => n.path === path) ?? null;
  }
}

export function formatNotesForContext(notes: ObsidianNote[], maxChars = 2500): string {
  if (!notes.length) return '';
  const blocks = notes.map(n => {
    const tags = (n.tags || []).length ? ` #${(n.tags || []).join(' #')}` : '';
    const body = (n.content || '').slice(0, 400);
    return `### ${n.title}${tags}\npath: ${n.path}\n${body}`;
  });
  return `## Obsidian Memory\n${blocks.join('\n\n')}`.slice(0, maxChars);
}

function sqlLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlArray(arr: string[]): string {
  if (!arr.length) return `'{}'`;
  return `ARRAY[${arr.map(sqlLit).join(',')}]`;
}

function matchesQuery(n: ObsidianNote, q: string): boolean {
  const hay = `${n.title} ${n.content} ${(n.tags || []).join(' ')}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function loadLocalCache(): ObsidianNote[] {
  try {
    return JSON.parse(localStorage.getItem('axe_obsidian_local_cache') || '[]');
  } catch {
    return [];
  }
}

void sbInsertRow;
void sbUpdateRow;
