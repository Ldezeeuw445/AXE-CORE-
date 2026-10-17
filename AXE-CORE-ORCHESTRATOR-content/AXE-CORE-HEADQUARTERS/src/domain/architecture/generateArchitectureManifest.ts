/**
 * Statische architectuurgraaf uit bestanden die live niet (betrouwbaar) te vragen zijn.
 * Geen gissingen: alleen wat een bronbestand expliciet noemt.
 */
import {
  architectureSafeUrl,
  architectureSlug,
  createArchitectureGraph,
  type ArchitectureKind,
  type ArchitectureManifest,
  type ArchitectureNode,
} from './architectureGraph';

export type ArchitectureFileMap = Record<string, string>;

const APP_LABELS: Record<string, string> = {
  axe_core: 'AXE Core HQ',
  axe_companion: 'AXE Companion',
  trading_os: 'Trading OS',
  axon_memory: 'Axon Memory',
  northsea: 'NorthSea',
  axe_code: 'AXE Code',
  android_device_manager: 'Android Device Manager',
};

const APP_IDS = new Set(Object.keys(APP_LABELS));

const PROJECT_OWNERS: Record<string, string> = {
  pqnngpcgbdwxavbatbia: 'app:axe_core',
  kbimnuepbecbyezedvih: 'app:northsea',
  ktaditgtbubonrahyiig: 'app:axon_memory',
};

