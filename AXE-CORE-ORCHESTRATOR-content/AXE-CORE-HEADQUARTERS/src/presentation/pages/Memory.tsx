import { LearningLoopPanel } from '@/presentation/components/axe-core/LearningLoopPanel';
import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { LIST_GRID } from '@/presentation/components/surface/Page';
import { cn } from '@/shared/utils';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  Database,
  Cloud,
  HardDrive,
  Server,
  FolderOpen,
  Folder,
  Table2,
  FileBox,
  Columns3,
  Clock,
  Hash,
  Calendar,
  Brain,
  Plus,
  Trash2,
  RefreshCw,
  Tag,
  AlertCircle,
} from 'lucide-react';
import {
  loadMemories,
  saveMemory,
  deleteMemory,
  isSupabaseConnected,
} from '@/infrastructure/persistence/coreDB';
import { loadMcpServers } from '@/infrastructure/persistence/mcpRegistryService';
import { sbListTables, sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { CoreMemoryEntry } from '@/infrastructure/persistence/coreDB';
import { loadGlobalMemories } from '@/infrastructure/persistence/globalMemoryService';
import { loadUnifiedMemory } from '@/infrastructure/persistence/unifiedMemoryService';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getSupabase, currentUserId } from '@/infrastructure/supabase/supabaseClient';
import { HUD_BASE_BG, HUD_DOT_GRID_STYLE } from '@/presentation/styles/hudBackground';
import { loadAgents, updateAgent, ensureAgentsSeeded, type AgentRecord } from '@/infrastructure/persistence/agentRegistryService';
import { recall } from '@/infrastructure/persistence/agentMemoryService';

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface TreeNode {
  id: string;
  name: string;
  type: 'root' | 'category' | 'schema' | 'table' | 'bucket' | 'store' | 'service' | 'server';
  count?: string;
  status?: string;
  children?: TreeNode[];
  details?: TableDetail;
}

interface TableDetail {
  schema: { column: string; type: string; nullable: boolean }[];
  rowCount: number;
  lastUpdated: string;
  sampleRows: Record<string, string | number | boolean | null>[];
}

const EMPTY_DETAIL: TableDetail = { schema: [], rowCount: 0, lastUpdated: 'n/a', sampleRows: [] };

