/**
 * De leerlus voor agents, duurzaam opgeslagen.
 *
 * ## Waarom niet memoryFeedbackService
 *
 * Die bestaat al en werkt -- voor de chat. Twee eigenschappen maken hem
 * ongeschikt voor agents, en allebei zijn ze voor de chat juist goed:
 *
 *   localStorage    een beurt speelt zich af in één tabblad, dus dat volstaat.
 *                   Een agent niet: de autopilot draait op de Mac Mini en de
 *                   uitkomst zie je op je iMac. Wat op het ene apparaat wordt
 *                   geleerd, moet op het andere gelden.
 *
 *   45 minuten TTL  een chatbeurt is binnen seconden beoordeeld. Een trade
 *                   lost soms pas dagen later op. Met die vervaltijd zou elke
 *                   episode verlopen zijn voordat het antwoord er is, en zou
 *                   de lus stilletjes nooit rondkomen.
 *
 * Dus: dezelfde vorm, andere opslag. De regels staan in domain/memory/agentLoop.
 *
 * ## Waarom een eigen tabel
 *
 * Episodes zijn hoog in aantal en laag in betekenis. In global_memory zouden
 * ze de hubtellingen vertekenen -- precies wat er op 2 sep is opgeruimd toen
 * bleek dat 24.629 trading-rijen onder één generieke categorie stonden.
 */
import { getSupabase, currentUserId } from '@/infrastructure/supabase/supabaseClient';
import { sbGetRows, sbUpdateRow } from '@/infrastructure/gateways/axeCoreApiService';
import type { MemoryRow } from '@/infrastructure/persistence/agentMemoryService';
import { AGENT_CATALOG } from '@/domain/agents/catalog';
import {
  type Episode, type LoopAgent, type Verdict,
  pendingForReinforcement, tallyHits, reinforcedImportance, loopHealth,
  type LoopHealth, LOOP_AGENTS,
} from '@/domain/memory/agentLoop';

const TABLE = 'agent_learning_episodes';

interface Row {
  id: string;
  agent: string;
  subject: string;
  memory_ids: string[] | null;
  memory_keys: string[] | null;
  verdict: Verdict;
  applied: boolean;
  opened_at: string;
  closed_at: string | null;
}

function toEpisode(r: Row): Episode {
  return {
    id: r.id,
    agent: r.agent as LoopAgent,
    subject: r.subject,
    memoryIds: r.memory_ids ?? [],
    memoryKeys: r.memory_keys ?? [],
    verdict: r.verdict,
    applied: r.applied,
    openedAt: Date.parse(r.opened_at),
    closedAt: r.closed_at ? Date.parse(r.closed_at) : undefined,
  };
}

/**
 * Opent een episode: dit ging deze beslissing in.
 *
 * Geeft het id terug dat je later nodig hebt om hem te sluiten, of null als
 * het niet lukte. Null en niet een gegooide fout, want een agent hoort niet
 * te stoppen omdat zijn logboek hapert -- maar hij hoort ook niet te doen
 * alsof het gelukt is, want dan lijkt de lus te draaien terwijl er niets
 * wordt vastgelegd.
 */