function stripSql(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

function sqlString(value: string): string {
  return value.replace(/^'+|'+$/g, '').replace(/''/g, "'");
}

function parseSqlArray(value: string): string[] {
  const inner = value.match(/array\[(.*)\]/i)?.[1] ?? '';
  return [...inner.matchAll(/'((?:\\'|[^'])*)'/g)].map(m => m[1].replace(/\\'/g, "'"));
}

function parseSqlJson(value: string): Record<string, string> {
  const raw = sqlString(value).replace(/\\"/g, '"');
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function filesMatching(files: ArchitectureFileMap, test: (path: string) => boolean): [string, string][] {
  return Object.entries(files).filter(([path]) => test(path));
}

function addApp(
  graph: ReturnType<typeof createArchitectureGraph>,
  productKey: string,
  patch: Partial<ArchitectureNode>,
  source: string,
) {
  const id = `app:${productKey}`;
  graph.put({
    id,
    kind: 'app',
    label: patch.label || APP_LABELS[productKey] || productKey,
    description: patch.description,
    details: { product_key: productKey, ...(patch.details ?? {}) },
    sources: [source],
    ...('appId' in patch ? {} : {}),
  });
}

function projectForSql(path: string): { projectId: string; appId: string } {
  if (path.includes('/northsea/')) {
    return { projectId: 'supabase:kbimnuepbecbyezedvih', appId: 'app:northsea' };
  }
  return { projectId: 'supabase:pqnngpcgbdwxavbatbia', appId: 'app:axe_core' };
}

function ensureProject(
  graph: ReturnType<typeof createArchitectureGraph>,
  ref: string,
  source: string,
  label?: string,
) {
  const id = `supabase:${ref}`;
  const appId = PROJECT_OWNERS[ref];
  graph.put({
    id,
    kind: 'supabase-project',
    label: label || `Supabase · ${ref}`,
    appId,
    details: { projectRef: ref },
    sources: [source],
  });
  if (appId) graph.link(appId, id, 'uses-project', source);
  return id;
}

function ensureRuntime(
  graph: ReturnType<typeof createArchitectureGraph>,
  id: string,
  label: string,
  details: ArchitectureNode['details'],
  source: string,
  appId?: string,
) {
  graph.put({ id, kind: 'runtime', label, appId, details, sources: [source] });
  if (appId) graph.link(appId, id, 'runs-on', source);
}

export function generateArchitectureManifest(files: ArchitectureFileMap): ArchitectureManifest {
  const graph = createArchitectureGraph();

  seedRuntimes(graph, files);
  parseProgramma(graph, files);
  parseProductRegister(graph, files);
  parseRegisteredAppSeeds(graph, files);
  parseEcosystem(graph, files);
  parseSqlTables(graph, files);
  parseCoreAgentSeeds(graph, files);
  parseMcpSeeds(graph, files);
  parseDaxSeeds(graph, files);
  parseRoster(graph, files);
  parseSpecialists(graph, files);
  parseNorthseaCrews(graph, files);
  parseTradingCrew(graph, files);
  parseProviders(graph, files);
  parseCodingSeats(graph, files);
  parseVpsManifest(graph, files);
  parseSystemdUnits(graph, files);
  parseLaunchd(graph, files);
  parseNamedServices(graph, files);

  if (![...graph.nodes.values()].some(node => node.kind === 'app' && node.id === 'app:axe_code')) {
    const source = graph.addSource('docs/programma/programma.json', 'programme');
    addApp(graph, 'axe_code', {
      description: 'AI software-creation environment inside AXE Core (Code Editor + coding seats).',
      details: { product_key: 'axe_code', hostedIn: 'AXE Core HQ' },
    }, source);
  }

  return graph.manifest();
}

function seedRuntimes(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  const eco = filesMatching(files, p => p.endsWith('ECOSYSTEM.md') || p.endsWith('01-REALITEIT.md') || p.endsWith('AGENTS.md') || p.endsWith('terminalHosts.ts'));
  const source = eco[0]?.[0] ?? 'docs/programma/01-REALITEIT.md';
  graph.addSource(source, 'runtime-hosts');
  ensureRuntime(graph, 'runtime:vps-api', 'VPS api.axecompanion.com', {
    host: '212.227.91.79',
    hostname: 'api.axecompanion.com',
    role: 'API box',
  }, source, 'app:axe_core');
  ensureRuntime(graph, 'runtime:vps-strato', 'VPS ollama.axecompanion.com', {
    hostname: 'ollama.axecompanion.com',
    role: 'Ollama + DAX',
  }, source, 'app:axe_core');
  ensureRuntime(graph, 'runtime:mac-mini', 'Mac mini', {
    role: 'Brain · local API :8001 · planner',
  }, source, 'app:axe_core');
  ensureRuntime(graph, 'runtime:imac', 'iMac', {
    role: 'computer-worker imac-1 · autosync',
  }, source, 'app:axe_core');
  ensureRuntime(graph, 'runtime:cloudflare', 'Cloudflare', {
    role: 'Pages and Workers',
  }, source);
}

function parseProgramma(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('programma.json'))) {
    const source = graph.addSource(path, 'programme');
    try {
      const parsed = JSON.parse(content) as { taken?: { product?: string }[] };
      const products = new Set((parsed.taken ?? []).map(t => t.product).filter((p): p is string => typeof p === 'string'));
      for (const product of products) {
        if (!APP_IDS.has(product) && product !== 'axe_code') continue;
        addApp(graph, product, { details: { product_key: product, fromProgramme: true } }, source);
      }
    } catch {
      graph.warn(`${path}: programma.json is geen JSON`);
    }
  }
}

function parseProductRegister(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.includes('productregister') && p.endsWith('.sql'))) {
    const source = graph.addSource(path, 'product-register');
    const blocks = content.split(/update\s+public\.registered_apps\s+set/i).slice(1);
    for (const block of blocks) {
      const body = block.split(/\bwhere\b/i)[0] ?? '';
      const fields: Record<string, string> = {};
      for (const match of body.matchAll(/(\w+)\s*=\s*('(?:\\'|[^'])*'|array\[[^\]]*\]|[^\s,]+)/gi)) {
        fields[match[1]] = match[2];
      }
      const productKey = sqlString(fields.product_key ?? '');
      if (!productKey) continue;
      const surfaces = parseSqlJson(fields.surfaces ?? "''");
      const secrets = parseSqlArray(fields.secret_names ?? '');
      const crons = parseSqlArray(fields.cron_job_keys ?? '');
      const details: ArchitectureNode['details'] = {
        product_key: productKey,
        repo: sqlString(fields.repo ?? ''),
        workdir: sqlString(fields.workdir ?? ''),
        deploy_target: sqlString(fields.deploy_target ?? ''),
        owner_agent: sqlString(fields.owner_agent ?? ''),
        runbook: sqlString(fields.runbook ?? ''),
        supabase_ref: sqlString(fields.supabase_ref ?? ''),
      };
      if (secrets.length) details.secretNames = secrets;
      if (crons.length) details.cronJobKeys = crons;
      addApp(graph, productKey, {
        label: APP_LABELS[productKey],
        details,
      }, source);
      const appId = `app:${productKey}`;
      const ref = sqlString(fields.supabase_ref ?? '');
      if (ref) {
        ensureProject(graph, ref, source);
        graph.link(appId, `supabase:${ref}`, 'uses-project', source);
      }
      const owner = sqlString(fields.owner_agent ?? '');
      if (owner) graph.link(appId, `agent:${owner}`, 'managed-by', source);
      for (const job of crons) {
        const cronId = `cron:${job}`;
        graph.put({ id: cronId, kind: 'cron', label: job, appId, details: { jobKey: job }, sources: [source] });
        graph.link(appId, cronId, 'registers-cron', source);
      }
      for (const [surface, value] of Object.entries(surfaces)) {
        if (surface === 'mcp') {
          const mcpId = `mcp:${productKey}`;
          graph.put({
            id: mcpId, kind: 'mcp', label: `${APP_LABELS[productKey] ?? productKey} MCP`, appId,
            details: { surface, ...(architectureSafeUrl(value) ? { url: architectureSafeUrl(value) } : { note: value }) },
            sources: [source],
          });
          graph.link(appId, mcpId, 'uses-mcp', source);
        } else if (surface === 'desktop' || surface === 'android' || surface === 'web' || surface === 'app' || surface === 'desk') {
          const runtimeId = `runtime:${appId}:${surface}`;
          graph.put({
            id: runtimeId, kind: 'runtime', label: `${APP_LABELS[productKey] ?? productKey} · ${surface}`, appId,
            details: { surface, ...(architectureSafeUrl(value) ? { url: architectureSafeUrl(value) } : { note: value }) },
            sources: [source],
          });
          graph.link(appId, runtimeId, 'has-surface', source);
        }
        if (/cloudflare worker\s+([a-z0-9-]+)/i.test(value)) {
          const worker = value.match(/cloudflare worker\s+([a-z0-9-]+)/i)?.[1];
          if (worker) {
            const cfId = `cloudflare:${worker}`;
            graph.put({
              id: cfId, kind: 'cloudflare', label: worker, appId,
              details: { kind: 'worker', name: worker }, sources: [source],
            });
            graph.link(appId, cfId, 'uses-cloudflare', source);
            graph.link(cfId, 'runtime:cloudflare', 'runs-on', source);
          }
        }
      }
      const deploy = sqlString(fields.deploy_target ?? '');
      if (deploy.startsWith('cf-pages-') || deploy === 'mixed') {
        if (Object.values(surfaces).some(v => /pages|cloudflare|axon-app|workers/i.test(v)) || deploy.startsWith('cf-pages-')) {
          const cfId = `cloudflare:${appId}:pages`;
          graph.put({
            id: cfId, kind: 'cloudflare', label: `${APP_LABELS[productKey] ?? productKey} · Cloudflare Pages`, appId,
            details: { deployTarget: deploy }, sources: [source],
          });
          graph.link(appId, cfId, 'deploy-target', source);
          graph.link(cfId, 'runtime:cloudflare', 'runs-on', source);
        }
      }
      if (deploy === 'vps-systemd' || deploy === 'mixed') {
        graph.link(appId, 'runtime:vps-api', 'deploys-to', source);
      }
      if (deploy === 'tauri' || /Tauri/i.test(Object.values(surfaces).join(' '))) {
        graph.link(appId, 'runtime:mac-mini', 'runs-on', source);
      }
    }

    const insert = content.match(/select\s+'NorthSea'[\s\S]+?where not exists/i);
    if (insert) {
      addApp(graph, 'northsea', {
        label: 'NorthSea',
        description: 'Global Trade Center: commodity-deals, desk, crews en de MCP voor ChatGPT.',
        details: { product_key: 'northsea', supabase_ref: 'kbimnuepbecbyezedvih' },
      }, source);
      ensureProject(graph, 'kbimnuepbecbyezedvih', source, 'AXE Commodities');
    }
  }
}

function parseRegisteredAppSeeds(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.includes('registered_apps') && p.endsWith('.sql'))) {
    const source = graph.addSource(path, 'product-register');
    for (const match of content.matchAll(/\('([^']+)',\s*'((?:\\'|[^'])*)'/g)) {
      const name = match[1];
      if (!/AXE CORE HQ|Trading OS|AXE Companion|Axon Memory|NorthSea/i.test(name)) continue;
      const key =
        /CORE HQ/i.test(name) ? 'axe_core'
          : /Companion/i.test(name) ? 'axe_companion'
            : /Trading/i.test(name) ? 'trading_os'
              : /Axon/i.test(name) ? 'axon_memory'
                : 'northsea';
      addApp(graph, key, { label: name, description: match[2], details: { product_key: key } }, source);
    }
  }
}

