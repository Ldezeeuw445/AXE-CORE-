import { useState } from 'react';
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
} from 'lucide-react';

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
              count: '2,847 rows',
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'email', type: 'text', nullable: false },
                  { column: 'created_at', type: 'timestamp', nullable: false },
                  { column: 'last_sign_in', type: 'timestamp', nullable: true },
                  { column: 'metadata', type: 'jsonb', nullable: true },
                ],
                rowCount: 2847,
                lastUpdated: '2025-01-15 14:32:00',
                sampleRows: [
                  { id: 'a1b2...', email: 'user@example.com', created_at: '2025-01-10', last_sign_in: '2025-01-15' },
                  { id: 'c3d4...', email: 'admin@axe.ai', created_at: '2024-12-20', last_sign_in: '2025-01-14' },
                  { id: 'e5f6...', email: 'dev@team.io', created_at: '2024-11-05', last_sign_in: '2025-01-12' },
                ],
              },
            },
            {
              id: 'sessions',
              name: 'sessions',
              type: 'table',
              count: '412 rows',
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'user_id', type: 'uuid', nullable: false },
                  { column: 'token', type: 'text', nullable: false },
                  { column: 'expires_at', type: 'timestamp', nullable: false },
                ],
                rowCount: 412,
                lastUpdated: '2025-01-15 14:30:00',
                sampleRows: [
                  { id: 's1s2...', user_id: 'a1b2...', token: 'eyJhb...', expires_at: '2025-01-16' },
                  { id: 's3s4...', user_id: 'c3d4...', token: 'eyJhc...', expires_at: '2025-01-16' },
                ],
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
              count: '23 rows',
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'name', type: 'text', nullable: false },
                  { column: 'role', type: 'text', nullable: false },
                  { column: 'status', type: 'text', nullable: false },
                  { column: 'performance', type: 'int', nullable: false },
                ],
                rowCount: 23,
                lastUpdated: '2025-01-15 13:00:00',
                sampleRows: [
                  { id: 'ag-01', name: 'AXE Core', role: 'Central Intelligence', status: 'active', performance: 99 },
                  { id: 'ag-02', name: 'Coding Agent', role: 'Software Development', status: 'active', performance: 94 },
                  { id: 'ag-03', name: 'Research Agent', role: 'Intelligence Gathering', status: 'active', performance: 91 },
                ],
              },
            },
            {
              id: 'tasks',
              name: 'tasks',
              type: 'table',
              count: '156 rows',
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'title', type: 'text', nullable: false },
                  { column: 'progress', type: 'int', nullable: false },
                  { column: 'completed', type: 'boolean', nullable: false },
                  { column: 'assignee', type: 'text', nullable: true },
                ],
                rowCount: 156,
                lastUpdated: '2025-01-15 12:45:00',
                sampleRows: [
                  { id: 'tk-01', title: 'Refactor auth module', progress: 85, completed: false, assignee: 'Coding Agent' },
                  { id: 'tk-02', title: 'Polish voice pipeline UI', progress: 60, completed: false, assignee: 'Design Agent' },
                ],
              },
            },
            {
              id: 'memories',
              name: 'memories',
              type: 'table',
              count: '3,380 rows',
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'content', type: 'text', nullable: false },
                  { column: 'topic', type: 'text', nullable: false },
                  { column: 'embedding', type: 'vector(1536)', nullable: true },
                  { column: 'created_at', type: 'timestamp', nullable: false },
                ],
                rowCount: 3380,
                lastUpdated: '2025-01-15 14:28:00',
                sampleRows: [
                  { id: 'mem-001', content: 'User prefers dark mode interface', topic: 'preferences', created_at: '2025-01-15' },
                  { id: 'mem-002', content: 'API rate limit is 1000 req/min', topic: 'infrastructure', created_at: '2025-01-14' },
                  { id: 'mem-003', content: 'Q4 revenue target: $2.5M', topic: 'finance', created_at: '2025-01-13' },
                ],
              },
            },
            {
              id: 'conversations',
              name: 'conversations',
              type: 'table',
              count: '847 rows',
              details: {
                schema: [
                  { column: 'id', type: 'uuid', nullable: false },
                  { column: 'agent_id', type: 'text', nullable: false },
                  { column: 'messages', type: 'jsonb', nullable: false },
                  { column: 'created_at', type: 'timestamp', nullable: false },
                ],
                rowCount: 847,
                lastUpdated: '2025-01-15 14:25:00',
                sampleRows: [
                  { id: 'conv-01', agent_id: 'ag-01', messages: 24, created_at: '2025-01-15' },
                  { id: 'conv-02', agent_id: 'ag-02', messages: 18, created_at: '2025-01-14' },
                ],
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
                rowCount: 3,
                lastUpdated: '2025-01-10 09:00:00',
                sampleRows: [
                  { id: 'avatars', name: 'avatars', public: true, file_size_limit: 1048576 },
                  { id: 'documents', name: 'documents', public: false, file_size_limit: 10485760 },
                  { id: 'media', name: 'media', public: true, file_size_limit: 52428800 },
                ],
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
            rowCount: 892,
            lastUpdated: '2025-01-15 14:32:00',
            sampleRows: [
              { key: 'agent:list', value: '[...]', ttl: 300 },
              { key: 'user:prefs', value: '{...}', ttl: 3600 },
            ],
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
            rowCount: 48,
            lastUpdated: '2025-01-14 09:00:00',
            sampleRows: [
              { key: 'theme', value: 'dark' },
              { key: 'sidebar_collapsed', value: 'false' },
            ],
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
            rowCount: 2400,
            lastUpdated: '2025-01-15 14:33:00',
            sampleRows: [
              { timestamp: '2025-01-15 14:30:00', level: 'INFO', message: 'Agent task completed' },
              { timestamp: '2025-01-15 14:28:00', level: 'WARN', message: 'High memory usage' },
            ],
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
            lastUpdated: '2025-01-15 14:00:00',
            sampleRows: [
              { path: '/project/src', type: 'directory', size: null },
              { path: '/project/package.json', type: 'file', size: 2048 },
            ],
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
            lastUpdated: '2025-01-15 14:00:00',
            sampleRows: [
              { url: 'https://example.com', title: 'Example', status: 'loaded' },
            ],
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
            lastUpdated: '2025-01-15 14:00:00',
            sampleRows: [
              { query: 'SELECT * FROM agents', result: '[...]', duration_ms: 12 },
            ],
          },
        },
      ],
    },
  ],
};

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
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function Memory() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['root', 'supabase', 'supabase-public'])
  );

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
      className="h-full flex overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Left: Tree Panel */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{
          width: '380px',
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
            node={treeData}
            depth={0}
            selectedId={selectedId}
            onSelect={handleSelect}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
          />
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="flex-1 overflow-y-auto p-6">
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
            <div className="grid grid-cols-3 gap-3 mb-6">
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
    </motion.div>
  );
}
