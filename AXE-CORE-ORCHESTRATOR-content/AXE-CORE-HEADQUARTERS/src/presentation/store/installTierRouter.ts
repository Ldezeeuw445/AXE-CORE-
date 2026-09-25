/**
 * installTierRouter — de laag vóór AXE.
 *
 * Elke beurt door de classifier. Meerdere taken in één zin worden geknipt
 * en als parallelle jobs uitgezet. De chat wacht daar niet op.
 * NorthSea auto-send blijft hier buiten.
 */
import { useVoiceStore, getProviderKeySlot, writeConversationMemory, type ConversationMessage, type RoutingEvent } from '@/presentation/store/voiceStore';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';
import { AXE_SYSTEM_PROMPT, CONVERSATION_FIRST_RULE } from '@/domain/prompts';
import { replyLanguageInstruction } from '@/domain/replyLanguage';
import { zichtbareAxeAntwoord } from '@/domain/tools/toolLeak';
import { PROVIDERS, type KeySlot } from '@/domain/providers';
import {
  TIER2_GROQ_MODEL,
  agendaAntwoord,
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
import { splitsAxeBeurten, jobStukkenVan, type AxeBeurtStuk } from '@/domain/tierRouter/splitsAxeBeurten';
import {
  bouwMultiAck,
  jobAgentVan,
  jobResultaatTekst,
  jobWachtTekst,
  sessieSamenvatting,
  type AxeJob,
} from '@/domain/tierRouter/axeJobRegels';
import { jobsVanStukken, startJobsParallel } from '@/application/tierRouter/stuurAxeJobs';
import { kiesSpraakPad, stemlusVanVoice, zetSpraakSpreker } from '@/application/tierRouter/axeSpraakRij';
import { chatBlijftLuisteren, injecteerJobResultaat } from '@/application/tierRouter/injecteerJobResultaat';
import { startAxeSpraakStroom } from '@/application/tierRouter/stroomSpraak';
import { beurtRegel, leesBeurt, markBeurt, startBeurtIndienNodig } from '@/domain/beurtKlok';

let installed = false;
const taskMonitors = new Set<string>();

function speakZonderKap(text: string, bron: 'ack' | 'job'): void {
  try {
    if (localStorage.getItem('axe_response_mode') === 'type') return;
  } catch { /* ignore */ }
  const stand = stemlusVanVoice(useVoiceStore.getState().voiceStatus, useVoiceStore.getState().error);
  if (kiesSpraakPad(text, stand, bron) === 'queue') return;
  const hoor = () => pushBeurtLatentie();
  if (bron === 'ack') {
    stopGlobalTts();
    speakGlobal(text, () => {
      if (!chatBlijftLuisteren(useVoiceStore.getState().voiceStatus)) {
        useVoiceStore.setState({ voiceStatus: 'idle' });
      }
    }, (reason) => useVoiceStore.setState({ error: reason }), hoor);
    return;
  }
  speakGlobal(text, undefined, (reason) => useVoiceStore.setState({ error: reason }), hoor);
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
    ...leesBeurt(),
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

/** Zet STT / first-token / first-audio op de jongste route-regel. */
export function pushBeurtLatentie(): void {
  const m = leesBeurt();
  useVoiceStore.setState((s) => {
    if (!s.routingLog[0]) return {};
    const head = { ...s.routingLog[0], ...m };
    const updated = [head, ...s.routingLog.slice(1)];
    try { localStorage.setItem('axe_routing_log', JSON.stringify(updated)); } catch { /* ignore */ }
    return { routingLog: updated };
  });
  console.info(`%c[AXE] ${beurtRegel(m)}`, 'color:#22D3EE;font-weight:600');
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

function publiceer(text: string, slot: { provider: string; model?: string }, bron: 'ack' | 'job' = 'ack'): void {
  const visible = zichtbareAxeAntwoord(text) || text;
  const axeMsg: ConversationMessage = {
    role: 'axe',
    text: visible,
    timestamp: Date.now(),
    provider: slot.provider,
    model: slot.model,
    delegate: 'axe',
  };
  const luistert = chatBlijftLuisteren(useVoiceStore.getState().voiceStatus);
  if (bron === 'job') {
    useVoiceStore.setState((s) => ({
      conversation: injecteerJobResultaat(s.conversation, visible) as ConversationMessage[],
      response: visible,
    }));
  } else {
    useVoiceStore.setState((s) => ({
      conversation: [...s.conversation, axeMsg],
      response: visible,
      voiceStatus: luistert ? s.voiceStatus : 'speaking' as const,
      error: null,
    }));
  }
  speakZonderKap(visible, bron);
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
  if (kind === 'session') return sessieSamenvatting(useAxeJobStore.getState().jobs);
  if (kind === 'status') {
    const jobs = useAxeJobStore.getState().jobs;
    if (jobs.length) return sessieSamenvatting(jobs);
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
  publiceer(antwoord, { provider: 'rules', model: `tier1/${keuze.kind}` }, 'ack');
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

  const stroom = startAxeSpraakStroom({
    onFirstAudio: () => {
      markBeurt('firstAudio');
      pushBeurtLatentie();
      useVoiceStore.setState({ voiceStatus: 'speaking' });
    },
    onDone: () => {
      if (!chatBlijftLuisteren(useVoiceStore.getState().voiceStatus)) {
        useVoiceStore.setState({ voiceStatus: 'idle' });
      }
    },
    onError: (reason) => useVoiceStore.setState({ error: reason }),
  });

  let axeTs = 0;
  try {
    const raw = await streamProvider(slot, messages, (_delta, full) => {
      const visible = zichtbareAxeAntwoord(full);
      if (!visible.trim()) return;
      if (!axeTs) {
        axeTs = Date.now();
        markBeurt('firstToken');
        pushBeurtLatentie();
      }
      stroom.voer(visible);
      useVoiceStore.setState((s) => ({
        conversation: volgendeAxeBericht(s.conversation, visible, slot, axeTs) as ConversationMessage[],
        response: visible,
        voiceStatus: s.voiceStatus === 'speaking' ? s.voiceStatus : 'processing' as const,
        activeProvider: slot.provider,
        error: null,
      }));
    });
    const trimmed = zichtbareAxeAntwoord(raw).trim();
    if (!trimmed) {
      stroom.stop();
      return false;
    }
    stroom.sluit();
    if (!axeTs) {
      markBeurt('firstToken');
      publiceer(trimmed, slot, 'ack');
    } else {
      useVoiceStore.setState((s) => ({
        conversation: volgendeAxeBericht(s.conversation, trimmed, slot, axeTs) as ConversationMessage[],
        response: trimmed,
      }));
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
    stroom.stop();
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

function meldJobKlaar(job: AxeJob): void {
  const tekst = jobResultaatTekst(job);
  useAxeJobStore.getState().patch(job.id, job);
  publiceer(tekst, { provider: 'tier3', model: job.agent }, 'job');
  recordBeurt(job.sourceText, tekst, 'tier3', `tier3:${job.agent}`);
}

async function monitorTier3(job: AxeJob): Promise<void> {
  const taskId = job.taskId;
  if (!taskId || taskMonitors.has(taskId)) return;
  taskMonitors.add(taskId);
  // Eén keer melden per goedkeuringsvraag; na je ok loopt de taak door.
  let gemeldeVraag: string | null = null;
  try {
    while (true) {
      const snapshot = await getDurableTask(taskId);
      const { status } = snapshot.task;
      if (status === 'waiting_approval') {
        const vraag = snapshot.approvals.find((a) => a.status === 'pending');
        const sleutel = vraag?.id ?? 'onbekend';
        if (gemeldeVraag !== sleutel) {
          gemeldeVraag = sleutel;
          const wacht = { ...job, state: 'waiting' as const };
          useAxeJobStore.getState().patch(job.id, wacht);
          publiceer(jobWachtTekst(wacht, vraag?.title), { provider: 'tier3', model: job.agent }, 'job');
        }
        await new Promise((r) => setTimeout(r, 4_000));
        continue;
      }
      if (gemeldeVraag && (status === 'running' || status === 'queued')) {
        gemeldeVraag = null;
        useAxeJobStore.getState().patch(job.id, { ...job, state: 'running' });
      }
      if (status === 'completed' || status === 'done') {
        meldJobKlaar({
          ...job,
          state: 'done',
          summary: taakTekst(snapshot),
          finishedAt: Date.now(),
        });
        return;
      }
      if (['failed', 'cancelled', 'rejected'].includes(status)) {
        const message = typeof snapshot.task.error?.message === 'string'
          ? snapshot.task.error.message
          : `The task stopped with status ${status}.`;
        meldJobKlaar({ ...job, state: 'failed', summary: message, finishedAt: Date.now() });
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

/** Zet jobs uit zonder dat sendMessage daarop wacht. */
function startAxeJobs(stukken: AxeBeurtStuk[]): void {
  const ids = stukken.map((_, i) => `job-${Date.now()}-${i}`);
  let n = 0;
  const queued = jobsVanStukken(stukken, Date.now(), () => ids[n++]);
  useAxeJobStore.getState().voeg(queued);
  n = 0;
  void startJobsParallel(stukken, {
    create: createDurableTask,
    id: () => queued[n++]?.id ?? `job-x-${n}`,
  }).then((gestart) => {
    for (const g of gestart) {
      useAxeJobStore.getState().patch(g.job.id, g.job);
      if (g.ok && g.job.taskId) void monitorTier3(g.job);
      if (!g.ok) meldJobKlaar(g.job);
    }
  }).catch((e) => {
    console.warn('[AXE] tier 3 dispatch failed, falling through:', e);
  });
}

function voerJobsUit(text: string, stukken: AxeBeurtStuk[]): boolean {
  const jobs = stukken.map((s) => ({
    text: s.text,
    agent: jobAgentVan(s.route, s.text) as AxeAgentId,
  }));
  const ack = jobs.length === 1
    ? tier3Ack(agentById(jobs[0].agent).name, stukken[0].route.skill)
    : bouwMultiAck(jobs);
  publiceer(ack, { provider: 'tier3', model: jobs.map((j) => j.agent).join('+') }, 'ack');
  recordBeurt(text, ack, 'tier3', 'tier3:batch');
  startAxeJobs(stukken);
  return true;
}

export function installTierRouter(): void {
  if (installed) return;
  installed = true;
  zetSpraakSpreker((text) => speakZonderKap(text, 'ack'));

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;
      startBeurtIndienNodig();

      if (detectMacRoute(text)) {
        await original(text);
        return;
      }

      const stukken = splitsAxeBeurten(text);
      const jobs = jobStukkenVan(stukken);
      if (jobs.length >= 2) {
        const keuze = await kiesAxeRoute(text, { vraagModel: vraagKlassificeerder });
        pushTierRoute({ ...keuze, tier: 3, kind: 'agent', intercept: true, reason: `multi:${jobs.length}` }, { query: text.slice(0, 60) });
        zetGebruiker(text);
        voerJobsUit(text, jobs);
        return;
      }

      const keuze = await kiesAxeRoute(text, {
        vraagModel: vraagKlassificeerder,
      });
      markBeurt('route', Math.round(keuze.latencyMs));
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
          const ok = voerJobsUit(text, stukken.length ? stukken : [{ text, route: keuze }]);
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