function parseEcosystem(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('ECOSYSTEM.md') || p.endsWith('01-REALITEIT.md'))) {
    const source = graph.addSource(path, 'ecosystem');
    if (/axe-core-android/.test(content)) {
      addApp(graph, 'android_device_manager', {
        label: 'Android Device Manager',
        description: 'Kotlin/Compose shell that embeds the HQ web bundle and manages the Samsung.',
        details: { repo: 'Ldezeeuw445/axe-core-android', platform: 'Android' },
      }, source);
      graph.link('app:axe_core', 'app:android_device_manager', 'embeds', source);
    }
    for (const match of content.matchAll(/`?([a-z0-9-]+)`?\s+(?:app\.axon-memory|axon-memory)/gi)) {
      const project = match[1];
      if (!/axon/.test(project)) continue;
      const id = `cloudflare:${project}`;
      graph.put({
        id, kind: 'cloudflare', label: `Cloudflare Pages · ${project}`, appId: 'app:axon_memory',
        details: { project }, sources: [source],
      });
      graph.link('app:axon_memory', id, 'deploy-target', source);
      graph.link(id, 'runtime:cloudflare', 'runs-on', source);
    }
    if (/axe-companion\.service/.test(content)) {
      putService(graph, 'axe-companion', 'AXE Companion (Next.js on VPS)', 'app:axe_companion', source, {
        unit: 'axe-companion.service',
        host: 'runtime:vps-api',
      });
    }
    if (/\bollama\b/.test(content) && /11434/.test(content)) {
      putService(graph, 'ollama', 'Ollama', 'app:axe_core', source, { unit: 'ollama.service', port: '11434' });
    }
  }
}

