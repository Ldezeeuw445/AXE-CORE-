/**
 * installTierRouter — de laag vóór AXE.
 *
 * Elke getypte of gesproken beurt gaat eerst door de classifier.
 * Tier 1 antwoordt uit regels + opgeslagen data, zonder groot model.
 * Tier 2 gebruikt een klein snel model met lichte context.
 * Tier 3 zet werk uit bij een bestaande agent en meldt meteen "on it".
 * Timeout of fout → het huidige pad (installStableChat / voiceStore).
 *
 * NorthSea auto-send vlaggen blijven hier buiten. Geen UI-wijziging.
 */
import { useVoiceStore, getProviderKeySlot, writeConversationMemory, type ConversationMessage, type RoutingEvent } from '@/presentation/store/voiceStore';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';
import { AXE_SYSTEM_PROMPT, CONVERSATION_FIRST_RULE } from '@/domain/prompts';
import { replyLanguageInstruction } from '@/domain/replyLanguage';
import { zichtbareAxeAntwoord } from '@/domain/tools/toolLeak';
import { PROVIDERS, type KeySlot } from '@/domain/providers';
import {
  TIER2_GROQ_MODEL,
  agendaAntwoord,
  capabilityVoorAgent,
  groetAntwoord,
  prioriteitenAntwoord,
  statusAntwoord,
  takenAntwoord,
  tier3Ack,
} from '@/domain/tierRouter/axeRoute';
import { kiesAxeRoute, type AxeRouteKeuze } from '@/application/tierRouter/kiesAxeRoute';
import { haalTier1Kijk } from '@/application/tierRouter/haalTier1Kijk';
import { volgendeAxeBericht } from '@/application/chat/chatStreamBeurt';
import { streamProvider } from '@/infrastructure/gateways/llmStream';
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { detectMacRoute } from '@/infrastructure/gateways/macRelayService';
import {
  createDurableTask,
  getDurableTask,
  type DurableTaskSnapshot,
} from '@/infrastructure/gateways/axeCoreApiService';
import { noteRetrieval, noteOwnerOutcome } from '@/infrastructure/persistence/memoryFeedbackService';
import { extractMemoryFromMessage } from '@/infrastructure/persistence/ragMemoryService';
import { speakGlobal, stopGlobalTts } from '@/infrastructure/gateways/globalTts';

let installed = false;
const taskMonitors = new Set<string>();

function speakAxe(text: string, onDone?: () => void): void {
  try {
    if (localStorage.getItem('axe_response_mode') === 'type') { onDone?.(); return; }
  } catch { /* ignore */ }
  stopGlobalTts();
  speakGlobal(text, onDone, (reason) => useVoiceStore.setState({ error: reason }));
}

export function pushTierRoute(keuze: AxeRouteKeuze, extra: Partial<RoutingEvent> = {}): void {
  const evt: RoutingEvent = {
    id: `re_${Date.now()}`,
    ts: Date.now(),
    query: extra.query ?? '',
    capability: keuze.kind,
    slotOrder: extra.slotOrder ?? [],
    attempts: extra.attempts ?? [],
    winner: extra.winner,
    winnerModel: extra.winnerModel,
    delegate: keuze.agent,
    via: keuze.via === 'fallback'
      ? 'fallback'
      : keuze.tier === 1
        ? 'rules'
        : keuze.tier === 3
          ? 'tier3'
          : 'tier2',
    routeTier: keuze.tier,
    routeMs: Math.round(keuze.latencyMs),
    ...extra,
  };
  useVoiceStore.setState((s) => {
    const updated = [evt, ...s.routingLog].slice(0, 50);
    try { localStorage.setItem('axe_routing_log', JSON.stringify(updated)); } catch { /* ignore */ }
    return { routingLog: updated };
  });
  console.info(
    `%c[AXE] route%c tier ${keuze.tier} · ${keuze.via} · ${Math.round(keuze.latencyMs)}ms · ${keuze.reason}`,
    'color:#22D3EE;font-weight:600',
    'color:inherit',
  );
}

function zetGebruiker(text: string): void {
  useVoiceStore.setState((s) => ({
    conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }],
    voiceStatus: 'processing' as const,
    error: null,
  }));
}

function haalGebruikerWeg(text: string): void {
  const conv = useVoiceStore.getState().conversation;
  if (conv.length > 0 && conv[conv.length - 1]?.role === 'user' && conv[conv.length - 1]?.text === text) {
    useVoiceStore.setState({ conversation: conv.slice(0, -1) });
  }
}

