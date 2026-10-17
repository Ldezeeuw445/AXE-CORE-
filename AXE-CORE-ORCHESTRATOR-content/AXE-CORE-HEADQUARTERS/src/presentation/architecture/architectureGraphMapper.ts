import type { Edge, Node } from '@xyflow/react';
import type { ArchitectureManifest, ArchitectureNode } from '@/domain/architecture/architectureGraph';

export const SHARED_GROUP = '__architecture_shared__';
export const OVERVIEW = '__architecture_overview__';
export const ALL_GROUPS = '__architecture_all__';

export const ARCHITECTURE_KINDS: ArchitectureNode['kind'][] = [
  'app', 'runtime', 'crew', 'agent', 'coding-seat', 'dax', 'worker',
  'service', 'cron', 'mcp', 'provider', 'cloudflare', 'supabase-project', 'table',
];

export const KIND_LABELS: Record<ArchitectureNode['kind'], string> = {
  app: 'App',
  agent: 'Agent',
  crew: 'Crew',
  service: 'Service',
  'supabase-project': 'Supabase project',
  table: 'Table',
  cloudflare: 'Cloudflare',
  mcp: 'MCP server',
  runtime: 'Runtime',
  cron: 'Scheduled job',
  provider: 'LLM provider',
  worker: 'Worker',
  dax: 'DAX computer',
  'coding-seat': 'Coding seat',
};

export type ArchitectureGraphFilters = {
  group: string;
  kind: ArchitectureNode['kind'] | 'all';
  query: string;
};

export type ArchitectureGroup = {
  id: string;
  label: string;
  count: number;
  kinds: Partial<Record<ArchitectureNode['kind'], number>>;
};

export type ArchitectureFlowData = {
  label: string;
  kind: ArchitectureNode['kind'] | 'group';
  node?: ArchitectureNode;
  groupId: string;
  childCount: number;
  overview?: boolean;
  counts?: ArchitectureGroup['kinds'];
  active?: boolean;
  onSelect?: () => void;
};

export function architectureNodeFromClick(
  data: ArchitectureFlowData,
  fallbackId: string,
  nodes: ArchitectureNode[],
): { type: 'group'; groupId: string } | { type: 'node'; node: ArchitectureNode } | null {
  if (data.overview && data.groupId) {
    return { type: 'group', groupId: data.groupId === SHARED_GROUP ? ALL_GROUPS : data.groupId };
  }
  const node = data.node ?? nodes.find(item => item.id === fallbackId || item.id === data.node?.id);
  return node ? { type: 'node', node } : null;
}

export function selectedArchitectureNodeFromFlow(
  nodes: Iterable<{ id?: string; selected?: boolean; type?: string; data: ArchitectureFlowData }>,
): ArchitectureNode | null {
  for (const node of nodes) {
    if (!node.selected || node.data?.overview || node.type === 'architectureGroup') continue;
    if (node.data?.node) return node.data.node;
    if (node.data?.kind && node.data.kind !== 'group') {
      return {
        id: node.id ?? node.data.label,
        kind: node.data.kind,
        label: node.data.label,
        details: {},
        sources: [],
        appId: node.data.groupId === SHARED_GROUP ? undefined : node.data.groupId,
      };
    }
  }
  return null;
}

export type ArchitectureFlowNode = Node<ArchitectureFlowData, 'architecture' | 'architectureGroup'>;
export type ArchitectureFlowEdge = Edge<{ sourceEdges: string[]; relations: string[] }>;

function sortedNodes(nodes: ArchitectureNode[]): ArchitectureNode[] {
  return [...nodes].sort((a, b) => ARCHITECTURE_KINDS.indexOf(a.kind) - ARCHITECTURE_KINDS.indexOf(b.kind)
    || a.label.localeCompare(b.label, 'en') || a.id.localeCompare(b.id, 'en'));
}

function ownership(manifest: ArchitectureManifest) {
  const apps = new Set(manifest.nodes.filter(node => node.kind === 'app').map(node => node.id));
  return (node: ArchitectureNode): string => node.kind === 'app' ? node.id
    : node.appId && apps.has(node.appId) ? node.appId : SHARED_GROUP;
}

function getArchitectureGroups(manifest: ArchitectureManifest): ArchitectureGroup[] {
  const ownerOf = ownership(manifest);
  const groups = new Map<string, ArchitectureGroup>();
  for (const app of sortedNodes(manifest.nodes.filter(node => node.kind === 'app'))) {
    groups.set(app.id, { id: app.id, label: app.label, count: 0, kinds: {} });
  }
  for (const node of manifest.nodes) {
    const groupId = ownerOf(node);
    const group = groups.get(groupId) ?? { id: groupId, label: 'Shared / unassigned', count: 0, kinds: {} };
    group.count += 1;
    group.kinds[node.kind] = (group.kinds[node.kind] ?? 0) + 1;
    groups.set(groupId, group);
  }
  return [...groups.values()];
}