function parseSqlTables(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('.sql') && (p.includes('supabase/') || p.includes('infra/migrations/')))) {
    const source = graph.addSource(path, 'migration');
    const { projectId, appId } = projectForSql(path);
    const ref = projectId.replace('supabase:', '');
    ensureProject(graph, ref, source);
    const clean = stripSql(content);
    for (const match of clean.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(public)\.)?([a-zA-Z_][\w]*)/gi)) {
      const table = match[2];
      if (/^pg_|schema_migrations/i.test(table)) continue;
      const id = `table:${ref}:${table}`;
      graph.put({
        id, kind: 'table', label: table, appId,
        details: { schema: 'public', table, projectRef: ref },
        sources: [source],
      });
      graph.link(projectId, id, 'has-table', source);
    }
  }
}

function parseCoreAgentSeeds(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of Object.entries(files)) {
    if (!/INSERT INTO core_agents/i.test(content)) continue;
    const source = graph.addSource(path, 'agent-seed');
    const block = content.split(/INSERT INTO core_agents/i)[1] ?? '';
    for (const match of block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:\\'|[^'])*)'/g)) {
      const [, name, display, role, description] = match;
      const id = `agent:${name}`;
      graph.put({
        id, kind: 'agent', label: display, description,
        details: { role, registry: 'core_agents' },
        sources: [source],
      });
      graph.link('app:axe_core', id, 'has-agent', source);
    }
  }
}