export async function openEpisode(input: {
  agent: LoopAgent;
  subject: string;
  memoryIds?: string[];
  memoryKeys?: string[];
}): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const userId = await currentUserId(sb);
  if (!userId) return null;

  const { data, error } = await sb.from(TABLE).insert({
    user_id: userId,
    agent: input.agent,
    subject: input.subject.slice(0, 500),
    memory_ids: input.memoryIds ?? [],
    memory_keys: input.memoryKeys ?? [],
  }).select('id').single();

  if (error) {
    console.error('[agentLoop] could not open episode', input.agent, error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Sluit een episode met hoe het afliep.
 *
 * Een episode die nooit gesloten wordt, versterkt nooit iets. Dat is geen
 * ramp -- verval doet de rest -- maar het is wel het verschil tussen een lus
 * die draait en een die er alleen zo uitziet. Zie loopHealth.
 */
export async function closeEpisode(
  episodeId: string | null,
  verdict: Verdict,
  note?: string,
): Promise<boolean> {
  if (!episodeId) return false;
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.from(TABLE)
    .update({ verdict, outcome_note: note?.slice(0, 500) ?? null, closed_at: new Date().toISOString() })
    .eq('id', episodeId);

  if (error) {
    console.error('[agentLoop] could not close episode', episodeId, error.message);
    return false;
  }
  return true;
}

export interface AgentReinforcementReport {
  /** Episodes that were fully reinforced AND marked applied. */
  episodes: number;
  /** Individual memory references successfully reinforced. */
  memories: number;
  /** Failed/unresolved references or episode state writes. */
  failed: number;
}

type PreparedReinforcement = {
  label: string;
  apply: () => Promise<void>;
  rollback: () => Promise<void>;
};

/**
 * Namespace(s) an episode is allowed to reinforce in the namespaced memory
 * table. This is derived from the canonical catalog wherever one exists;
 * only the two pre-catalog identities (chat/research) and the developer's
 * historical loop name need aliases.
 */
function namespacesForLoopAgent(agent: LoopAgent): string[] {
  if (agent === 'chat') return ['global'];
  if (agent === 'research') return ['axe_research', 'global'];

  const catalogId = agent === 'code-editor' ? 'developer' : agent;
  const entry = AGENT_CATALOG.find(a => a.kind === 'core' && a.id === catalogId);
  const own = entry?.namespace;
  return own && own !== 'global' ? [own, 'global'] : ['global'];
}

async function prepareRagReinforcement(
  id: string,
  hits = 1,
): Promise<PreparedReinforcement> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase unavailable');

  const { data, error } = await sb
    .from('rag_memories').select('importance').eq('id', id).single();
  if (error) throw new Error(error.message);

  const before = Number.isFinite(Number(data?.importance)) ? Number(data?.importance) : 5;
  const after = reinforcedImportance(before, hits);

  return {
    label: `rag:${id}`,
    apply: async () => {
      const { error: upErr } = await sb
        .from('rag_memories').update({ importance: after }).eq('id', id);
      if (upErr) throw new Error(upErr.message);
    },
    rollback: async () => {
      const { error: rollErr } = await sb
        .from('rag_memories').update({ importance: before }).eq('id', id);
      if (rollErr) throw new Error(rollErr.message);
    },
  };
}

/**
 * Resolve one reference into the namespaced `memory` table.
 *
 * New Trading episodes use `memory-id:<uuid>`, which is exact. Older
 * episodes contain raw keys. Those are accepted only when they resolve to
 * exactly one row inside the episode agent's own/global namespaces. Ambiguous
 * historical keys stay pending rather than reinforcing a guessed row.
 */
async function prepareAgentMemoryReinforcement(
  ref: string,
  agent: LoopAgent,
): Promise<PreparedReinforcement> {
  const namespaces = new Set(namespacesForLoopAgent(agent));
  const byId = ref.startsWith('memory-id:');
  const explicitKey = ref.startsWith('memory-key:');
  const value = byId
    ? ref.slice('memory-id:'.length)
    : explicitKey ? ref.slice('memory-key:'.length) : ref;

  if (!value) throw new Error('empty memory reference');

  const rows = await sbGetRows<MemoryRow>('memory', {
    limit: byId ? 2 : 100,
    filterCol: byId ? 'id' : 'key',
    filterVal: value,
  });
  const candidates = (rows ?? []).filter(row => namespaces.has(row.agent));

  if (candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? `memory ref not found in ${[...namespaces].join(',')}: ${ref}`
        : `ambiguous legacy memory ref (${candidates.length} rows): ${ref}`,
    );
  }

  const row = candidates[0];
  const before = Number.isFinite(Number(row.importance)) ? Number(row.importance) : 5;
  const after = reinforcedImportance(before, 1);

  return {
    label: `memory:${row.id}`,
    apply: async () => {
      await sbUpdateRow('memory', row.id, { importance: after });
    },
    rollback: async () => {
      await sbUpdateRow('memory', row.id, { importance: before });
    },
  };
}

/**
 * Versterkt wat in de kamer stond toen het goed ging.
 *
 * Cruciaal: `memory_ids` zijn RAG ids; `memory_keys` zijn references naar
 * de namespaced `memory` store. Een episode wordt alleen `applied=true`
 * nadat ALLE bedoelde references zijn resolved en geschreven. De 42 historische
 * episodes die al applied zijn worden bewust niet opnieuw afgespeeld.
 */