function publiceer(text: string, slot: { provider: string; model?: string }, lastUser: string): void {
  const visible = zichtbareAxeAntwoord(text) || text;
  const axeMsg: ConversationMessage = {
    role: 'axe',
    text: visible,
    timestamp: Date.now(),
    provider: slot.provider,
    model: slot.model,
    delegate: 'axe',
  };
  useVoiceStore.setState((s) => ({
    conversation: [...s.conversation, axeMsg],
    response: visible,
    voiceStatus: 'speaking' as const,
    error: null,
  }));
  speakAxe(visible, () => {
    useVoiceStore.setState({ voiceStatus: 'idle' });
  });
  void lastUser;
}

function recordBeurt(q: string, a: string, provider: string, capability: string): void {
  noteRetrieval(q, [], [], 'chat');
  noteOwnerOutcome('chat', 'good');
  void writeConversationMemory(q, a, provider, capability);
  void extractMemoryFromMessage('user', q);
  void extractMemoryFromMessage('axe', a);
}

function snelSlot(voorkeur: 'classifier' | 'tier2'): KeySlot | null {
  const groq = getProviderKeySlot('groq');
  if (groq) return { ...groq, model: TIER2_GROQ_MODEL };
  const cerebras = getProviderKeySlot('cerebras');
  if (cerebras) return cerebras;
  const google = getProviderKeySlot('google');
  if (google) return google;
  const st = useVoiceStore.getState();
  if (st.primarySlot && !['abonnement', 'ollama'].includes(st.primarySlot.provider)) {
    return st.primarySlot;
  }
  for (const p of PROVIDERS) {
    if (p.id === 'abonnement' || p.id === 'ollama') continue;
    const s = getProviderKeySlot(p.id);
    if (s) return s;
  }
  void voorkeur;
  return st.primarySlot;
}

async function vraagKlassificeerder(prompt: string): Promise<string> {
  const slot = snelSlot('classifier');
  if (!slot) throw new Error('geen snel model');
  return callProvider(slot, [
    { role: 'system', content: 'Reply with JSON only. No prose.' },
    { role: 'user', content: prompt },
  ]);
}

function tier1Tekst(
  kind: AxeRouteKeuze['kind'],
  kijk: Awaited<ReturnType<typeof haalTier1Kijk>>,
  vpsOnline: boolean | null,
): string {
  if (kind === 'greeting') return groetAntwoord();
  if (kind === 'status') {
    return statusAntwoord({
      vpsOnline,
      openTasks: kijk.openTasks,
      overdueTasks: kijk.overdueTasks,
    });
  }
  if (kind === 'tasks') return takenAntwoord(kijk.titels, kijk.overdueTasks);
  if (kind === 'calendar') return agendaAntwoord(kijk.agenda);
  if (kind === 'priorities') return prioriteitenAntwoord(kijk.titels, kijk.overdueTasks, kijk.agenda);
  return groetAntwoord();
}

async function voerTier1Uit(text: string, keuze: AxeRouteKeuze): Promise<boolean> {
  const kijk = await haalTier1Kijk(keuze.kind);
  const antwoord = tier1Tekst(keuze.kind, kijk, useVoiceStore.getState().vpsOnline);
  publiceer(antwoord, { provider: 'rules', model: `tier1/${keuze.kind}` }, text);
  recordBeurt(text, antwoord, 'rules', `tier1:${keuze.kind}`);
  return true;
}

async function voerTier2Uit(text: string, keuze: AxeRouteKeuze): Promise<boolean> {
  const slot = snelSlot('tier2');
  if (!slot) return false;

  const st = useVoiceStore.getState();
  const history = st.conversation.slice(-6).map((m) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.text,
  }));
  const messages = [
    {
      role: 'system' as const,
      content:
        `${AXE_SYSTEM_PROMPT}\n\n${CONVERSATION_FIRST_RULE}\n${replyLanguageInstruction()}\n\n` +
        'Answer quickly. No tools. No markers. Light context only.',
    },
    ...history.slice(0, -1),
    { role: 'user' as const, content: text },
  ];

  noteRetrieval(text, [], [], 'chat');
  useVoiceStore.setState({ voiceStatus: 'processing', activeProvider: slot.provider });

  let axeTs = 0;
  try {
    const raw = await streamProvider(slot, messages, (_delta, full) => {
      const visible = zichtbareAxeAntwoord(full);
      if (!visible.trim()) return;
      if (!axeTs) axeTs = Date.now();
      useVoiceStore.setState((s) => ({
        conversation: volgendeAxeBericht(s.conversation, visible, slot, axeTs) as ConversationMessage[],
        response: visible,
        voiceStatus: 'processing' as const,
        activeProvider: slot.provider,
        error: null,
      }));
    });
    const trimmed = zichtbareAxeAntwoord(raw).trim();
    if (!trimmed) return false;
    if (!axeTs) {
      publiceer(trimmed, slot, text);
    } else {
      useVoiceStore.setState((s) => ({
        conversation: volgendeAxeBericht(s.conversation, trimmed, slot, axeTs) as ConversationMessage[],
        response: trimmed,
        voiceStatus: 'speaking' as const,
      }));
      speakAxe(trimmed, () => useVoiceStore.setState({ voiceStatus: 'idle' }));
    }
    noteOwnerOutcome('chat', 'good');
    void writeConversationMemory(text, trimmed, slot.provider, `tier2:${keuze.kind}`);
    void extractMemoryFromMessage('user', text);
    void extractMemoryFromMessage('axe', trimmed);
    return true;
  } catch (e) {
    console.warn('[AXE] tier 2 failed, falling through:', e);
    if (axeTs) {
      useVoiceStore.setState((s) => ({
        conversation: s.conversation.filter((m) => !(m.role === 'axe' && m.timestamp === axeTs)),
      }));
    }
    noteOwnerOutcome('chat', 'poor');
    return false;
  }
}