function parseMcpSeeds(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of Object.entries(files)) {
    if (!/INSERT INTO core_mcp_servers/i.test(content)) continue;
    const source = graph.addSource(path, 'mcp-seed');
    const block = content.split(/INSERT INTO core_mcp_servers/i)[1] ?? '';
    for (const match of block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:\\'|[^'])*)'/g)) {
      const [, name, display, description] = match;
      const id = `mcp:${name}`;
      graph.put({
        id, kind: 'mcp', label: display, description, appId: 'app:axe_core',
        details: { registry: 'core_mcp_servers' }, sources: [source],
      });
      graph.link('app:axe_core', id, 'uses-mcp', source);
    }
  }
}

function parseDaxSeeds(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of Object.entries(files)) {
    if (!/insert into public\.core_dax_computers/i.test(content)) continue;
    const source = graph.addSource(path, 'dax-seed');
    for (const match of content.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
      const idName = match[1];
      if (!idName.startsWith('dax-')) continue;
      const owner = match[2];
      const appId = owner === 'northsea' ? 'app:northsea' : owner === 'trading' ? 'app:trading_os' : 'app:axe_core';
      const id = `dax:${idName}`;
      graph.put({
        id, kind: 'dax', label: idName, appId,
        description: `DAX computer owned by ${owner}`,
        details: { owner_agent: owner, runtime: 'docker' },
        sources: [source],
      });
      graph.link(appId, id, 'has-dax', source);
      graph.link(`agent:${owner}`, id, 'owns-dax', source);
      graph.link(id, 'runtime:vps-strato', 'runs-on', source);
    }
  }
}