function loadLocalStorageNode(): TreeNode {
  const children: TreeNode[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? '';
      const bytes = new Blob([value]).size;
      children.push({
        id: `ls-${key}`,
        name: key,
        type: 'store',
        count: bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`,
        details: {
          schema: [],
          rowCount: 1,
          lastUpdated: 'live',
          sampleRows: [{ key, size_bytes: bytes, preview: value.length > 120 ? `${value.slice(0, 120)}…` : value }],
        },
      });
    }
  } catch { /* localStorage unavailable */ }
  children.sort((a, b) => a.name.localeCompare(b.name));
  return { id: 'local', name: 'Local Storage', type: 'category', status: 'active', children };
}

function mcpNodeFromServer(s: Awaited<ReturnType<typeof loadMcpServers>>[number]): TreeNode {
  return {
    id: `mcp-${s.id}`,
    name: s.name,
    type: 'server',
    count: s.status,
    status: s.status === 'online' ? 'online' : undefined,
    details: {
      schema: [],
      rowCount: 1,
      lastUpdated: 'live',
      sampleRows: [{
        status: s.status,
        category: s.category,
        latency_ms: s.latency ?? 'n/a',
        version: s.version ?? 'n/a',
        docs: s.docsUrl,
      }],
    },
  };
}

function tableNodeFromRow(t: { table_name: string; row_count: number }): TreeNode {
  return {
    id: `sb-${t.table_name}`,
    name: t.table_name,
    type: 'table',
    count: `${t.row_count.toLocaleString()} rows`,
    details: { ...EMPTY_DETAIL, rowCount: t.row_count },
  };
}

async function buildLiveExplorerTree(): Promise<TreeNode> {
  const [tables, mcpServers] = await Promise.all([
    sbListTables().catch(() => [] as Array<{ table_name: string; row_count: number }>),
    loadMcpServers().catch(() => [] as Awaited<ReturnType<typeof loadMcpServers>>),
  ]);

  const supabaseNode: TreeNode = {
    id: 'supabase',
    name: 'Supabase',
    type: 'category',
    status: tables.length > 0 ? 'online' : undefined,
    count: `${tables.length} tables`,
    children: [...tables].sort((a, b) => b.row_count - a.row_count).map(tableNodeFromRow),
  };

  const mcpNode: TreeNode = {
    id: 'mcp',
    name: 'MCP Servers',
    type: 'category',
    status: mcpServers.some(s => s.status === 'online') ? 'active' : undefined,
    count: `${mcpServers.length} registered`,
    children: mcpServers.map(mcpNodeFromServer),
  };

  return {
    id: 'root',
    name: 'AXE Memory',
    type: 'root',
    children: [supabaseNode, mcpNode, loadLocalStorageNode()],
  };
}

const typeIcons: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  root: Database,
  category: FolderOpen,
  schema: Folder,
  table: Table2,
  bucket: FileBox,
  store: HardDrive,
  service: Cloud,
  server: Server,
};

function TypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const Icon = typeIcons[type] || Database;
  const colorMap: Record<string, string> = {
    root: 'var(--accent-cyan)',
    category: '#3B82F6',
    schema: '#8B9DBF',
    table: 'var(--success)',
    bucket: 'var(--warning)',
    store: '#A855F7',
    service: '#F48120',
    server: '#EC4899',
  };
  return <Icon size={size} color={colorMap[type] || '#8B9DBF'} />;
}

type TreePatch = {
  [id: string]: {
    count?: string;
    status?: string;
    rowCount?: number;
    sampleRows?: Record<string, string | number | boolean | null>[];
    lastUpdated?: string;
  };
};

function applyTreePatch(node: TreeNode, patch: TreePatch): TreeNode {
  const next: TreeNode = {
    ...node,
    ...(patch[node.id]?.count ? { count: patch[node.id].count } : {}),
    ...(patch[node.id]?.status ? { status: patch[node.id].status } : {}),
    ...(node.details
      ? {
          details: {
            ...node.details,
            ...(typeof patch[node.id]?.rowCount === 'number' ? { rowCount: patch[node.id]!.rowCount! } : {}),
            ...(patch[node.id]?.sampleRows ? { sampleRows: patch[node.id]!.sampleRows! } : {}),
            ...(patch[node.id]?.lastUpdated ? { lastUpdated: patch[node.id]!.lastUpdated! } : {}),
          },
        }
      : {}),
  };
  if (node.children) {
    next.children = node.children.map(child => applyTreePatch(child, patch));
  }
  return next;
}

function findNodeById(node: TreeNode, id: string): TreeNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  expandedIds,
  onToggleExpand,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isLeafTable = node.type === 'table' || node.type === 'bucket' || node.type === 'store' || node.type === 'service' || node.type === 'server';

  return (
    <div>
      <motion.div
        className="flex items-center gap-2 py-1.5 pr-3 rounded-lg cursor-pointer transition-colors select-none"
        style={{
          paddingLeft: `${depth * 18 + 8}px`,
          background: 'transparent', fontWeight: isSelected ? 600 : 500,
          border: isSelected ? '1px solid rgba(34,211,238,0.15)' : '1px solid transparent',
        }}
        onClick={() => {
          if (hasChildren) onToggleExpand(node.id);
          if (node.details) onSelect(node);
        }}
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      >
        {hasChildren ? (
          <span className="flex items-center justify-center" style={{ width: '14px', height: '14px' }}>
            {isExpanded ? (
              <ChevronDown size={12} color="var(--text-muted)" />
            ) : (
              <ChevronRight size={12} color="var(--text-muted)" />
            )}
          </span>
        ) : (
          <span style={{ width: '14px' }} />
        )}

        <TypeIcon type={node.type} />

        <span
          className="text-body flex-1 truncate"
          style={{ color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)', fontSize: '13px' }}
        >
          {node.name}
        </span>

        {node.count && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
                            color: isLeafTable ? 'var(--success)' : 'var(--accent-blue)',
            }}
          >
            {node.count}
          </span>
        )}

        {node.status && (
          <span className="flex items-center gap-1">
            <span
              className="rounded-full"
              style={{
                width: '6px',
                height: '6px',
                backgroundColor: node.status === 'online' || node.status === 'active' ? 'var(--success)' : '#6B7280',
              }}
            />
          </span>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="relative">
              <div
                className="absolute"
                style={{
                  left: `${depth * 18 + 15}px`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
              />
              {node.children!.map((child) => (
                <TreeItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const IMPORTANCE_COLORS = ['', '#ef4444','#f97316','#eab308','#84cc16','#22c55e','#10b981','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];

function CoreMemoryPanel({ openId, onConsumeOpenId }: { openId: string | null; onConsumeOpenId: () => void }) {
  const [memories, setMemories] = useState<CoreMemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [importance, setImportance] = useState(5);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const connected = isSupabaseConnected();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const reload = async () => {
    setLoading(true);
    // Unified stream → show as core entries so Memory tab matches brain/terrain
    const unified = await loadUnifiedMemory(80).catch(() => []);
    const asCore = unified.map((u) => ({
      id: u.id,
      content: u.content,
      tags: [...(u.tags || []), u.layer],
      importance: u.importance,
      source: u.source,
      created_at: u.created_at,
    }));
    // Prefer unified; if empty fall back to pure core
    if (asCore.length) setMemories(asCore);
    else setMemories(await loadMemories(60));
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (!openId || loading) return;
    const entry = memories.find(m => m.id === openId);
    if (!entry) return;
    setHighlightedId(openId);
    requestAnimationFrame(() => {
      entryRefs.current[openId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    onConsumeOpenId();
    const timer = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading, memories]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    const entry = await saveMemory(content.trim(), tags, importance, 'manual');
    if (entry) setMemories(prev => [entry, ...prev]);
    setContent(''); setTagsInput(''); setImportance(5); setShowAdd(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="rounded-2xl flex items-center justify-center" style={{ width: 64, height: 64, border: '1px solid var(--border-subtle)' }}>
          <AlertCircle size={28} color="#ef4444" />
        </div>
        <div className="text-center">
          <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Supabase not connected</p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Go to <a href="/settings" style={{ color: 'var(--accent-cyan)' }}>Settings</a> and enter your Supabase URL + anon key.<br />
            Core Memory works automatically after that.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Brain size={15} color="var(--accent-cyan)" />
          <span className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>Core Memory</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--accent-cyan)' }}>
            {memories.length} entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} disabled={loading} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            title="Refresh">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setShowAdd(v => !v); setTimeout(() => textRef.current?.focus(), 50); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <Plus size={11} />Add
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 overflow-hidden" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div className="p-4 space-y-3">
              <textarea ref={textRef} value={content} onChange={e => setContent(e.target.value)} placeholder="What should AXE remember?" rows={3}
                className="w-full rounded-lg text-[12px] p-3 resize-none outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Tag size={10} color="var(--text-muted)" />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Tags (komma-gescheiden)</span>
                  </div>
                  <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="trading, system, config"
                    className="w-full rounded-lg text-[11px] px-3 py-2 outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Importance: <span style={{ color: IMPORTANCE_COLORS[importance] }}>{importance}</span></div>
                  <input type="range" min={1} max={10} value={importance} onChange={e => setImportance(Number(e.target.value))} className="w-24" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg text-[11px]" style={{ color: 'var(--text-muted)' }}>Annuleer</button>
                <button onClick={handleSave} disabled={saving || !content.trim()}
                  className="px-4 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{ background: saving ? 'rgba(34,211,238,0.06)' : 'rgba(34,211,238,0.15)', color: 'var(--accent-cyan)' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && memories.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={16} className="animate-spin" color="var(--text-muted)" />
          </div>
        )}
        {!loading && memories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Brain size={24} color="rgba(34,211,238,0.3)" />
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No core memories visible yet.<br/>New chats land here automatically (tag: auto). Open Settings if Supabase stays empty.</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {memories.map(m => (
            <motion.div key={m.id} ref={el => { entryRefs.current[m.id] = el; }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
              className="rounded-xl p-3.5 group"
              style={{
                background: 'var(--bg-surface)',
                border: highlightedId === m.id ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                boxShadow: highlightedId === m.id ? '0 0 0 2px rgba(34,211,238,0.3)' : undefined,
              }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] leading-relaxed flex-1" style={{ color: 'var(--text-primary)' }}>{m.content}</p>
                <button onClick={() => handleDelete(m.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded" style={{ color: 'var(--text-muted)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {m.tags?.map(t => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color: '#60a5fa' }}>{t}</span>
                ))}
                <span className="text-[9px] font-mono ml-auto" style={{ color: IMPORTANCE_COLORS[m.importance] || 'var(--text-muted)' }}>
                  ★{m.importance}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {new Date(m.created_at).toLocaleDateString('en-US')}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{m.source}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface GlobalMemCacheEntry {
  id?: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  updated_at?: string;
  created_at?: string;
}

interface SharedMemEntry {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: number;
  type: string;
}

const AGENT_COLORS: Record<string, string> = {
  kimiclaw: 'var(--warning)',
  kimicode: 'var(--success)',
  kimiwork: '#8B5CF6',
};

function LiveMemoryPanel() {
  const [globalMem, setGlobalMem] = useState<GlobalMemCacheEntry[]>([]);
  const [sharedMem, setSharedMem] = useState<SharedMemEntry[]>([]);
  const [activeSection, setActiveSection] = useState<'global' | 'shared'>('global');
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const sb = getSupabase();
      let globalEntries: GlobalMemoryEntry[] = [];
      if (sb) {
        try {
          const uid = await currentUserId(sb);
          if (uid) {
            globalEntries = await loadGlobalMemories(uid, undefined, 60);
          }
        } catch { /* fall through */ }
      }
      if (globalEntries.length === 0) {
        try {
          const raw = localStorage.getItem('axe_global_memory_cache');
          globalEntries = raw ? (JSON.parse(raw) as GlobalMemoryEntry[]).slice(0, 60) : [];
        } catch { /* ignore */ }
      }
      setGlobalMem(globalEntries as GlobalMemCacheEntry[]);

      // THE SHARED LANE IS `memory` UNDER agent='global', NOT shared_memory.
      //
      // This read `shared_memory` via queryMemory. Measured 2026-08-27: that
      // table has never held a single row and nothing in the app writes to it —
      // the two apparent callers of setMemory are React state setters that
      // happen to share the name. So the section was permanently empty under a
      // caption promising "agents write insights here automatically", which is
      // the one thing it could not have been doing.
      //
      // The shared lane does exist, one table over: `memory` with agent
      // 'global' held 6 163 rows on the same day — the handoffs Intel and
      // Companion write for each other. See the memory model (M1).
      let sharedEntries: SharedMemEntry[] = [];
      try {
        // null is the shared lane: recall always fetches agent='global', and
        // passing no agent means that is all it fetches.
        const rows = await recall(null, { limit: 60 });
        sharedEntries = rows.map(r => ({
          id: r.id,
          agentId: r.source ?? 'global',
          agentName: (r.source ?? 'Shared').replace(/^axe_/, '').replace(/^./, c => c.toUpperCase()),
          content: r.content,
          timestamp: new Date(r.created_at).getTime(),
          type: r.kind ?? 'fact',
        }));
      } catch { /* fall through to the local cache below */ }
      if (sharedEntries.length === 0) {
        try {
          const raw = localStorage.getItem('axe_shared_memory');
          sharedEntries = raw ? (JSON.parse(raw) as SharedMemEntry[]).slice(0, 60) : [];
        } catch { /* ignore */ }
      }
      setSharedMem(sharedEntries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const sectionBtn = (id: 'global' | 'shared', label: string, count: number) => (
    <button
      onClick={() => setActiveSection(id)}
      className="px-3 py-1 rounded-lg text-[11px] font-medium transition-colors"
      style={{
        background: 'rgba(255,255,255,0.04)', fontWeight: activeSection === id ? 600 : 500,
        color: activeSection === id ? 'var(--accent-cyan)' : 'var(--text-muted)',
        border: activeSection === id ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent',
      }}
    >
      {label} <span className="opacity-60">({count})</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Brain size={15} color="var(--accent-cyan)" />
          <span className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>AI Memory</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--accent-cyan)' }}>
            live
          </span>
        </div>
        <button onClick={() => void reload()} disabled={loading} className="p-1.5 rounded-lg transition-opacity" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', opacity: loading ? 0.4 : 1 }} title="Refresh">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {sectionBtn('global', '🌐 Global Memory', globalMem.length)}
        {sectionBtn('shared', '🤝 Agent Shared', sharedMem.length)}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activeSection === 'global' && (
          <>
            {globalMem.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Brain size={24} color="rgba(34,211,238,0.2)" />
                <p className="text-[12px] text-center" style={{ color: 'var(--text-muted)' }}>
                  No global memory yet.<br />Send a message to an agent to get started.
                </p>
              </div>
            ) : globalMem.map((m, i) => {
              let parsedVal: { q?: string; a?: string; provider?: string } | null = null;
              try { parsedVal = JSON.parse(m.value); } catch { /* raw string */ }
              return (
                <div key={m.id ?? i} className="rounded-lg px-3 py-2 space-y-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--accent-cyan)' }}>
                      {m.category}
                    </span>
                    <div className="flex items-center gap-2">
                      {parsedVal?.provider && (
                        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{parsedVal.provider}</span>
                      )}
                      <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {Math.round(m.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  {parsedVal?.q && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Q: </span>{parsedVal.q.slice(0, 100)}
                    </p>
                  )}
                  {parsedVal?.a ? (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      <span>A: </span>{parsedVal.a.slice(0, 120)}…
                    </p>
                  ) : !parsedVal && (
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{m.value.slice(0, 180)}</p>
                  )}
                  <p className="text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>{m.key}</p>
                </div>
              );
            })}
          </>
        )}

        {activeSection === 'shared' && (
          <>
            {sharedMem.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Brain size={24} color="rgba(139,92,246,0.2)" />
                <p className="text-[12px] text-center" style={{ color: 'var(--text-muted)' }}>
                  No shared memories yet.<br />Intel and Companion write their handoffs here.
                </p>
              </div>
            ) : sharedMem.map(m => (
              <div key={m.id} className="rounded-lg px-3 py-2 space-y-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_COLORS[m.agentId] ?? '#6B7280' }} />
                    <span className="text-[10px] font-medium" style={{ color: AGENT_COLORS[m.agentId] ?? 'var(--text-secondary)' }}>{m.agentName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>{m.type}</span>
                    <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{m.content.slice(0, 200)}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const AGENTS_CFG = [
  { id: 'axe_core',      group: '__AXE__',         name: 'AXE Core',       icon: '⚡', color: 'var(--accent-cyan)', capability: 'all',        detail: 'Centrale AI-kern · Gemini Live interface'                             },
  { id: 'wags',          group: 'Specialists',    name: 'Wags',            icon: '🐺', color: 'var(--success)', capability: 'code',       detail: 'Developer Specialist · code, builds, patches'                         },
  { id: 'forge',         group: 'Specialists',    name: 'Forge',           icon: '🔨', color: '#F97316', capability: 'infra',      detail: 'Infrastructure · CI/CD, Docker, deployments'                          },
  { id: 'intel',         group: 'Specialists',    name: 'Intel',           icon: '🔍', color: '#3B82F6', capability: 'analysis',   detail: 'Research · web intelligence, OSINT'                                   },
  { id: 'nova',          group: 'Specialists',    name: 'Nova',            icon: '⭐', color: '#8B5CF6', capability: 'creative',   detail: 'Product Strategy · positioning, growth, competitors'                  },
  { id: 'atlas',         group: 'Specialists',    name: 'Atlas',           icon: '🗺️', color: '#EC4899', capability: 'privacy',  detail: 'Memory & Knowledge · context, vector search'                          },
  { id: 'dollar_bill',   group: 'Specialists',    name: 'Dollar Bill',     icon: '💰', color: '#EAB308', capability: 'finance',    detail: 'Finance & Trading · markets, P&L, risk'                              },
  { id: 'sentinel',      group: 'Specialists',    name: 'Sentinel',        icon: '🛡️', color: '#EF4444', capability: 'automation',detail: 'Automation · flows, triggers, integrations'                          },
  { id: 'pulse',         group: 'Specialists',    name: 'Pulse',           icon: '📡', color: '#84CC16', capability: 'monitoring', detail: 'Monitoring · uptime, logs, health checks'                            },
  { id: 'langgraph',     group: 'Orchestration',  name: 'LangGraph',       icon: '🔀', color: '#A78BFA', capability: 'all',        detail: 'StateGraph orchestrator · Branch A (local) / Branch B (cloud)'       },
  { id: 'crewai',        group: 'Orchestration',  name: 'CrewAI',          icon: '👥', color: '#06B6D4', capability: 'all',        detail: '9-agent crew · parallel specialist execution', providerId: 'crewai'   },
  { id: 'n8n',           group: 'Orchestration',  name: 'n8n',             icon: '⚙️', color: '#EA580C', capability: 'automation', detail: 'Workflow automation · webhooks, triggers, flows', providerId: 'n8n'  },
  { id: 'eve',           group: 'Orchestration',  name: 'EVE',             icon: '🌸', color: '#F472B6', capability: 'all',        detail: 'AI persona framework · injects system prompt supplements per slot'    },
  { id: 'openhands',     group: 'VPS Agents',     name: 'OpenHands',       icon: '🤲', color: '#34D399', capability: 'code',       detail: 'Autonomous coding & research agent', providerId: 'openhands'           },
  { id: 'openjarvis',    group: 'VPS Agents',     name: 'OpenJarvis',      icon: '🤖', color: '#60A5FA', capability: 'all',        detail: 'General-purpose VPS agent bridge', providerId: 'openjarvis'           },
  { id: 'openclaw',      group: 'VPS Agents',     name: 'OpenClaw',        icon: '🦀', color: '#FB923C', capability: 'analysis',   detail: 'Web intelligence · scraping, OSINT, deep research', providerId: 'openclaw' },
  { id: 'kilocode',      group: 'VPS Agents',     name: 'KiloCode',        icon: '💻', color: '#818CF8', capability: 'code',       detail: 'Branch B cloud gateway · routes to Anthropic/OpenAI/Gemini', providerId: 'kilocode' },
  { id: 'hermes',        group: 'VPS Agents',     name: 'Hermes Agent',    icon: '🪽', color: '#FCD34D', capability: 'analysis',   detail: 'Research agent · deep web analysis, intelligence', providerId: 'hermes' },
  { id: 'kimiclaw',      group: 'Kimi Suite',     name: 'KimiClaw',        icon: '🔎', color: '#2DD4BF', capability: 'analysis',   detail: 'Web search · scrape · deep research · /kimi/claw/*', providerId: 'kimiclaw' },
  { id: 'kimicode',      group: 'Kimi Suite',     name: 'KimiCode',        icon: '⌨️', color: '#4ADE80', capability: 'code',       detail: 'Code generate · review · debug · /kimi/code/*', providerId: 'kimicode'     },
  { id: 'kimiwork',      group: 'Kimi Suite',     name: 'KimiWork',        icon: '📄', color: '#A3E635', capability: 'analysis',   detail: 'Document summarization · entity extraction · /kimi/work/*', providerId: 'kimiwork' },
  { id: 'exa_search',    group: 'Tools',          name: 'EXA Search',      icon: '🌐', color: '#38BDF8', capability: 'analysis',   detail: 'Neural semantic search engine · real-time web', providerId: 'exa'      },
  { id: 'livekit',       group: 'Tools',          name: 'LiveKit',         icon: '🎙️', color: '#C084FC', capability: 'all',        detail: 'Real-time audio/video pipeline · Gemini Live voice'                  },
  { id: 'coding_agent',  group: 'Tools',          name: 'Coding Agent',    icon: '🛠️', color: '#F87171', capability: 'code',       detail: 'Specialized coding assistant · paired with Wags/Forge'               },
  { id: 'browser_agent', group: 'Tools',          name: 'Browser Agent',   icon: '🌍', color: '#FDBA74', capability: 'analysis',   detail: 'Autonomous browser control · CDP-based web automation'               },
  { id: 'p_ollama',      group: 'LLM Providers',  name: 'Ollama',          icon: '🦙', color: '#86EFAC', capability: 'all',        detail: 'Local VPS · gemma4 · deepseek-coder:6.7b · llama3.1:8b-32k · llama3 · mistral', providerId: 'ollama'    },
  { id: 'p_openai',      group: 'LLM Providers',  name: 'OpenAI',          icon: '🟢', color: '#4ADE80', capability: 'all',        detail: 'gpt-4o · gpt-4o-mini · gpt-4.1 · o1 · o3-mini', providerId: 'openai'                                        },
  { id: 'p_anthropic',   group: 'LLM Providers',  name: 'Anthropic',       icon: '🔶', color: '#FB923C', capability: 'all',        detail: 'claude-sonnet-5 · claude-opus-4-5 · claude-haiku-3-5', providerId: 'anthropic'                                 },
  { id: 'p_google',      group: 'LLM Providers',  name: 'Gemini',          icon: '💎', color: '#60A5FA', capability: 'all',        detail: 'gemini-2.5-pro · gemini-2.5-flash · gemini-2.5-flash-lite · Gemini Live', providerId: 'google'             },
  { id: 'p_groq',        group: 'LLM Providers',  name: 'Groq',            icon: '⚡', color: 'var(--warning)', capability: 'all',        detail: 'openai/gpt-oss-120b · groq/compound', providerId: 'groq'               },
  { id: 'p_openrouter',  group: 'LLM Providers',  name: 'OpenRouter',      icon: '🔄', color: '#C084FC', capability: 'all',        detail: 'openrouter/free (auto-router) · 100+ models aggregator', providerId: 'openrouter'                                 },
  { id: 'p_cerebras',    group: 'LLM Providers',  name: 'Cerebras',        icon: '⚡', color: '#F97316', capability: 'all',        detail: 'gpt-oss-120b · gemma-4-31b — free tier, ~3000 tok/s', providerId: 'cerebras'                                  },
] as const;

type AgentId = typeof AGENTS_CFG[number]['id'];

interface AgentConvEntry {
  id: string;
  key: string;
  value: string;
  created_at: string;
  agent_id: string;
}

/**
 * Prompt/skills/tools for one agent, read from and written to `public.agents`.
 *
 * Only agents seeded into that table (see agentRegistry.ts) have anything to
 * show here — most of AGENTS_CFG's ~27 entries are UI-only names with no
 * backing row, and this deliberately says so rather than rendering empty
 * fields that look editable but save nowhere.
 */
function AgentRegistryEditor({ agentId, accentColor }: { agentId: string; accentColor: string }) {
  const [record, setRecord] = useState<AgentRecord | null | undefined>(undefined); // undefined = loading
  const [prompt, setPrompt] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [toolsText, setToolsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setRecord(undefined);
    void (async () => {
      await ensureAgentsSeeded();
      const all = await loadAgents().catch(() => [] as AgentRecord[]);
      if (!alive) return;
      const rec = all.find(a => a.id === agentId) ?? null;
      setRecord(rec);
      setPrompt(rec?.system_prompt ?? '');
      setSkillsText((rec?.skills ?? []).join(', '));
      setToolsText((rec?.tools ?? []).join(', '));
    })();
    return () => { alive = false; };
  }, [agentId]);

  if (record === undefined) return null;
  if (record === null) {
    return (
      <section>
        <p className="text-[11px] uppercase tracking-[0.12em] mb-2 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Register
        </p>
        <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
          This name is not in the agent registry — no prompt/skills/tools of its own to edit.
        </p>
      </section>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await updateAgent(agentId, {
        system_prompt: prompt.trim() || null,
        skills: skillsText.split(',').map(s => s.trim()).filter(Boolean),
        tools: toolsText.split(',').map(s => s.trim()).filter(Boolean),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.12em] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Prompt · Skills · Tools
        </p>
        <span
          className="text-[9px] px-2 py-0.5 rounded-full font-medium"
          style={{
            background: record.status === 'active' ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.06)',
            color: record.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
          }}
        >
          {record.status === 'active' ? 'actief' : 'nog te bouwen'}
        </span>
      </div>
      {record.description && (
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>{record.description}</p>
      )}
      <div className="space-y-2.5">
        <div>
          <label className="text-[10px] font-mono block mb-1" style={{ color: 'var(--text-muted)' }}>System prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="(no custom prompt set)"
            className="w-full rounded-lg px-3 py-2 text-[12px] resize-y"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          />
        </div>
        <div>
          <label className="text-[10px] font-mono block mb-1" style={{ color: 'var(--text-muted)' }}>Skills (komma-gescheiden)</label>
          <input
            value={skillsText}
            onChange={e => setSkillsText(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[12px]"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          />
        </div>
        <div>
          <label className="text-[10px] font-mono block mb-1" style={{ color: 'var(--text-muted)' }}>Tools (komma-gescheiden)</label>
          <input
            value={toolsText}
            onChange={e => setToolsText(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[12px]"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={saving}
          className="text-[11px] font-medium px-3 py-1.5 rounded-lg"
          style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}40`, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </section>
  );
}

function AgentMemoryPanel() {
  const voice = useVoiceStore();
  const [selected, setSelected] = useState<AgentId>('axe_core');
  const [allMems, setAllMems] = useState<CoreMemoryEntry[]>([]);
  const [agentConvMems, setAgentConvMems] = useState<AgentConvEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [teaching, setTeaching] = useState('');
  const [saving, setSaving] = useState(false);
  const connected = isSupabaseConnected();

  const reload = async () => {
    if (!connected) return;
    setLoading(true);
    const all = await loadMemories(200).catch(() => [] as CoreMemoryEntry[]);
    setAllMems(all);
    // Through the API rather than the browser's anon client: agent_memory is
    // not anon-readable, so this silently returned nothing and the panel
    // looked empty even once the table had rows.
    try {
      const rows = await sbGetRows<AgentConvEntry>('agent_memory', {
        limit: 200, orderBy: 'created_at', orderDir: 'desc',
      });
      setAgentConvMems(rows);
    } catch (err) {
      console.error('[Memory] agent_memory read failed:', err);
    }
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const agent = AGENTS_CFG.find(a => a.id === selected)!;

  const agentMems = useMemo(() =>
    allMems.filter(m =>
      m.tags?.includes(agent.id) ||
      m.tags?.includes(agent.name.toLowerCase()) ||
      m.tags?.includes(`agent:${agent.id}`)
    ),
    [allMems, agent.id, agent.name]
  );

  const agentAutoMems = useMemo(() => {
    if (agent.capability === 'all') return agentConvMems.slice(0, 20);
    return agentConvMems.filter(m => m.agent_id === agent.capability).slice(0, 20);
  }, [agentConvMems, agent.capability]);

  const agentProviderId = (agent as { providerId?: string }).providerId;

  const routeCount = useMemo(() => {
    if (agentProviderId) return voice.routingLog.filter(e => e.winner === agentProviderId).length;
    return voice.routingLog.filter(e => agent.capability === 'all' || e.capability === agent.capability).length;
  }, [voice.routingLog, agent.capability, agentProviderId]);

  const agentMessages = useMemo(() => {
    if (agentProviderId) {
      return voice.conversation
        .filter(m => m.role === 'axe' && m.provider === agentProviderId)
        .slice(-8);
    }
    if (agent.capability === 'all') return voice.conversation.filter(m => m.role === 'axe').slice(-8);
    const matchedProviders = new Set<string>();
    for (const evt of voice.routingLog) {
      if (evt.capability === agent.capability && evt.winner) matchedProviders.add(evt.winner);
    }
    return voice.conversation
      .filter(m => m.role === 'axe' && m.provider && matchedProviders.has(m.provider))
      .slice(-6);
  }, [voice.conversation, voice.routingLog, agent.capability, agentProviderId]);

  const handleTeach = async () => {
    if (!teaching.trim()) return;
    setSaving(true);
    const entry = await saveMemory(teaching.trim(), [agent.id, `agent:${agent.id}`, agent.capability], 7, 'manual');
    if (entry) setAllMems(prev => [entry, ...prev]);
    setTeaching('');
    setSaving(false);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: agent list — slightly wider, more vertical rhythm */}
      <div className="w-[220px] flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        {(() => {
          const axe = AGENTS_CFG.find(a => a.id === 'axe_core')!;
          const rest = AGENTS_CFG.filter(a => a.id !== 'axe_core');
          const axeCnt = allMems.filter(m => m.tags?.includes('axe_core') || m.tags?.includes('agent:axe_core')).length;
          const axeRoutes = voice.routingLog.length;
          const axeActive = selected === 'axe_core';

          const nodes: ReactNode[] = [];

          nodes.push(
            <div key="axe-hero" className="p-3">
              <button onClick={() => setSelected('axe_core')}
                className="w-full rounded-xl px-3 py-3 text-left transition-all"
                style={{
                  background: axeActive ? `${axe.color}18` : `${axe.color}08`,
                  border: `1px solid ${axeActive ? axe.color : `${axe.color}35`}`,
                  boxShadow: axeActive ? `0 0 16px ${axe.color}28` : 'none',
                }}>
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex items-center justify-center rounded-lg text-[20px] flex-shrink-0"
                    style={{ width: 36, height: 36, background: `${axe.color}20`, border: `1px solid ${axe.color}40` }}
                  >
                    {axe.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold" style={{ color: axe.color }}>{axe.name}</div>
                    <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      hoofd AI · {axeRoutes} routes · {axeCnt} mems
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
          nodes.push(
            <div key="axe-divider" className="mx-3 mb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }} />
          );

          let lastGroup = '';
          for (const a of rest) {
            if (a.group !== lastGroup) {
              lastGroup = a.group;
              nodes.push(
                <div key={`grp-${a.group}`} className="px-3 pt-4 pb-1.5 text-[9px] uppercase tracking-[0.14em] font-semibold"
                  style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {a.group}
                </div>
              );
            }
            const isActive = selected === a.id;
            const pid = (a as { providerId?: string }).providerId;
            const cnt = allMems.filter(m => m.tags?.includes(a.id) || m.tags?.includes(`agent:${a.id}`)).length;
            const routes = pid
              ? voice.routingLog.filter(e => e.winner === pid).length
              : voice.routingLog.filter(e => a.capability === 'all' || e.capability === a.capability).length;
            nodes.push(
              <button key={a.id} onClick={() => setSelected(a.id as AgentId)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                style={{ background: isActive ? `${a.color}14` : 'transparent', borderLeft: isActive ? `2px solid ${a.color}` : '2px solid transparent' }}>
                <span className="text-[15px] flex-shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate" style={{ color: isActive ? a.color : 'var(--text-secondary)' }}>{a.name}</div>
                  <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>{routes} routes · {cnt} mems</div>
                </div>
              </button>
            );
          }
          return nodes;
        })()}
      </div>

      {/* Right: agent detail */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Hero header */}
        <div
          className="flex items-start justify-between px-6 py-5 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            background: `linear-gradient(135deg, ${agent.color}12 0%, transparent 55%)`,
          }}
        >
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div
              className="flex items-center justify-center rounded-2xl text-[28px] flex-shrink-0"
              style={{
                width: 56,
                height: 56,
                background: `${agent.color}18`,
                border: `1px solid ${agent.color}45`,
                boxShadow: `0 0 24px ${agent.color}22`,
              }}
            >
              {agent.icon}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-[16px] tracking-tight" style={{ color: agent.color }}>{agent.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${agent.color}16`, color: agent.color, border: `1px solid ${agent.color}30` }}>
                  {agent.group === '__AXE__' ? 'Hoofd AI' : agent.group}
                </span>
              </div>
              {(agent as { detail?: string }).detail && (
                <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {(agent as { detail?: string }).detail}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2.5">
                <span className="text-[10px] font-mono px-2 py-1 rounded-md" style={{ color: 'var(--accent-cyan)' }}>
                  {routeCount} routes
                </span>
                <span className="text-[10px] font-mono px-2 py-1 rounded-md" style={{ background: `${agent.color}14`, color: agent.color }}>
                  {agentMems.length} memories
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => void reload()} disabled={loading}
            className="p-2 rounded-lg ml-3 flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', opacity: loading ? 0.4 : 1 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          <AgentRegistryEditor agentId={agent.id} accentColor={agent.color} />

          <section>
            <p className="text-[11px] uppercase tracking-[0.12em] mb-3 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Recente antwoorden deze sessie ({agentMessages.length})
            </p>
            {agentMessages.length === 0 ? (
              <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
                {agent.capability === 'all' ? 'No messages in this session yet.' : `No ${agent.capability} questions asked yet.`}
              </p>
            ) : (
              <div className="space-y-3">
                {agentMessages.map((m, i) => (
                  <div key={i} className="rounded-xl p-3.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[13px]">{agent.icon}</span>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {m.provider ?? agent.name} · {new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {m.text.slice(0, 300)}{m.text.length > 300 ? '…' : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="text-[11px] uppercase tracking-[0.12em] mb-3 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Teach {agent.name} something new
            </p>
            <div className="flex gap-2">
              <input value={teaching} onChange={e => setTeaching(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleTeach(); }}
                placeholder={`Bijv. ${agent.name} moet altijd …`}
                className="flex-1 rounded-lg text-[12px] px-3.5 py-2.5 outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              <button onClick={() => void handleTeach()} disabled={saving || !teaching.trim()}
                className="px-4 py-2.5 rounded-lg text-[12px] font-medium"
                style={{ background: saving ? 'rgba(34,211,238,0.06)' : `${agent.color}22`, color: agent.color }}>
                {saving ? '…' : 'Teach'}
              </button>
            </div>
          </section>

          {agentAutoMems.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-[0.12em] mb-3 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Automatisch geregistreerd gesprek ({agentAutoMems.length})
              </p>
              <div className="space-y-3">
                {agentAutoMems.map(m => {
                  let parsed: { q?: string; a?: string; provider?: string } = {};
                  try { parsed = JSON.parse(m.value); } catch { /* raw */ }
                  return (
                    <div key={m.id} className="rounded-xl p-3.5 space-y-1.5" style={{ background: 'var(--bg-base)', border: `1px solid ${agent.color}22` }}>
                      {parsed.q && (
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--text-muted)' }}>V: </span>{parsed.q}
                        </p>
                      )}
                      {parsed.a && (
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          <span>A: </span>{parsed.a.slice(0, 200)}{parsed.a.length > 200 ? '…' : ''}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-0.5">
                        {parsed.provider && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: `${agent.color}15`, color: agent.color }}>{parsed.provider}</span>
                        )}
                        <span className="text-[9px] ml-auto font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                          {new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <p className="text-[11px] uppercase tracking-[0.12em] mb-3 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Handmatige herinneringen ({agentMems.length})
            </p>
            {!connected ? (
              <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>Supabase not connected.</p>
            ) : loading ? (
              <RefreshCw size={14} className="animate-spin" color="var(--text-muted)" />
            ) : agentMems.length === 0 ? (
              <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
                No manual memories yet. Use "Teach" above to add one.
              </p>
            ) : (
              <div className="space-y-3">
                {agentMems.map(m => (
                  <div key={m.id} className="rounded-xl p-3.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                    <p className="text-[12px] leading-relaxed mb-2.5" style={{ color: 'var(--text-secondary)' }}>{m.content}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {m.tags?.filter(t => !t.startsWith('agent:') && t !== agent.id).map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background: `${agent.color}18`, color: agent.color }}>{t}</span>
                      ))}
                      <span className="text-[9px] ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
                        ★{m.importance}/10
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function Memory() {
  type MemoryTab = 'explorer' | 'core-memory' | 'ai-memory' | 'agents';
  const [activeTab, setActiveTab] = useState<MemoryTab>('ai-memory');

  // The tab is remembered rather than resetting to AI Memory on every visit:
  // these are different lenses on the same store, and which one you want is a
  // standing preference. saveSetting now persists durably, so the choice
  // survives a reload and follows the account rather than the browser.
  const TAB_SETTING_KEY = 'memory.activeTab';
  useEffect(() => {
    let cancelled = false;
    void loadSetting<MemoryTab>(TAB_SETTING_KEY, 'ai-memory').then(saved => {
      if (!cancelled && saved) setActiveTab(saved);
    });
    return () => { cancelled = true; };
  }, []);

  const selectTab = (id: MemoryTab) => {
    setActiveTab(id);
    void saveSetting(TAB_SETTING_KEY, id);
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [treeState, setTreeState] = useState<TreeNode>({ id: 'root', name: 'AXE Memory', type: 'root', children: [] });
  const [treeLoading, setTreeLoading] = useState(true);
  const [loadingTableId, setLoadingTableId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['root', 'supabase', 'mcp', 'local'])
  );

  const refreshTree = async () => {
    setTreeLoading(true);
    const tree = await buildLiveExplorerTree();
    setTreeState(tree);
    setTreeLoading(false);
  };

  useEffect(() => { void refreshTree(); }, []);

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadTableDetail = async (node: TreeNode) => {
    if (!node.id.startsWith('sb-') || node.details!.schema.length > 0) return;
    const tableName = node.name;
    setLoadingTableId(node.id);
    try {
      const rows = await sbGetRows(tableName, { limit: 5 });
      const schema = rows[0]
        ? Object.entries(rows[0]).map(([column, val]) => ({
            column,
            type: val === null ? 'unknown' : Array.isArray(val) ? 'array' : typeof val === 'object' ? 'json' : typeof val,
            nullable: val === null,
          }))
        : [];
      const patch: TreePatch = {
        [node.id]: {
          sampleRows: rows as Record<string, string | number | boolean | null>[],
          lastUpdated: new Date().toISOString(),
        },
      };
      setTreeState(prev => {
        const next = applyTreePatch(prev, patch);
        const withSchema = (n: TreeNode): TreeNode => {
          if (n.id === node.id && n.details) return { ...n, details: { ...n.details, schema } };
          return n.children ? { ...n, children: n.children.map(withSchema) } : n;
        };
        const patched = withSchema(next);
        const found = findNodeById(patched, node.id);
        if (found) setSelectedNode(found);
        return patched;
      });
    } catch { /* leave EMPTY_DETAIL */ }
    finally { setLoadingTableId(null); }
  };

  const handleSelect = (node: TreeNode) => {
    setSelectedId(node.id);
    setSelectedNode(node);
    void loadTableDetail(node);
  };

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: HUD_BASE_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {([
          { id: 'agents',      label: '🤖 Agents' },
          { id: 'ai-memory',   label: '🌐 AI Memory' },
          { id: 'core-memory', label: '🧠 Core Memory' },
          { id: 'explorer',    label: '🗄️ DB Explorer' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            className="relative px-4 py-2 text-[12px] font-medium transition-colors rounded-t-lg"
            style={{
              color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
              background: 'transparent', fontWeight: activeTab === tab.id ? 600 : 500,
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'agents' ? (
        <div className="flex-1 overflow-y-auto">
          {/* Boven het geheugen zelf: leert er ook iets van? Een agent kan
              schrijven zonder ooit iets te versterken, en dan staat er wel
              van alles maar verandert er niets. */}
          <div className="mb-4"><LearningLoopPanel /></div>
          <AgentMemoryPanel />
        </div>
      ) : activeTab === 'ai-memory' ? (
        <div className="flex-1 overflow-hidden">
          <LiveMemoryPanel />
        </div>
      ) : activeTab === 'core-memory' ? (
        <div className="flex-1 overflow-hidden">
          <CoreMemoryPanel
            openId={openId}
            onConsumeOpenId={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('open');
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden">
        <div
        className="w-full xl:w-[380px] flex-shrink-0 overflow-y-visible xl:overflow-y-auto"
        style={{
          borderRight: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div
          className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>
              Memory Center
            </h1>
            <p className="text-xs-custom mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Live Supabase tables · MCP registry · Local Storage
            </p>
          </div>
          <button
            onClick={() => void refreshTree()}
            disabled={treeLoading}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded"
            style={{ color: 'var(--accent-cyan)', opacity: treeLoading ? 0.6 : 1 }}
          >
            <RefreshCw size={11} className={treeLoading ? 'animate-spin' : ''} />
            {treeLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="p-2">
          <TreeItem
            node={treeState}
            depth={0}
            selectedId={selectedId}
            onSelect={handleSelect}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
          />
        </div>
      </div>

      <div
        className="flex-1 min-w-0 overflow-y-visible xl:overflow-y-auto p-4 sm:p-6"
        style={HUD_DOT_GRID_STYLE}
      >
        {selectedNode && selectedNode.details ? (
          <motion.div
            key={selectedNode.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                className="rounded-lg flex items-center justify-center"
                style={{
                  width: '44px',
                  height: '44px',
                  border: '1px solid rgba(34,211,238,0.15)',
                }}
              >
                <TypeIcon type={selectedNode.type} size={20} />
              </div>
              <div>
                <h2 className="text-section-title font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {selectedNode.name}
                </h2>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs-custom capitalize" style={{ color: 'var(--text-muted)' }}>
                    {selectedNode.type}
                  </span>
                  {selectedNode.count && (
                    <span className="text-xs-custom font-mono" style={{ color: 'var(--accent-cyan)' }}>
                      {selectedNode.count}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className={cn(LIST_GRID, 'mb-6')}>
              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Hash size={12} color="var(--text-muted)" />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Rows</span>
                </div>
                <span className="font-mono-data text-mono-lg" style={{ color: 'var(--text-primary)' }}>
                  {selectedNode.details.rowCount.toLocaleString()}
                </span>
              </div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Columns3 size={12} color="var(--text-muted)" />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Columns</span>
                </div>
                <span className="font-mono-data text-mono-lg" style={{ color: 'var(--text-primary)' }}>
                  {selectedNode.details.schema.length}
                </span>
              </div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={12} color="var(--text-muted)" />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Updated</span>
                </div>
                <span className="font-mono-data text-xs-custom" style={{ color: 'var(--text-primary)' }}>
                  {selectedNode.details.lastUpdated.split(' ')[0]}
                </span>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden mb-6" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <Columns3 size={14} color="var(--accent-cyan)" />
                <span className="text-body font-medium" style={{ color: 'var(--text-primary)' }}>Schema</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>Column</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>Type</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>Nullable</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedNode.details.schema.map((col, i) => (
                    <tr key={col.column} style={{ borderBottom: i < selectedNode.details!.schema.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                      <td className="px-4 py-2 text-xs-custom font-mono" style={{ color: 'var(--text-primary)' }}>{col.column}</td>
                      <td className="px-4 py-2 text-xs-custom font-mono" style={{ color: 'var(--accent-cyan)' }}>{col.type}</td>
                      <td className="px-4 py-2 text-xs-custom" style={{ color: col.nullable ? 'var(--text-muted)' : 'var(--success)' }}>{col.nullable ? 'YES' : 'NO'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <Calendar size={14} color="var(--accent-cyan)" />
                <span className="text-body font-medium" style={{ color: 'var(--text-primary)' }}>Sample Data</span>
                {loadingTableId === selectedNode.id ? (
                  <span className="flex items-center gap-1.5 text-[10px] ml-auto" style={{ color: 'var(--accent-cyan)' }}>
                    <RefreshCw size={10} className="animate-spin" /> Fetching live rows…
                  </span>
                ) : (
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                    Last updated: {selectedNode.details.lastUpdated}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                {selectedNode.details.sampleRows.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Object.keys(selectedNode.details.sampleRows[0]).map((key) => (
                          <th key={key} className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNode.details.sampleRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: i < selectedNode.details!.sampleRows.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-4 py-2 text-xs-custom font-mono truncate max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
                              {String(val).length > 30 ? String(val).slice(0, 30) + '...' : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-6 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    No live sample rows available for this node yet.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full" style={{ minHeight: '400px' }}>
            <div
              className="rounded-2xl flex items-center justify-center mb-4"
              style={{
                width: '64px',
                height: '64px',
                border: '1px solid rgba(34,211,238,0.1)',
              }}
            >
              <Database size={28} color="rgba(34,211,238,0.4)" />
            </div>
            <p className="text-body font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Select a table or storage item
            </p>
            <p className="text-xs-custom text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
              Click on any table, bucket, or store in the tree to view its schema, row count, and sample data.
            </p>
          </div>
        )}
      </div>
        </div>
      )}
    </motion.div>
  );
}