function taakTekst(snapshot: DurableTaskSnapshot): string {
  const summary = snapshot.task.result?.summary;
  if (typeof summary === 'string' && summary.trim()) return summary.trim();
  const last = [...snapshot.events].reverse().find((e) => e.message)?.message;
  return last || 'The task finished.';
}

async function monitorTier3(taskId: string, slot: KeySlot, original: string, agent: AxeAgentId): Promise<void> {
  if (taskMonitors.has(taskId)) return;
  taskMonitors.add(taskId);
  try {
    while (true) {
      const snapshot = await getDurableTask(taskId);
      const { status } = snapshot.task;
      if (status === 'completed' || status === 'done') {
        const answer = taakTekst(snapshot);
        publiceer(answer, slot, original);
        recordBeurt(original, answer, slot.provider, `tier3:${agent}`);
        return;
      }
      if (['failed', 'cancelled', 'rejected'].includes(status)) {
        const message = typeof snapshot.task.error?.message === 'string'
          ? snapshot.task.error.message
          : `The task stopped with status ${status}.`;
        publiceer(`That did not work: ${message}`, slot, original);
        return;
      }
      await new Promise((r) => setTimeout(r, 4_000));
    }
  } catch (e) {
    console.warn('[AXE] tier 3 monitor', e);
  } finally {
    taskMonitors.delete(taskId);
  }
}

async function voerTier3Uit(text: string, keuze: AxeRouteKeuze): Promise<boolean> {
  const naam = agentById(keuze.agent).name;
  const ack = tier3Ack(naam, keuze.skill);
  const label = { provider: 'tier3', model: keuze.agent };
  publiceer(ack, label, text);

  try {
    const { task } = await createDurableTask({
      title: (keuze.skill ? `${keuze.skill}: ` : '') + text.slice(0, 100),
      goal: text,
      requested_by: 'luka',
      capability: capabilityVoorAgent(keuze.agent),
      assignee: keuze.agent === 'axe' ? undefined : keuze.agent,
      execution_mode: 'execute',
      idempotency_key: `tier3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      payload: {
        request: text,
        route_tier: 3,
        agent: keuze.agent,
        skill: keuze.skill,
        reply_language: replyLanguageInstruction(),
      },
      metadata: {
        conversation_source: 'axe_tier_router',
        route_tier: 3,
        agent: keuze.agent,
        skill: keuze.skill,
      },
    });
    const slot = snelSlot('tier2') ?? { provider: 'google' as const, key: '', model: `tier3/${keuze.agent}` };
    void monitorTier3(task.id, slot, text, keuze.agent);
    return true;
  } catch (e) {
    console.warn('[AXE] tier 3 dispatch failed, falling through:', e);
    // Ack staat al in de chat. Het huidige pad zou de gebruikersregel
    // verdubbelen — daarom blijven we hier en zeggen we het eerlijk.
    const msg = e instanceof Error ? e.message : String(e);
    publiceer(`Could not start the desk (${msg.slice(0, 80)}). Say it again and I'll take the long path.`, label, text);
    return true;
  }
}

export function installTierRouter(): void {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;

      // Mac-relay blijft het deterministische pad in voiceStore.
      if (detectMacRoute(text)) {
        await original(text);
        return;
      }

      const keuze = await kiesAxeRoute(text, {
        vraagModel: vraagKlassificeerder,
      });
      pushTierRoute(keuze, { query: text.slice(0, 60) });

      if (!keuze.intercept) {
        await original(text);
        return;
      }

      zetGebruiker(text);
      try {
        if (keuze.tier === 1) {
          const ok = await voerTier1Uit(text, keuze);
          if (ok) return;
        } else if (keuze.tier === 2) {
          const ok = await voerTier2Uit(text, keuze);
          if (ok) return;
        } else {
          const ok = await voerTier3Uit(text, keuze);
          if (ok) return;
        }
      } catch (e) {
        console.warn('[AXE] tier router failed, falling through:', e);
      }

      haalGebruikerWeg(text);
      await original(text);
    },
  });
}