function parseRoster(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('roster.ts'))) {
    const source = graph.addSource(path, 'roster');
    const blocks = content.split(/\n\s*\{/).slice(1);
    for (const block of blocks) {
      const id = block.match(/\bid:\s*'([^']+)'/)?.[1];
      const name = block.match(/\bname:\s*'((?:\\'|[^'])*)'/)?.[1];
      const role = block.match(/\brole:\s*'((?:\\'|[^'])*)'/)?.[1];
      const handles = block.match(/\bhandles:\s*'((?:\\'|[^'])*)'/)?.[1];
      const tier = block.match(/\btier:\s*'([^']+)'/)?.[1];
      const runtime = block.match(/\bruntime:\s*'((?:\\'|[^'])*)'/)?.[1];
      const route = block.match(/\broute:\s*'([^']*)'/)?.[1];
      if (!id || !name) continue;
      const nodeId = `agent:${id}`;
      const appId = id === 'northsea' ? 'app:northsea' : id === 'trading' || id === 'intel' ? 'app:trading_os' : id === 'companion' ? 'app:axe_companion' : id === 'developer' ? 'app:axe_code' : 'app:axe_core';
      graph.put({
        id: nodeId, kind: 'agent', label: name, appId, description: handles,
        details: { role: role ?? '', tier: tier ?? '', runtime: runtime ?? '', route: route ?? '' },
        sources: [source],
      });
      graph.link(appId, nodeId, 'has-agent', source);
      graph.link('app:axe_core', nodeId, 'orchestrates', source);
    }
  }
}

function parseSpecialists(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('specialists.ts'))) {
    const source = graph.addSource(path, 'crew-specialists');
    const crewId = 'crew:wingman';
    graph.put({
      id: crewId, kind: 'crew', label: 'Wingman CrewAI crew', appId: 'app:axe_core',
      description: 'Nine specialists driven by Wingman via /crew/run',
      details: { runner: 'backend/axe_api/run_crew.py' },
      sources: [source],
    });
    graph.link('agent:wingman', crewId, 'runs-crew', source);
    graph.link('app:axe_core', crewId, 'has-crew', source);
    const blocks = content.split(/\n\s*\{/).slice(1);
    for (const block of blocks) {
      const id = block.match(/\bid:\s*'([^']+)'/)?.[1];
      const name = block.match(/\bname:\s*'((?:\\'|[^'])*)'/)?.[1];
      const role = block.match(/\brole:\s*'((?:\\'|[^'])*)'/)?.[1];
      const focus = block.match(/\bfocus:\s*'((?:\\'|[^'])*)'/)?.[1];
      if (!id || !name) continue;
      const nodeId = `specialist:${id}`;
      graph.put({
        id: nodeId, kind: 'agent', label: name, appId: 'app:axe_core', description: focus,
        details: { role: role ?? '', crew: 'wingman', specialistId: id },
        sources: [source],
      });
      graph.link(crewId, nodeId, 'has-member', source);
    }
  }
}

function parseNorthseaCrews(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => /crews\/config\/.+\/crew\.yaml$/.test(p) || p.endsWith('crews/catalog.py'))) {
    const source = graph.addSource(path, 'northsea-crew');
    if (path.endsWith('crew.yaml')) {
      const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
      const folder = path.split('/config/')[1]?.split('/')[0] ?? architectureSlug(name || 'crew');
      const crewId = `crew:northsea:${folder}`;
      graph.put({
        id: crewId, kind: 'crew', label: name || folder, appId: 'app:northsea',
        details: { config: path, studio_id: content.match(/studio_id:\s*(\S+)/)?.[1] ?? '' },
        sources: [source],
      });
      graph.link('agent:northsea', crewId, 'runs-crew', source);
      graph.link('app:northsea', crewId, 'has-crew', source);
      const agentsPath = path.replace(/crew\.yaml$/, 'agents.yaml');
      const agents = files[agentsPath];
      if (agents) {
        graph.addSource(agentsPath, 'northsea-crew');
        const keys = [...agents.matchAll(/^([a-z][a-z0-9_]+):\s*$/gm)]
          .map(m => m[1])
          .filter(key => !['role', 'goal', 'backstory', 'llm', 'tools'].includes(key));
        for (const key of keys) {
          const slice = agents.split(new RegExp(`^${key}:\\s*$`, 'm'))[1] ?? '';
          const role = slice.match(/role:\s*(?:>\s*)?([^\n]+)/)?.[1]?.trim();
          const memberId = `specialist:northsea:${key}`;
          graph.put({
            id: memberId, kind: 'agent', label: role || key, appId: 'app:northsea',
            details: { crew: folder, specialistId: key },
            sources: [agentsPath],
          });
          graph.link(crewId, memberId, 'has-member', agentsPath);
        }
      }
    }
  }
}

function parseTradingCrew(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('researchCrewPrompt.ts'))) {
    const source = graph.addSource(path, 'trading-crew');
    const crewId = 'crew:trading-research';
    graph.put({
      id: crewId, kind: 'crew', label: 'Trading research crew', appId: 'app:trading_os',
      description: 'CrewAI research cycle for Trading Intel',
      details: { runner: '/crew/run' },
      sources: [source],
    });
    graph.link('agent:trading', crewId, 'runs-crew', source);
    const specialists = content.match(/RESEARCH_CREW_SPECIALISTS = \[([^\]]+)\]/)?.[1] ?? '';
    for (const name of specialists.match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) ?? []) {
      graph.link(crewId, `specialist:${name}`, 'has-member', source);
    }
  }
}

