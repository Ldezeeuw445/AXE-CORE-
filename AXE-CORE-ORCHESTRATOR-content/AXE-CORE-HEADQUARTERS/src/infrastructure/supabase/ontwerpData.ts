/**
 * Verzonnen rijen, alleen voor de ontwerpmodus.
 *
 * Zonder sessie weigert Supabase alles, en dan rendert bijna elke tab leeg --
 * /agents gaf letterlijk vier tekens tekst. Layout beoordelen op een leeg
 * scherm kan niet: je ziet niet dat vier dingen in tien procent van de pagina
 * gepropt zitten als er niets in staat.
 *
 * Dit bestand wordt ALLEEN geladen via een dynamische import achter
 * ontwerpModus(), en die is in een gebouwde app dood. Zie ontwerpModus.ts voor
 * het commando waarmee je dat zelf kunt nameten.
 *
 * De rijen zijn met opzet saai en herkenbaar nep ("Voorbeeld ..."), zodat een
 * screenshot uit de ontwerpmodus nooit voor echte data aangezien kan worden.
 */
import { ONTWERP_MARKERING } from '@/infrastructure/supabase/ontwerpModus';

type Rij = Record<string, unknown>;

const nu = () => new Date().toISOString();
const geleden = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** Genoeg rijen om een raster te vullen: te weinig verbergt juist de fout die
 *  je zoekt, want vier kaarten passen overal wel. */
function reeks(n: number, maak: (i: number) => Rij): Rij[] {
  return Array.from({ length: n }, (_, i) => maak(i));
}

const TABELLEN: Record<string, Rij[]> = {
  core_agents: reeks(14, i => ({
    id: `voorbeeld-agent-${i}`,
    name: `Voorbeeld agent ${i + 1}`,
    role: ['orchestrator', 'analyst', 'developer', 'trader', 'assistant'][i % 5],
    status: i % 4 === 0 ? 'standby' : 'active',
    description: 'Voorbeeldtekst om te zien hoe een kaart met twee regels omgaat.',
    model: 'voorbeeld/model-1',
    tab: ['home', 'trading', 'memory', 'apps'][i % 4],
    updated_at: geleden(i * 7),
  })),
  core_tasks: reeks(12, i => ({
    id: `voorbeeld-taak-${i}`,
    title: `Voorbeeldtaak ${i + 1} met een titel die net te lang is voor één regel`,
    status: ['open', 'completed', 'running'][i % 3],
    priority: ['low', 'medium', 'high'][i % 3],
    created_at: geleden(i * 30),
    updated_at: geleden(i * 12),
  })),
  core_notifications: reeks(9, i => ({
    id: `voorbeeld-melding-${i}`,
    type: ['info', 'warning', 'error'][i % 3],
    message: `Voorbeeldmelding ${i + 1} — dit is nepdata uit de ontwerpmodus.`,
    read: i % 3 === 0,
    created_at: geleden(i * 20),
  })),
  core_system_state: reeks(10, i => ({
    service: ['supabase', 'ollama', 'crewai', 'github', 'openrouter', 'livekit', 'metaapi', 'terminal', 'n8n', 'xai'][i],
    status: i % 5 === 0 ? 'offline' : 'online',
    latency_ms: 40 + i * 11,
    updated_at: geleden(i),
  })),
  memory: reeks(16, i => ({
    id: `voorbeeld-geheugen-${i}`,
    agent: ['axe_trader', 'axe_intel', 'axe_companion', 'global'][i % 4],
    key: `voorbeeld_sleutel_${i}`,
    value: 'Voorbeeldinhoud van een herinnering, lang genoeg om te zien of hij afkapt of doorloopt.',
    created_at: geleden(i * 45),
  })),
  rag_memories: reeks(14, i => ({
    id: `voorbeeld-rag-${i}`,
    category: ['agent', 'trading', 'system'][i % 3],
    content: `Voorbeeldfeit ${i + 1} — verzonnen tekst voor de ontwerpmodus.`,
    importance: 4 + (i % 6),
    created_at: geleden(i * 60),
  })),
  global_memory: reeks(10, i => ({
    id: `voorbeeld-global-${i}`,
    category: 'agent_performance',
    key: `voorbeeld:${i}`,
    value: JSON.stringify({ total: i + 2, successes: i, latency: 120 }),
    confidence: 0.5 + (i % 5) / 10,
    updated_at: geleden(i * 15),
  })),
  agent_learning_episodes: reeks(8, i => ({
    id: `voorbeeld-episode-${i}`,
    agent: ['trading', 'chat', 'browser', 'code-editor'][i % 4],
    subject: `VOORBEELD${i}`,
    verdict: ['good', 'poor', 'unknown'][i % 3],
    applied: i % 2 === 0,
    opened_at: geleden(i * 25),
  })),
  /** De Infrastructure-tab leest t.tbl; zonder dat veld viel de pagina om.
   *  Nepdata die een veld mist dat de app verwacht, verbergt geen fout -- hij
   *  maakt er een. */
  supabase_tables: reeks(12, i => ({
    tbl: ['core_agents', 'core_tasks', 'memory', 'rag_memories', 'core_notifications',
          'global_memory', 'core_schedules', 'trading_positions', 'axe_intel_reports',
          'companion_notes', 'core_tools', 'core_system_state'][i],
    approx_rows: (i + 1) * 37,
  })),
  core_schedules: reeks(7, i => ({
    id: `voorbeeld-planning-${i}`,
    name: `Voorbeeldtaak ${i + 1}`,
    cron: '*/15 * * * *',
    enabled: i % 3 !== 0,
    last_status: i % 4 === 0 ? 'fail' : 'ok',
    last_run_at: geleden(i * 18),
  })),
};