function matchesQuery(node: ArchitectureNode, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('en');
  if (!needle) return true;
  const fields = [node.id, node.label, node.description ?? '', node.kind, node.appId ?? ''];
  for (const key of ['unit', 'product_key', 'table', 'projectRef', 'engine', 'host', 'label'] as const) {
    const value = node.details[key];
    if (typeof value === 'string') fields.push(value);
  }
  return fields.some(value => value.toLocaleLowerCase('en').includes(needle));
}

/** Groepering verandert de tekening; alleen bronrelaties leveren lijnen op. */
export function mapArchitectureGraph(manifest: ArchitectureManifest, filters: ArchitectureGraphFilters) {
  const groups = getArchitectureGroups(manifest);
  const ownerOf = ownership(manifest);
  const nodeById = new Map(manifest.nodes.map(node => [node.id, node]));
  const overview = filters.group === OVERVIEW && filters.kind === 'all' && !filters.query.trim();

  if (overview) {
    const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(groups.length))));
    const nodes: ArchitectureFlowNode[] = groups.map((group, index) => ({
      id: group.id,
      type: 'architecture',
      position: { x: (index % columns) * 292, y: Math.floor(index / columns) * 188 },
      data: {
        label: group.label, kind: group.id === SHARED_GROUP ? 'group' : 'app',
        node: nodeById.get(group.id), groupId: group.id, childCount: group.count,
        counts: group.kinds, overview: true,
      },
      width: 248, height: 138,
    }));
    const groupedEdges = new Map<string, ArchitectureFlowEdge>();
    for (const edge of manifest.edges) {
      const from = nodeById.get(edge.source);
      const to = nodeById.get(edge.target);
      if (!from || !to) continue;
      const source = ownerOf(from);
      const target = ownerOf(to);
      if (source === target) continue;
      const id = `overview:${JSON.stringify([source, target])}`;
      const existing = groupedEdges.get(id);
      if (existing?.data) {
        existing.data.sourceEdges.push(edge.id);
        if (!existing.data.relations.includes(edge.relation)) existing.data.relations.push(edge.relation);
        existing.label = `${existing.data.sourceEdges.length} connections`;
      } else {
        groupedEdges.set(id, {
          id, source, target, type: 'smoothstep', label: edge.label ?? edge.relation,
          data: { sourceEdges: [edge.id], relations: [edge.relation] },
        });
      }
    }
    return { nodes, edges: [...groupedEdges.values()], overview, visibleCount: manifest.nodes.length, groups };
  }

  const visible = sortedNodes(manifest.nodes.filter(node =>
    ([OVERVIEW, ALL_GROUPS].includes(filters.group) || ownerOf(node) === filters.group)
    && (filters.kind === 'all' || node.kind === filters.kind)
    && matchesQuery(node, filters.query)));
  const visibleIds = new Set(visible.map(node => node.id));
  const nodes: ArchitectureFlowNode[] = [];
  const sections = groups.flatMap(group => {
    const members = visible.filter(node => ownerOf(node) === group.id);
    if (!members.length) return [];
    const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(members.length))));
    const rows = Math.ceil(members.length / columns);
    return [{ group, members, columns, width: columns * 262 + 28, height: rows * 118 + 72 }];
  });
  let rowY = 0;
  for (let index = 0; index < sections.length; index += 2) {
    let columnX = 0;
    const row = sections.slice(index, index + 2);
    for (const section of row) {
      const { group, members, columns, width, height } = section;
      const parentId = `architecture-group:${group.id}`;
      nodes.push({
        id: parentId, type: 'architectureGroup', position: { x: columnX, y: rowY },
        data: { label: group.label, kind: 'group', groupId: group.id, childCount: members.length },
        style: { width, height, pointerEvents: 'none' }, selectable: false, focusable: false,
      });
      members.forEach((node, memberIndex) => nodes.push({
        id: node.id, type: 'architecture', parentId, extent: 'parent',
        position: { x: 24 + (memberIndex % columns) * 262, y: 54 + Math.floor(memberIndex / columns) * 118 },
        data: { label: node.label, kind: node.kind, node, groupId: group.id, childCount: 0 },
        style: { pointerEvents: 'all' },
        width: 238, height: 94,
      }));
      columnX += width + 80;
    }
    rowY += Math.max(...row.map(section => section.height)) + 80;
  }
  const edges: ArchitectureFlowEdge[] = manifest.edges
    .filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target))
    .map(edge => ({
      id: edge.id, source: edge.source, target: edge.target, type: 'smoothstep',
      label: edge.label ?? edge.relation,
      data: { sourceEdges: [edge.id], relations: [edge.relation] },
    }));
  return { nodes, edges, overview, visibleCount: visible.length, groups };
}