function parseProviders(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('providers.ts'))) {
    const source = graph.addSource(path, 'providers');
    for (const match of content.matchAll(/\{\s*id:'([^']+)',\s*name:'((?:\\'|[^'])*)',\s*baseUrl:([^,]+),\s*defaultModel:'((?:\\'|[^'])*)'/g)) {
      const [, id, name, , model] = match;
      const nodeId = `provider:${id}`;
      graph.put({
        id: nodeId, kind: 'provider', label: name, appId: 'app:axe_core',
        details: { providerId: id, defaultModel: model },
        sources: [source],
      });
      graph.link('app:axe_core', nodeId, 'uses-provider', source);
      if (id === 'ollama') graph.link(nodeId, 'service:ollama', 'served-by', source);
    }
  }
}

function parseCodingSeats(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('abonnementChat.ts'))) {
    const source = graph.addSource(path, 'coding-seats');
    const engines = content.match(/ALLE_MOTOREN[^=]*= \[([^\]]+)\]/)?.[1] ?? '';
    for (const name of engines.match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) ?? []) {
      const family = name.replace(/\d+$/, '');
      const id = `coding-seat:${name}`;
      graph.put({
        id, kind: 'coding-seat', label: name, appId: 'app:axe_code',
        description: `CLI coding seat (${family})`,
        details: { engine: name, family, mode: 'plan-in-chat' },
        sources: [source],
      });
      graph.link('app:axe_code', id, 'has-seat', source);
      graph.link('agent:developer', id, 'uses-seat', source);
    }
  }
}

function putService(
  graph: ReturnType<typeof createArchitectureGraph>,
  unit: string,
  label: string,
  appId: string,
  source: string,
  details: ArchitectureNode['details'] = {},
) {
  const id = `service:${unit.replace(/\.service$/, '')}`;
  const name = unit.replace(/\.service$/, '');
  graph.put({
    id, kind: 'service', label, appId,
    details: { unit: name, ...details },
    sources: [source],
  });
  graph.link(appId, id, 'runs-service', source);
  const host = typeof details.host === 'string' ? details.host : undefined;
  if (host) graph.link(id, host, 'runs-on', source);
  else if (name === 'ollama') graph.link(id, 'runtime:vps-strato', 'runs-on', source);
  else graph.link(id, 'runtime:vps-api', 'runs-on', source);
}

function parseVpsManifest(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('vps_sync.py'))) {
    const source = graph.addSource(path, 'vps-manifest');
    const block = content.match(/MANIFEST\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const units = new Set<string>();
    for (const match of block.matchAll(/,\s*"([a-z0-9-]+)"\)/g)) units.add(match[1]);
    for (const unit of units) {
      putService(graph, unit, unit, unit.includes('northsea') ? 'app:northsea' : 'app:axe_core', source, {
        from: 'vps_sync.MANIFEST',
      });
    }
  }
}

function parseSystemdUnits(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => p.endsWith('.service'))) {
    const source = graph.addSource(path, 'systemd');
    const fileName = path.split('/').pop()?.replace(/\.service$/, '') ?? '';
    const description = content.match(/Description=(.+)/)?.[1]?.trim() || fileName;
    const after = content.match(/After=(.+)/)?.[1]?.trim();
    const appId = fileName.includes('northsea') ? 'app:northsea' : fileName.includes('companion') ? 'app:axe_companion' : 'app:axe_core';
    putService(graph, fileName, description, appId, source, { unitFile: path, ...(after ? { after } : {}) });
    if (fileName === 'northsea-mcp') {
      graph.put({
        id: 'mcp:northsea-mcp', kind: 'mcp', label: 'northsea-mcp', appId: 'app:northsea',
        description, details: { transport: 'http', unit: fileName }, sources: [source],
      });
      graph.link('app:northsea', 'mcp:northsea-mcp', 'uses-mcp', source);
      graph.link('mcp:northsea-mcp', `service:${fileName}`, 'served-by', source);
    }
  }
}