/** Onbekende tabel: liever een paar generieke rijen dan leeg, want leeg is
 *  precies de toestand waarin je layoutfouten niet ziet. */
function vulling(tabel: string): Rij[] {
  return reeks(8, i => ({
    id: `voorbeeld-${tabel}-${i}`,
    name: `Voorbeeld ${i + 1}`,
    title: `Voorbeeld ${i + 1}`,
    status: i % 3 === 0 ? 'offline' : 'active',
    created_at: geleden(i * 10),
    updated_at: nu(),
  }));
}

export function rijenVoor(tabel: string): Rij[] {
  return TABELLEN[tabel] ?? vulling(tabel);
}

/**
 * Een namaak-client die zich gedraagt als de query-bouwer van supabase-js:
 * elke methode geeft zichzelf terug, en het geheel is awaitable.
 *
 * Bewust géén filters: het doel is de pagina VOL krijgen om de indeling te
 * beoordelen, niet om de database na te bootsen. Wie hier logica in bouwt,
 * bouwt een tweede waarheid die uit de pas gaat lopen.
 */
export function ontwerpClient(): unknown {
  const bouwer = (tabel: string) => {
    const rijen = rijenVoor(tabel);
    const resultaat = { data: rijen, error: null, count: rijen.length, status: 200 };
    const enkel = { data: rijen[0] ?? null, error: null, status: 200 };

    const proxy: Record<string, unknown> = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (op: any) => Promise.resolve(resultaat).then(op),
      single: () => Promise.resolve(enkel),
      maybeSingle: () => Promise.resolve(enkel),
      csv: () => Promise.resolve({ data: '', error: null }),
    };
    for (const naam of [
      'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
      'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy',
      'order', 'limit', 'range', 'filter', 'match', 'not', 'or', 'textSearch',
      'abortSignal', 'returns', 'overrideTypes', 'throwOnError',
    ]) {
      proxy[naam] = () => proxy;
    }
    return proxy;
  };

  return {
    ontwerp: ONTWERP_MARKERING,
    from: (tabel: string) => bouwer(tabel),
    rpc: () => bouwer('rpc'),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) },
  };
}
