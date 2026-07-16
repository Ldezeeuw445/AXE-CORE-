import { useState, useEffect, useRef } from 'react';
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
  loadLogs,
  saveMemory,
  deleteMemory,
  isSupabaseConnected,
} from '@/services/coreDB';
import { loadMcpServers } from '@/services/mcpRegistryService';
import type { CoreMemoryEntry } from '@/services/coreDB';

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

/* ------------------------------------------------------------------ */
/*  TREE DATA                                                          */
/* ------------------------------------------------------------------ */

const treeData: TreeNode = {
  id: 'root',
  name: 'AXE Memory',
  type: 'root',
  children: [
    {
      id: 'supabase',
      name: 'Supabase',
      type: 'category',
      status: 'online',
      children: [
        {
          id: 'supabase-auth',
          name: 'auth',
          type: 'schema',
          children: [
            {
              id: 'users',
              name: 'users',
              type: 'table',
              // live count via VPS API
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'email', type: 'text', nullable: false },
                  { column: 'created_at', type: 'timestamp', nullable: false },
                  { column: 'last_sign_in', type: 'timestamp', nullable: true },
                  { column: 'metadata', type: 'jsonb', nullable: true },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
            {
              id: 'sessions',
              name: 'sessions',
              type: 'table',
              // live count via VPS API
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'user_id', type: 'uuid', nullable: false },
                  { column: 'token', type: 'text', nullable: false },
                  { column: 'expires_at', type: 'timestamp', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
          ],
        },
        {
          id: 'supabase-public',
          name: 'public',
          type: 'schema',
          children: [
            {
              id: 'agents',
              name: 'agents',
              type: 'table',
              // live count via VPS API
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'name', type: 'text', nullable: false },
                  { column: 'role', type: 'text', nullable: false },
                  { column: 'status', type: 'text', nullable: false },
                  { column: 'performance', type: 'int', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
            {
              id: 'tasks',
              name: 'tasks',
              type: 'table',
              // live count via VPS API
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'title', type: 'text', nullable: false },
                  { column: 'progress', type: 'int', nullable: false },
                  { column: 'completed', type: 'boolean', nullable: false },
                  { column: 'assignee', type: 'text', nullable: true },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
            {
              id: 'memories',
              name: 'memories',
              type: 'table',
              // live count via VPS API
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'content', type: 'text', nullable: false },
                  { column: 'topic', type: 'text', nullable: false },
                  { column: 'embedding', type: 'vector(1536)', nullable: true },
                  { column: 'created_at', type: 'timestamp', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
            {
              id: 'conversations',
              name: 'conversations',
              type: 'table',
              // live count via VPS API
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'agent_id', type: 'text', nullable: false },
                  { column: 'messages', type: 'jsonb', nullable: false },
                  { column: 'created_at', type: 'timestamp', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
          ],
        },
        {
          id: 'supabase-storage',
          name: 'storage',
          type: 'schema',
          children: [
            {
              id: 'buckets',
              name: 'buckets',
              type: 'bucket',
              count: '3 buckets',
              details: {
                schema: [
                  { column: 'id', type: 'text', nullable: false },
                  { column: 'name', type: 'text', nullable: false },
                  { column: 'public', type: 'boolean', nullable: false },
                  { column: 'file_size_limit', type: 'bigint', nullable: true },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'cloudflare',
      name: 'Cloudflare',
      type: 'category',
      status: 'online',
      children: [
        {
          id: 'cf-d1',
          name: 'D1 Database',
          type: 'service',
          count: '12 tables',
          details: {
            schema: [
              { column: 'table_name', type: 'text', nullable: false },
              { column: 'row_count', type: 'int', nullable: false },
              { column: 'size_kb', type: 'int', nullable: false },
            ],
            rowCount: 12,
            lastUpdated: '2025-01-15 10:00:00',
            sampleRows: [
              { table_name: 'cache', row_count: 4523, size_kb: 512 },
              { table_name: 'events', row_count: 8912, size_kb: 1024 },
            ],
          },
        },
        {
          id: 'cf-r2',
          name: 'R2 Storage',
          type: 'service',
          count: '1.2 GB',
          details: {
            schema: [
              { column: 'key', type: 'text', nullable: false },
              { column: 'size', type: 'bigint', nullable: false },
              { column: 'last_modified', type: 'timestamp', nullable: false },
            ],
            rowCount: 342,
            lastUpdated: '2025-01-15 08:00:00',
            sampleRows: [
              { key: 'models/gpt-4.tar', size: 524288000, last_modified: '2025-01-10' },
              { key: 'assets/logo.png', size: 24576, last_modified: '2025-01-08' },
            ],
          },
        },
        {
          id: 'cf-kv',
          name: 'KV Store',
          type: 'store',
          count: '156 keys',
          details: {
            schema: [
              { column: 'key', type: 'text', nullable: false },
              { column: 'value', type: 'text', nullable: false },
              { column: 'expiration', type: 'timestamp', nullable: true },
            ],
            rowCount: 156,
            lastUpdated: '2025-01-15 14:00:00',
            sampleRows: [
              { key: 'session:active', value: '23', expiration: '2025-01-16' },
              { key: 'config:theme', value: 'dark', expiration: null },
            ],
          },
        },
        {
          id: 'cf-workers',
          name: 'Workers',
          type: 'service',
          count: '8 deployed',
          details: {
            schema: [
              { column: 'name', type: 'text', nullable: false },
              { column: 'status', type: 'text', nullable: false },
              { column: 'requests_24h', type: 'int', nullable: false },
            ],
            rowCount: 8,
            lastUpdated: '2025-01-15 14:00:00',
            sampleRows: [
              { name: 'api-gateway', status: 'active', requests_24h: 45200 },
              { name: 'auth-worker', status: 'active', requests_24h: 12800 },
            ],
          },
        },
      ],
    },
    {
      id: 'local',
      name: 'Local Storage',
      type: 'category',
      status: 'active',
      children: [
        {
          id: 'local-cache',
          name: 'cache',
          type: 'store',
          count: '24 MB',
          details: {
                schema: [
                  { column: 'key', type: 'text', nullable: false },
                  { column: 'value', type: 'text', nullable: false },
                  { column: 'ttl', type: 'int', nullable: true },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
        {
          id: 'local-settings',
          name: 'settings',
          type: 'store',
          count: '48 keys',
          details: {
                schema: [
                  { column: 'key', type: 'text', nullable: false },
                  { column: 'value', type: 'text', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
        {
          id: 'local-logs',
          name: 'logs',
          type: 'store',
          count: '2,400 entries',
          details: {
                schema: [
                  { column: 'timestamp', type: 'text', nullable: false },
                  { column: 'level', type: 'text', nullable: false },
                  { column: 'message', type: 'text', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
      ],
    },
    {
      id: 'mcp',
      name: 'MCP Servers',
      type: 'category',
      status: 'active',
      children: [
        {
          id: 'mcp-filesystem',
          name: 'filesystem',
          type: 'server',
          count: 'connected',
          details: {
                schema: [
                  { column: 'path', type: 'text', nullable: false },
                  { column: 'type', type: 'text', nullable: false },
                  { column: 'size', type: 'bigint', nullable: true },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
        {
          id: 'mcp-browser',
          name: 'browser',
          type: 'server',
          count: 'connected',
          details: {
                schema: [
                  { column: 'url', type: 'text', nullable: false },
                  { column: 'title', type: 'text', nullable: false },
                  { column: 'status', type: 'text', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
        {
          id: 'mcp-database',
          name: 'database',
          type: 'server',
          count: 'connected',
          details: {
                schema: [
                  { column: 'query', type: 'text', nullable: false },
                  { column: 'result', type: 'text', nullable: true },
                  { column: 'duration_ms', type: 'int', nullable: false },
                ],
                rowCount: 0,
                lastUpdated: 'n/a',
                sampleRows: [],
              },
            },
      ],
    },
  ],
};

function sanitizeTreeData(node: TreeNode): TreeNode {
  const next: TreeNode = {
    ...node,
    ...(node.details
      ? {
          details: {
            ...node.details,
            rowCount: 0,
            lastUpdated: 'n/a',
            sampleRows: [],
          },
        }
      : {}),
  };
  if (node.children) {
    next.children = node.children.map(child => sanitizeTreeData(child));
  }
  return next;
}

const SANITIZED_TREE_DATA = sanitizeTreeData(treeData);

/* ------------------------------------------------------------------ */
/*  ICON MAP                                                           */
/* ------------------------------------------------------------------ */

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
    root: '#22D3EE',
    category: '#3B82F6',
    schema: '#8B9DBF',
    table: '#10B981',
    bucket: '#F59E0B',
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

/* ------------------------------------------------------------------ */
/*  TREE ITEM COMPONENT                                                */
/* ------------------------------------------------------------------ */

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
          backgroundColor: isSelected ? 'rgba(34,211,238,0.08)' : 'transparent',
          border: isSelected ? '1px solid rgba(34,211,238,0.15)' : '1px solid transparent',
        }}
        onClick={() => {
          if (hasChildren) onToggleExpand(node.id);
          if (node.details) onSelect(node);
        }}
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      >
        {/* Expand arrow */}
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

        {/* Type icon */}
        <TypeIcon type={node.type} />

        {/* Name */}
        <span
          className="text-body flex-1 truncate"
          style={{ color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)', fontSize: '13px' }}
        >
          {node.name}
        </span>

        {/* Count / Status badge */}
        {node.count && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: isLeafTable ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
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
                backgroundColor: node.status === 'online' || node.status === 'active' ? '#10B981' : '#6B7280',
              }}
            />
          </span>
        )}
      </motion.div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Indentation line */}
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

/* ------------------------------------------------------------------ */
/*  CORE MEMORY PANEL (real Supabase data)                            */
/* ------------------------------------------------------------------ */

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
    if (!connected) return;
    setLoading(true);
    const data = await loadMemories(60);
    setMemories(data);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Deep-link support: chat can send ?open=<memoryId> to jump straight to a
  // specific memory entry (see chatActionService.ts resolveRecordDeepLink).
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
        <div className="rounded-2xl flex items-center justify-center" style={{ width: 64, height: 64, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={28} color="#ef4444" />
        </div>
        <div className="text-center">
          <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Supabase niet verbonden</p>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Ga naar <a href="/settings" style={{ color: 'var(--accent-cyan)' }}>Settings</a> en voer je Supabase URL + anon key in.<br />
            Daarna werkt Core Memory automatisch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Brain size={15} color="var(--accent-cyan)" />
          <span className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>Core Memory</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>
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
            style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <Plus size={11} />Add
          </button>
        </div>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 overflow-hidden" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div className="p-4 space-y-3">
              <textarea ref={textRef} value={content} onChange={e => setContent(e.target.value)} placeholder="Wat moet AXE onthouden?" rows={3}
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
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && memories.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={16} className="animate-spin" color="var(--text-muted)" />
          </div>
        )}
        {!loading && memories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Brain size={24} color="rgba(34,211,238,0.3)" />
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nog geen memories opgeslagen.<br/>AXE slaat automatisch op na gesprekken.</p>
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
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>{t}</span>
                ))}
                <span className="text-[9px] font-mono ml-auto" style={{ color: IMPORTANCE_COLORS[m.importance] || 'var(--text-muted)' }}>
                  ★{m.importance}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {new Date(m.created_at).toLocaleDateString('nl-NL')}
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

/* ------------------------------------------------------------------ */
/*  LIVE AI MEMORY PANEL                                               */
/* ------------------------------------------------------------------ */

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
  kimiclaw: '#F59E0B',
  kimicode: '#10B981',
  kimiwork: '#8B5CF6',
};

function LiveMemoryPanel() {
  const [globalMem, setGlobalMem] = useState<GlobalMemCacheEntry[]>([]);
  const [sharedMem, setSharedMem] = useState<SharedMemEntry[]>([]);
  const [activeSection, setActiveSection] = useState<'global' | 'shared'>('global');

  const reload = () => {
    try {
      const raw = localStorage.getItem('axe_global_memory_cache');
      setGlobalMem(raw ? (JSON.parse(raw) as GlobalMemCacheEntry[]).slice(0, 60) : []);
    } catch { setGlobalMem([]); }
    try {
      const raw = localStorage.getItem('axe_shared_memory');
      setSharedMem(raw ? (JSON.parse(raw) as SharedMemEntry[]).slice(0, 60) : []);
    } catch { setSharedMem([]); }
  };

  useEffect(() => { reload(); }, []);

  const sectionBtn = (id: 'global' | 'shared', label: string, count: number) => (
    <button
      onClick={() => setActiveSection(id)}
      className="px-3 py-1 rounded-lg text-[11px] font-medium transition-colors"
      style={{
        background: activeSection === id ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)',
        color: activeSection === id ? 'var(--accent-cyan)' : 'var(--text-muted)',
        border: activeSection === id ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent',
      }}
    >
      {label} <span className="opacity-60">({count})</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Brain size={15} color="var(--accent-cyan)" />
          <span className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>AI Memory</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>
            live
          </span>
        </div>
        <button onClick={reload} className="p-1.5 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }} title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-2 px-5 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {sectionBtn('global', '🌐 Global Memory', globalMem.length)}
        {sectionBtn('shared', '🤝 Agent Shared', sharedMem.length)}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activeSection === 'global' && (
          <>
            {globalMem.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Brain size={24} color="rgba(34,211,238,0.2)" />
                <p className="text-[12px] text-center" style={{ color: 'var(--text-muted)' }}>
                  Nog geen global memory.<br />Stuur een bericht naar een agent om te starten.
                </p>
              </div>
            ) : globalMem.map((m, i) => {
              let parsedVal: { q?: string; a?: string; provider?: string } | null = null;
              try { parsedVal = JSON.parse(m.value); } catch { /* raw string */ }
              return (
                <div key={m.id ?? i} className="rounded-lg px-3 py-2 space-y-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)' }}>
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
                  Geen agent shared memory.<br />Agents schrijven hier automatisch inzichten naartoe.
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
                    <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{new Date(m.timestamp).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
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

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function Memory() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'core-memory' | 'ai-memory'>('ai-memory');
  // Deep-link support: chat can send ?open=<memoryId> to jump straight to a
  // specific memory entry (see chatActionService.ts resolveRecordDeepLink).
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [treeState, setTreeState] = useState<TreeNode>(SANITIZED_TREE_DATA);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['root', 'supabase', 'supabase-public'])
  );

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [memories, logs, mcpServers] = await Promise.all([
        loadMemories(200).catch(() => [] as Awaited<ReturnType<typeof loadMemories>>),
        loadLogs(200).catch(() => [] as Awaited<ReturnType<typeof loadLogs>>),
        loadMcpServers().catch(() => [] as Awaited<ReturnType<typeof loadMcpServers>>),
      ]);
      if (!alive) return;

      const patch: TreePatch = {
        memories: {
          rowCount: memories.length,
          sampleRows: memories.slice(0, 3).map(m => ({
            id: m.id,
            content: m.content,
            topic: m.tags.join(', ') || 'general',
            created_at: m.created_at,
          })),
          lastUpdated: memories[0]?.created_at ?? 'n/a',
        },
        'local-logs': {
          rowCount: logs.length,
          sampleRows: logs.slice(0, 2).map(l => ({
            timestamp: l.created_at,
            level: l.level,
            message: `${l.source}: ${l.message}`.slice(0, 80),
          })),
          lastUpdated: logs[0]?.created_at ?? 'n/a',
        },
        'mcp-filesystem': {
          count: `${mcpServers.filter(s => s.id === 'filesystem').length > 0 ? 'configured' : 'missing'}`,
          rowCount: mcpServers.length,
          sampleRows: mcpServers.slice(0, 2).map(s => ({
            path: `/mcp/${s.id}`,
            type: s.category,
            size: s.latency ?? null,
          })),
        },
        'mcp-browser': {
          count: `${mcpServers.filter(s => s.id === 'browser').length > 0 ? 'configured' : 'missing'}`,
          rowCount: mcpServers.length,
          sampleRows: mcpServers.slice(0, 1).map(s => ({
            url: s.docsUrl,
            title: s.name,
            status: s.status,
          })),
        },
        'mcp-database': {
          count: `${mcpServers.filter(s => s.id === 'postgres' || s.id === 'supabase').length > 0 ? 'configured' : 'missing'}`,
          rowCount: mcpServers.length,
          sampleRows: mcpServers.slice(0, 1).map(s => ({
            query: `SELECT * FROM ${s.id}`,
            result: s.status,
            duration_ms: s.latency ?? 0,
          })),
        },
      };

      setTreeState(applyTreePatch(SANITIZED_TREE_DATA, patch));
    };
    refresh();
    return () => { alive = false; };
  }, []);

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (node: TreeNode) => {
    setSelectedId(node.id);
    setSelectedNode(node);
  };

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {([
          { id: 'ai-memory',   label: '🤖 AI Memory',    desc: 'Live agent memory' },
          { id: 'core-memory', label: '🧠 Core Memory',  desc: 'Echte Supabase data' },
          { id: 'explorer',    label: '🗄️ DB Explorer',  desc: 'Schema browser' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative px-4 py-2 text-[12px] font-medium transition-colors rounded-t-lg"
            style={{
              color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
              background: activeTab === tab.id ? 'rgba(34,211,238,0.06)' : 'transparent',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      {activeTab === 'ai-memory' ? (
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
        {/* Header */}
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
              Browse AXE memory sources
            </p>
          </div>
          <div
            className="text-[10px] font-mono px-2 py-1 rounded"
            style={{ backgroundColor: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}
          >
            {expandedIds.size} expanded
          </div>
        </div>

        {/* Tree */}
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

      {/* Right: Detail Panel */}
      <div className="flex-1 min-w-0 overflow-y-visible xl:overflow-y-auto p-4 sm:p-6">
        {selectedNode && selectedNode.details ? (
          <motion.div
            key={selectedNode.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Detail Header */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="rounded-lg flex items-center justify-center"
                style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: 'rgba(34,211,238,0.08)',
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

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Hash size={12} color="var(--text-muted)" />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Rows</span>
                </div>
                <span className="font-mono-data text-mono-lg" style={{ color: 'var(--text-primary)' }}>
                  {selectedNode.details.rowCount.toLocaleString()}
                </span>
              </div>
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Columns3 size={12} color="var(--text-muted)" />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Columns</span>
                </div>
                <span className="font-mono-data text-mono-lg" style={{ color: 'var(--text-primary)' }}>
                  {selectedNode.details.schema.length}
                </span>
              </div>
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={12} color="var(--text-muted)" />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Updated</span>
                </div>
                <span className="font-mono-data text-xs-custom" style={{ color: 'var(--text-primary)' }}>
                  {selectedNode.details.lastUpdated.split(' ')[0]}
                </span>
              </div>
            </div>

            {/* Schema Table */}
            <div
              className="rounded-xl overflow-hidden mb-6"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="px-4 py-3 flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <Columns3 size={14} color="var(--accent-cyan)" />
                <span className="text-body font-medium" style={{ color: 'var(--text-primary)' }}>Schema</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                      Column
                    </th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                      Type
                    </th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>
                      Nullable
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedNode.details.schema.map((col, i) => (
                    <tr
                      key={col.column}
                      style={{
                        borderBottom: i < selectedNode.details!.schema.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                      }}
                    >
                      <td className="px-4 py-2 text-xs-custom font-mono" style={{ color: 'var(--text-primary)' }}>
                        {col.column}
                      </td>
                      <td className="px-4 py-2 text-xs-custom font-mono" style={{ color: 'var(--accent-cyan)' }}>
                        {col.type}
                      </td>
                      <td className="px-4 py-2 text-xs-custom" style={{ color: col.nullable ? 'var(--text-muted)' : 'var(--success)' }}>
                        {col.nullable ? 'YES' : 'NO'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sample Data */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="px-4 py-3 flex items-center gap-2"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <Calendar size={14} color="var(--accent-cyan)" />
                <span className="text-body font-medium" style={{ color: 'var(--text-primary)' }}>Sample Data</span>
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                  Last updated: {selectedNode.details.lastUpdated}
                </span>
              </div>
              <div className="overflow-x-auto">
                {selectedNode.details.sampleRows.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        {Object.keys(selectedNode.details.sampleRows[0]).map((key) => (
                          <th
                            key={key}
                            className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-medium"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNode.details.sampleRows.map((row, i) => (
                        <tr
                          key={i}
                          style={{
                            borderBottom: i < selectedNode.details!.sampleRows.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                          }}
                        >
                          {Object.values(row).map((val, j) => (
                            <td
                              key={j}
                              className="px-4 py-2 text-xs-custom font-mono truncate max-w-[180px]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
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
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full" style={{ minHeight: '400px' }}>
            <div
              className="rounded-2xl flex items-center justify-center mb-4"
              style={{
                width: '64px',
                height: '64px',
                backgroundColor: 'rgba(34,211,238,0.05)',
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