function parseLaunchd(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => /install-.*launchd/.test(p))) {
    const source = graph.addSource(path, 'launchd');
    const labels = [...content.matchAll(/LABEL="(com\.axe\.[a-z0-9-]+)"/g), ...content.matchAll(/com\.axe\.[a-z0-9-]+/g)]
      .map(m => m[1] ?? m[0]);
    for (const label of uniqueLabels(labels)) {
      const id = `worker:${label}`;
      const onImac = /autosync|computer-worker/.test(label);
      graph.put({
        id, kind: 'worker', label, appId: 'app:axe_core',
        description: `launchd agent from ${path.split('/').pop()}`,
        details: { label, hosts: onImac ? ['Mac mini', 'iMac'] : ['Mac mini'] },
        sources: [source],
      });
      graph.link('app:axe_core', id, 'runs-worker', source);
      graph.link(id, 'runtime:mac-mini', 'runs-on', source);
      if (onImac) graph.link(id, 'runtime:imac', 'runs-on', source);
    }
  }
}

function uniqueLabels(values: string[]): string[] {
  return [...new Set(values.filter(v => v.startsWith('com.axe.')))];
}

function parseNamedServices(graph: ReturnType<typeof createArchitectureGraph>, files: ArchitectureFileMap) {
  for (const [path, content] of filesMatching(files, p => /install-camofox|install-axe-terminal|axe-mac-tunnel|vps-bootstrap/.test(p))) {
    const source = graph.addSource(path, 'systemd');
    for (const match of content.matchAll(/\/etc\/systemd\/system\/([a-z0-9.-]+)\.service/g)) {
      const unit = match[1];
      const appId = unit.includes('companion') ? 'app:axe_companion' : 'app:axe_core';
      const label = unit === 'camofox-browser' ? 'camofox' : unit;
      putService(graph, unit, label, appId, source, { unitFile: path });
      if (unit.startsWith('camofox')) {
        putService(graph, 'camofox', 'camofox', appId, source, { aliasOf: unit });
      }
    }
    if (/axe-tunnel-relay\.service/.test(content) || /axe-tunnel-relay on /.test(content)) {
      putService(graph, 'axe-tunnel-relay', 'axe-tunnel-relay', 'app:axe_core', source, { listen: '127.0.0.1:4023' });
    }
    if (/ollama\.service/.test(content)) {
      putService(graph, 'ollama', 'Ollama', 'app:axe_core', source, { unit: 'ollama.service' });
    }
  }
}

export function missingArchitectureInventory(
  manifest: ArchitectureManifest,
  inventory: {
    apps: readonly string[];
    services: readonly string[];
    tables: readonly string[];
    projects: readonly string[];
    workers?: readonly string[];
  },
): string[] {
  const missing: string[] = [];
  const ids = manifest.nodes.map(n => n.id);
  const haystack = (kind: ArchitectureKind, needle: string) =>
    manifest.nodes.some(node => node.kind === kind && (node.id.includes(needle) || node.label.toLowerCase().includes(needle.toLowerCase())));

  for (const app of inventory.apps) {
    if (!ids.includes(`app:${app}`)) missing.push(`app:${app}`);
  }
  for (const service of inventory.services) {
    if (!haystack('service', service) && !haystack('mcp', service)) missing.push(`service:${service}`);
  }
  for (const table of inventory.tables) {
    if (!manifest.nodes.some(node => node.kind === 'table' && node.label === table)) missing.push(`table:${table}`);
  }
  for (const project of inventory.projects) {
    if (!ids.includes(`supabase:${project}`)) missing.push(`supabase:${project}`);
  }
  for (const worker of inventory.workers ?? []) {
    if (!haystack('worker', worker)) missing.push(`worker:${worker}`);
  }
  return missing;
}