export async function applyAgentReinforcement(): Promise<AgentReinforcementReport> {
  const report: AgentReinforcementReport = { episodes: 0, memories: 0, failed: 0 };
  const sb = getSupabase();
  if (!sb) return report;
  const userId = await currentUserId(sb);
  if (!userId) return report;

  const { data, error } = await sb.from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('verdict', 'good')
    .eq('applied', false)
    .limit(500);

  if (error) {
    console.error('[agentLoop] could not read episodes', error.message);
    report.failed++;
    return report;
  }

  const pending = pendingForReinforcement((data ?? []).map(r => toEpisode(r as Row)));
  if (!pending.length) return report;

  for (const episode of pending) {
    const prepared: PreparedReinforcement[] = [];
    try {
      // Resolve every reference BEFORE writing anything. That makes stale or
      // ambiguous legacy keys a clean no-op rather than a partially learned
      // episode.
      for (const id of new Set(episode.memoryIds)) {
        prepared.push(await prepareRagReinforcement(id, 1));
      }
      for (const ref of new Set(episode.memoryKeys)) {
        prepared.push(await prepareAgentMemoryReinforcement(ref, episode.agent));
      }
      if (!prepared.length) continue;
    } catch (err) {
      report.failed++;
      console.error('[agentLoop] could not resolve episode references', episode.id, err);
      continue;
    }

    const applied: PreparedReinforcement[] = [];
    try {
      for (const op of prepared) {
        await op.apply();
        applied.push(op);
      }

      // Mark ONE episode only after every reference succeeded. This replaces
      // the old bulk update that checked off key-only episodes even when zero
      // memories had changed.
      const { error: markErr } = await sb.from(TABLE)
        .update({ applied: true })
        .eq('user_id', userId)
        .eq('id', episode.id)
        .eq('applied', false);
      if (markErr) throw new Error(markErr.message);

      report.episodes++;
      report.memories += applied.length;
    } catch (err) {
      report.failed++;
      console.error('[agentLoop] reinforcement failed; rolling episode back', episode.id, err);

      // Compensate in reverse order so a transient failure does not leave half
      // an episode reinforced and then reinforce those rows again next pass.
      for (const op of [...applied].reverse()) {
        try {
          await op.rollback();
        } catch (rollbackErr) {
          report.failed++;
          console.error('[agentLoop] reinforcement rollback failed', episode.id, op.label, rollbackErr);
        }
      }
    }
  }

  return report;
}

/**
 * Per agent: draait zijn lus echt rond?
 *
 * `closeRate` is het getal dat telt. Een agent die opent maar nooit sluit,
 * ziet er van buiten uit alsof hij leert.
 */
export async function agentLoopHealth(): Promise<LoopHealth[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const userId = await currentUserId(sb);
  if (!userId) return [];

  const { data, error } = await sb.from(TABLE)
    .select('*').eq('user_id', userId)
    .order('opened_at', { ascending: false }).limit(1000);

  if (error) {
    console.error('[agentLoop] could not read health', error.message);
    return [];
  }

  const episodes = (data ?? []).map(r => toEpisode(r as Row));
  return LOOP_AGENTS.map(a => loopHealth(a, episodes));
}

/**
 * Sluit de episode die bij een afgelopen trade hoort.
 *
 * ## Het correlatieprobleem, en waarom dit geen gok is
 *
 * Een trade weet zijn episode-id niet: tussen de beslissing en de afsluiting
 * zitten een order, een positie en soms dagen. Het id daar doorheen rijgen
 * raakt vier lagen die er verder niets mee te maken hebben.
 *
 * Het alternatief -- "de meest recente open episode voor dit symbool" -- is
 * wél een gok, en een schadelijke: draaien er twee cycli voordat de eerste
 * trade sluit, dan krijgt de nieuwste episode de uitkomst van de oudste. Dan
 * versterk je de verkeerde herinneringen, en dat is erger dan niets doen.
 *
 * `holdingMinutes` maakt het exact. Daaruit volgt wanneer de trade openging,
 * en de episode die hem voedde moet daarvóór geopend zijn. De nieuwste die
 * daaraan voldoet is de beslissing die tot deze trade leidde.
 *
 * Past er geen enkele, dan gebeurt er niets. Een uitkomst zonder bijbehorende
 * beslissing is geen bewijs over het geheugen.
 */
export async function closeTradingEpisodeForTrade(input: {
  symbol: string;
  /** Hoe lang de positie open stond. Bepaalt welk moment we terugzoeken. */
  holdingMinutes: number;
  win: boolean;
  note?: string;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const userId = await currentUserId(sb);
  if (!userId) return false;

  const held = Number.isFinite(input.holdingMinutes) ? Math.max(0, input.holdingMinutes) : 0;
  const openedBefore = new Date(Date.now() - held * 60_000).toISOString();

  const { data, error } = await sb.from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('agent', 'trading')
    .eq('subject', input.symbol)
    .eq('verdict', 'unknown')
    .lte('opened_at', openedBefore)
    .order('opened_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[agentLoop] could not look up an episode for', input.symbol, error.message);
    return false;
  }
  const id = data?.[0]?.id;
  if (!id) return false;

  return closeEpisode(id, input.win ? 'good' : 'poor', input.note);
}
