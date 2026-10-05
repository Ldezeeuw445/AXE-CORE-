/**
 * installTierRouter — de laag vóór AXE.
 *
 * Elke beurt door de classifier. Meerdere taken in één zin worden geknipt
 * en als parallelle jobs uitgezet. De chat wacht daar niet op.
 * NorthSea auto-send blijft hier buiten.
 */
import { useVoiceStore, getProviderKeySlot, writeConversationMemory, type ConversationMessage, type RoutingEvent } from '@/presentation/store/voiceStore';
import { collectAllSlots } from '@/presentation/store/chatSlots';
import { slotsVoorAgent } from '@/domain/agents/motorScope';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';
import { AXE_SYSTEM_PROMPT, CONVERSATION_FIRST_RULE } from '@/domain/prompts';
import { replyLanguageInstruction } from '@/domain/replyLanguage';
import { zichtbareAxeAntwoord } from '@/domain/tools/toolLeak';
import { type KeySlot } from '@/domain/providers';
import {
  TIER2_GROQ_MODEL,
  agendaAntwoord,
  classifyAxeTier,
  groetAntwoord,
  prioriteitenAntwoord,
  statusAntwoord,
  takenAntwoord,
  tier3Ack,
} from '@/domain/tierRouter/axeRoute';
import { skillDef, type AxeSkillId } from '@/domain/tierRouter/axeSkills';
import { dagBriefjeTekst } from '@/domain/dagBriefje';
import { bewaarDagBriefje } from '@/application/system/dagBriefjeMaken';
import { bewaarJobRapport } from '@/application/tierRouter/bewaarJobRapport';
import { kiesAxeRoute, type AxeRouteKeuze } from '@/application/tierRouter/kiesAxeRoute';
import { besturingsBeurt, controlBeurt, type BesturingsUitvoer } from '@/application/tierRouter/besturingsBeurt';
import {
  MONITOR_MAX_FOUTEN,
  hervatbareJobs,
  monitorMoetStoppen,
  onbereikbaarTekst,
  nooitGestartTekst,
  tijdslimietTekst,
  verlorenTaakTekst,
  verweesdeJobs,
  volgendePollMs,
} from '@/domain/tierRouter/jobHerstel';
import { haalTier1Kijk } from '@/application/tierRouter/haalTier1Kijk';
import { volgendeAxeBericht } from '@/application/chat/chatStreamBeurt';
import { streamProvider } from '@/infrastructure/gateways/llmStream';
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { detectMacRoute } from '@/infrastructure/gateways/macRelayService';
import {
  cancelDurableTask,
  createDurableTask,
  decideDurableTaskApproval,
  getDurableTask,
  type DurableTaskApproval,
  type DurableTaskSnapshot,
} from '@/infrastructure/gateways/axeCoreApiService';
import { noteRetrieval, noteOwnerOutcome } from '@/infrastructure/persistence/memoryFeedbackService';
import { extractMemoryFromMessage } from '@/infrastructure/persistence/ragMemoryService';
import { speakGlobal, stopGlobalTts } from '@/infrastructure/gateways/globalTts';
import { splitsAxeBeurten, jobStukkenVan, type AxeBeurtStuk } from '@/domain/tierRouter/splitsAxeBeurten';
import {
  bouwMultiAck,
  jobAgentVan,
  gesprokenGoedkeuringsBesluit,
  jobLoopt,
  jobResultaatTekst,
  jobWachtTekst,
  magMetStemGoedkeuren,
  sessieSamenvatting,
  type AxeJob,
} from '@/domain/tierRouter/axeJobRegels';
import { jobsVanStukken, startJobsParallel } from '@/application/tierRouter/stuurAxeJobs';
import { schrijfTaakKluis } from '@/application/obsidian/taakKluis';
import { tabVanPad } from '@/domain/obsidian/kluisBoom';
import { goedkeuringVoorActie } from '@/domain/taakGoedkeuring';
import { flushAxeSpraakRij, kiesSpraakPad, spraakRijLengte, stemlusVanVoice, zetSpraakSpreker } from '@/application/tierRouter/axeSpraakRij';
import { chatBlijftLuisteren, injecteerJobResultaat } from '@/application/tierRouter/injecteerJobResultaat';
import { startAxeSpraakStroom } from '@/application/tierRouter/stroomSpraak';
import { planBeurt, type PlanModel } from '@/application/tierRouter/planBeurt';
import { PLAN_GROQ_MODEL, isKorteOpdracht, lopendeRegels, moetPlannen, type BeurtPlan } from '@/domain/tierRouter/beurtPlan';
import { lopendeJobs } from '@/presentation/store/axeJobStore';
import { stappenUit } from '@/domain/tierRouter/agentVenster';
import { saveRagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { beurtRegel, leesBeurt, markBeurt, startBeurtIndienNodig } from '@/domain/beurtKlok';
import { geheugenVoorBeurt, onthoudInGesprek, warmGeheugen } from '@/application/memory/gespreksGeheugen';

let installed = false;
const taskMonitors = new Set<string>();

let realtimeAnnouncer: ((text: string) => void) | null = null;

/**
 * installOpenAIRealtimeVoice registers here while a realtime voice call is
 * open, so a background job's result is said IN that call — same voice, no
 * second TTS call fighting it for the speakers — instead of going out
 * through the old globalTts path below. Unregister (null) closes the loop.
 */
export function setRealtimeJobAnnouncer(fn: ((text: string) => void) | null): void {
  realtimeAnnouncer = fn;
}

function announceJobText(text: string, slot: { provider: string; model?: string }): void {
  if (realtimeAnnouncer) {
    useVoiceStore.setState((s) => ({
      conversation: injecteerJobResultaat(
        s.conversation,
        text,
        Date.now(),
        { model: slot.model, delegate: slot.model as AxeAgentId | undefined },
      ) as ConversationMessage[],
    }));
    realtimeAnnouncer(text);
    return;
  }
  publiceer(text, slot, 'job');
}

/**
 * `announceJobText` above is now the ONLY path a job result can reach a live
 * OpenAI Realtime call through — it never touches this function while that
 * call is open (see installOpenAIRealtimeVoice.ts). Every caller left here
 * (typed chat, and voice turns coming back through the Whisper fallback
 * loop's sendMessage calls) is therefore never running during a realtime
 * call either, so this stays the plain non-realtime speaker, no awareness
 * of which voice layer is active needed.
 */
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

/**
 * Een regel van AXE in het gesprek zetten zonder hem uit te spreken.
 *
 * Voor een resultaat dat binnenkwam terwijl de app dicht was: dat hoort er te
 * staan als je hem opent, maar de app hoort niet ongevraagd te beginnen met
 * praten. `publiceer` spreekt altijd (speakZonderKap), vandaar deze.
 */
function zetAxeStil(text: string, slot: { provider: string; model?: string }): void {
  const zichtbaar = zichtbareAxeAntwoord(text) || text;
  useVoiceStore.setState((s) => ({
    conversation: [...s.conversation, {
      role: 'axe' as const,
      text: zichtbaar,
      timestamp: Date.now(),
      provider: slot.provider,
      model: slot.model,
      delegate: 'axe' as AxeAgentId,
    }],
    response: zichtbaar,
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
      conversation: injecteerJobResultaat(
        s.conversation,
        visible,
        Date.now(),
        { model: slot.model, delegate: slot.model as AxeAgentId | undefined },
      ) as ConversationMessage[],
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

/**
 * Een snel model voor de klassificeerder en voor tier 2.
 *
 * Twee dingen die uit elkaar gehouden moeten worden, en dat ging hier mis:
 *
 * - SNELHEID: groq voor, dan cerebras, dan google. Dat is een voorkeur van
 *   deze router en blijft hier staan.
 * - SCOPE: wat AXE überhaupt mag draaien. Dat stond hier als een
 *   hardgecodeerde `['abonnement','ollama']`, twee keer, terwijl dezelfde
 *   regel ook in chatModelKeuzes.ts en in installStableChat.ts stond. Die
 *   komt nu uit roster.ts via motorScope.ts, net als de lijst in Settings.
 *
 * Gevolg van dat verschil: de laatste terugval was `st.primarySlot` zónder
 * controle, dus een primary op Ollama kwam er alsnog door. Nu niet meer --
 * geen snel model is een eerlijker antwoord dan het verkeerde model.
 */
function snelSlot(voorkeur: 'classifier' | 'tier2'): KeySlot | null {
  void voorkeur;
  const mag = (s: KeySlot | null): KeySlot | null =>
    s && slotsVoorAgent('axe', [s]).length > 0 ? s : null;

  const groq = getProviderKeySlot('groq');
  if (groq) return { ...groq, model: TIER2_GROQ_MODEL };
  const cerebras = getProviderKeySlot('cerebras');
  if (cerebras) return cerebras;
  const google = getProviderKeySlot('google');
  if (google) return google;

  const st = useVoiceStore.getState();
  const primair = mag(st.primarySlot);
  if (primair) return primair;

  return slotsVoorAgent('axe', collectAllSlots())[0] ?? null;
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
  skill: AxeSkillId | null = null,
): string {
  /* `plan-today` is het dagbriefje, en dat is precies wat tier 1 kan: taken,
     agenda en een top 3 uit opgeslagen data, zonder model. Zonder deze regel gaf
     hij het generieke prioriteiten-antwoord -- dezelfde data, maar zonder de
     rangorde en zonder de top 3, dus het verschil tussen "je hebt 7 open taken"
     en "er staat één taak over tijd, de top 3 is dit". */
  if (skill === 'plan-today') {
    const tekst = dagBriefjeTekst({
      teLaat: kijk.teLaatTitels,
      open: kijk.titels,
      agenda: kijk.agenda,
      openTaken: kijk.openTasks,
      teLateTaken: kijk.overdueTasks,
    });
    if (tekst) return tekst;
    // Leeg briefje: dan is het eerlijker om te zeggen dat er niets staat dan
    // een lege zin voor te lezen.
    return prioriteitenAntwoord(kijk.titels, kijk.overdueTasks, kijk.agenda);
  }
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
  const antwoord = tier1Tekst(keuze.kind, kijk, useVoiceStore.getState().vpsOnline, keuze.skill);
  const label = keuze.skill ? `tier1/${keuze.skill}` : `tier1/${keuze.kind}`;
  publiceer(antwoord, { provider: 'rules', model: label }, 'ack');
  recordBeurt(text, antwoord, 'rules', keuze.skill ? `tier1:skill:${keuze.skill}` : `tier1:${keuze.kind}`);
  // Het briefje hoort ook in de inbox te staan, net als bij de ochtendgroet:
  // dan kan AXE er later naar terugwijzen in plaats van het opnieuw te bouwen.
  if (keuze.skill === 'plan-today' && antwoord) void bewaarDagBriefje(antwoord);
  return true;
}

async function voerTier2Uit(text: string, keuze: AxeRouteKeuze, extra = ''): Promise<boolean> {
  const slot = snelSlot('tier2');
  if (!slot) return false;

  const st = useVoiceStore.getState();
  const history = st.conversation.slice(-6).map((m) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.text,
  }));
  const geheugen = await geheugenVoorBeurt(text, 400);
  const messages = [
    {
      role: 'system' as const,
      content:
        `${AXE_SYSTEM_PROMPT}\n\n${CONVERSATION_FIRST_RULE}\n${replyLanguageInstruction()}\n\n` +
        (geheugen ? `${geheugen}\n\n` : '') +
        'Answer quickly. No tools. No markers. Light context only.' + (extra ? `\n${extra}` : ''),
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

/**
 * Een job is klaar: zeggen, opslaan, onthouden.
 *
 * `hervat` is het geval waarin de app dicht was toen hij klaar werd. Luka's
 * keuze: dat komt wél in de chat, maar niet hardop -- de app hoort niet uit
 * zichzelf te gaan praten zodra je hem 's ochtends opent.
 */
function meldJobKlaar(job: AxeJob, hervat = false): void {
  const tekst = jobResultaatTekst(job);
  useAxeJobStore.getState().patch(job.id, job);
  /* Het rapport (bouwlijst 6.6). Hier en niet in de twee aanroepers: klaar én
     mislukt komen allebei langs deze functie, en een mislukte taak is net zo
     goed iets om over een week nog te kunnen opzoeken. `void`, want een
     mislukte schrijfpoging mag het vertellen nooit tegenhouden. */
  void bewaarJobRapport(job);
  if (hervat) {
    const zichtbaar = `${tekst} (finished while you were away.)`;
    zetAxeStil(zichtbaar, { provider: 'tier3', model: job.agent });
    recordBeurt(job.sourceText, zichtbaar, 'tier3', `tier3:${job.agent}`);
    return;
  }
  announceJobText(tekst, { provider: 'tier3', model: job.agent });
  recordBeurt(job.sourceText, tekst, 'tier3', `tier3:${job.agent}`);
}

/**
 * Een lopende taak volgen tot hij klaar is.
 *
 * Dit was `while (true)` met een vaste poll van 4 s, zonder tijdslimiet en
 * zonder backoff. Eén netwerkfout verliet de lus en liet de job voor altijd op
 * `running` staan -- de balk bleef zeggen dat er gewerkt werd terwijl er
 * niemand meer keek. Nu eindigt elke weg in een stand die klopt, met een regel
 * erbij waarom.
 *
 * `hervat` betekent: deze monitor start na een herstart van de app. Dan mag
 * een resultaat wél in de chat, maar niet hardop (Luka's keuze).
 */
async function monitorTier3(job: AxeJob, hervat = false): Promise<void> {
  const taskId = job.taskId;
  if (!taskId || taskMonitors.has(taskId)) return;
  taskMonitors.add(taskId);
  // Eén keer melden per goedkeuringsvraag; na je ok loopt de taak door.
  let gemeldeVraag: string | null = null;
  let fouten = 0;
  try {
    while (true) {
      // De monitor kijkt al twee uur: ophouden, en niet doen alsof de taak
      // mislukt is -- daar weten we niets van.
      if (monitorMoetStoppen(job, Date.now())) {
        useAxeJobStore.getState().patch(job.id, {
          state: 'failed', summary: tijdslimietTekst(job), finishedAt: Date.now(),
        });
        publiceer(tijdslimietTekst(job), { provider: 'tier3', model: 'monitor/timeout' }, 'ack');
        return;
      }

      // Stopte Luka hem net zelf? Dan staat de eindstand er al en hoeft de
      // backend-bevestiging niets meer te melden -- anders zegt AXE twee keer
      // iets over dezelfde cancel.
      const vooraf = useAxeJobStore.getState().jobs.find((j) => j.id === job.id);
      if (vooraf && !jobLoopt(vooraf.state)) return;

      let snapshot: Awaited<ReturnType<typeof getDurableTask>>;
      try {
        snapshot = await getDurableTask(taskId);
        fouten = 0;
      } catch (e) {
        const melding = e instanceof Error ? e.message : String(e);
        // De server kent deze taak niet meer. Blijven pollen heeft geen zin.
        if (/\b404\b/.test(melding)) {
          useAxeJobStore.getState().patch(job.id, {
            state: 'failed', summary: verlorenTaakTekst(job), finishedAt: Date.now(),
          });
          publiceer(verlorenTaakTekst(job), { provider: 'tier3', model: 'monitor/lost' }, 'ack');
          return;
        }
        fouten += 1;
        if (fouten >= MONITOR_MAX_FOUTEN) {
          useAxeJobStore.getState().patch(job.id, {
            state: 'failed', summary: onbereikbaarTekst(job), finishedAt: Date.now(),
          });
          publiceer(onbereikbaarTekst(job), { provider: 'tier3', model: 'monitor/unreachable' }, 'ack');
          return;
        }
        await new Promise((r) => setTimeout(r, volgendePollMs(fouten)));
        continue;
      }
      const { status } = snapshot.task;
      // Voor het venster rond de core: wat doet de agent nu, in gewone taal.
      const stappen = stappenUit(snapshot.events.map((e) => e.message));
      const huidig = useAxeJobStore.getState().jobs.find((j) => j.id === job.id);
      if (stappen.join('\n') !== (huidig?.stappen ?? []).join('\n')) {
        useAxeJobStore.getState().patch(job.id, { stappen });
      }
      if (status === 'waiting_approval') {
        const vraag = snapshot.approvals.find((a) => a.status === 'pending');
        const sleutel = vraag?.id ?? 'onbekend';
        const gk = goedkeuringVoorActie({
          title: vraag?.title || job.title,
          detail: vraag?.detail || job.sourceText,
          metadata: snapshot.task.metadata,
        });
        if (!gk) {
          if (gemeldeVraag !== sleutel) {
            gemeldeVraag = sleutel;
            useAxeJobStore.getState().patch(job.id, { state: 'running', approvalId: undefined, approvalVraag: undefined });
          }
          await new Promise((r) => setTimeout(r, volgendePollMs(0)));
          continue;
        }
        if (gemeldeVraag !== sleutel) {
          gemeldeVraag = sleutel;
          const wacht = {
            ...job,
            state: 'waiting' as const,
            approvalId: vraag?.id,
            approvalVraag: gk.tekst,
          };
          useAxeJobStore.getState().patch(job.id, wacht);
          announceJobText(jobWachtTekst(wacht, gk.tekst), { provider: 'tier3', model: job.agent });
        }
        await new Promise((r) => setTimeout(r, volgendePollMs(0)));
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
        }, hervat);
        return;
      }
      if (['failed', 'cancelled', 'rejected'].includes(status)) {
        const message = typeof snapshot.task.error?.message === 'string'
          ? snapshot.task.error.message
          : `The task stopped with status ${status}.`;
        meldJobKlaar({ ...job, state: 'failed', summary: message, finishedAt: Date.now() }, hervat);
        return;
      }
      await new Promise((r) => setTimeout(r, volgendePollMs(0)));
    }
  } catch (e) {
    console.warn('[AXE] tier 3 monitor', e);
  } finally {
    taskMonitors.delete(taskId);
  }
}

interface GesprokenGoedkeuringKandidaat {
  job: AxeJob;
  approval: DurableTaskApproval;
}

/**
 * AXE heeft de goedkeuringsvraag zelf net hardop gesteld. Een kort "ja" of
 * "nee" moet dan ook werkelijk de geparkeerde durable task hervatten/stoppen.
 *
 * Alleen session-jobs tellen mee: zo kan een losse "ja" nooit per ongeluk een
 * oude approval uit een ander venster of van gisteren tekenen. Bij meer dan één
 * open vraag weigeren we te raden welke Luka bedoelt.
 */
async function probeerGesprokenGoedkeuring(text: string): Promise<boolean> {
  const besluit = gesprokenGoedkeuringsBesluit(text);
  if (!besluit) return false;

  const wachtend = useAxeJobStore.getState().jobs
    .filter((j) => j.state === 'waiting' && !!j.taskId);

  if (!wachtend.length) return false;

  const kandidaten: GesprokenGoedkeuringKandidaat[] = [];
  const snapshots = await Promise.all(
    wachtend.map(async (job) => {
      try {
        const snapshot = await getDurableTask(job.taskId!);
        return { job, snapshot };
      } catch {
        return null;
      }
    }),
  );

  for (const entry of snapshots) {
    if (!entry) continue;
    const approval = entry.snapshot.approvals.find((a) => a.status === 'pending');
    if (approval) kandidaten.push({ job: entry.job, approval });
  }

  if (!kandidaten.length) return false;

  // Dit was een echte gebruikersbeurt, ook al wordt hij door de approval-laag
  // afgehandeld in plaats van door een model.
  zetGebruiker(text);

  if (kandidaten.length > 1) {
    publiceer(
      `I have ${kandidaten.length} approvals waiting. Tell me which task you mean.`,
      { provider: 'rules', model: 'spoken-approval/ambiguous' },
      'ack',
    );
    return true;
  }

  const { job, approval } = kandidaten[0];

  if (besluit === 'approve' && !magMetStemGoedkeuren(approval)) {
    publiceer(
      'That approval is too consequential to accept by voice. Use the Approvals control.',
      { provider: 'rules', model: 'spoken-approval/blocked' },
      'ack',
    );
    return true;
  }

  try {
    await decideDurableTaskApproval(
      approval.task_id,
      approval.id,
      besluit === 'approve',
      besluit === 'approve' ? 'Approved by spoken AXE reply.' : 'Rejected by spoken AXE reply.',
    );

    if (besluit === 'approve') {
      useAxeJobStore.getState().patch(job.id, { state: 'running' });
      publiceer(
        `Okay. ${agentById(job.agent).name} is continuing.`,
        { provider: 'rules', model: 'spoken-approval/approved' },
        'ack',
      );
    } else {
      publiceer(
        'Okay. I rejected that action.',
        { provider: 'rules', model: 'spoken-approval/rejected' },
        'ack',
      );
    }
  } catch (e) {
    publiceer(
      `I couldn't apply that approval: ${e instanceof Error ? e.message : String(e)}`,
      { provider: 'rules', model: 'spoken-approval/error' },
      'ack',
    );
  }
  return true;
}

/** Modellen voor het beurtplan, snelste eerst. Groq's gratis dagtegoed kan op
 *  zijn (gemeten 25 sep: 200k tokens/dag), dan neemt OpenAI het over. */
function planModellen(): PlanModel[] {
  const uit: PlanModel[] = [];
  const vraag = (slot: KeySlot): PlanModel => (system, user) => callProvider(slot, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  const groq = getProviderKeySlot('groq');
  if (groq) uit.push(vraag({ ...groq, model: PLAN_GROQ_MODEL }));
  const openai = getProviderKeySlot('openai');
  if (openai) uit.push(vraag({ ...openai, model: 'gpt-4.1-mini' }));
  const cerebras = getProviderKeySlot('cerebras');
  if (cerebras) uit.push(vraag(cerebras));
  return uit;
}

/**
 * Het plan opvragen, plus de lopende jobs waarop het plan mag wijzen.
 *
 * Die lijst komt mee terug en wordt NIET opnieuw uit de store gehaald bij het
 * uitvoeren: tussen de aanvraag en het antwoord kan een taak klaar zijn, en
 * dan wijst "j2" ineens naar een andere job dan het model bedoelde.
 */
/** De echte gateways voor de besturing. De uitvoerder kent ze niet zelf. */
function besturingDeps() {
  return {
    cancel: (taskId: string, reden?: string) => cancelDurableTask(taskId, reden),
    snapshot: (taskId: string) => getDurableTask(taskId),
    beslis: (taskId: string, approvalId: string, akkoord: boolean, reden?: string) =>
      decideDurableTaskApproval(taskId, approvalId, akkoord, reden),
  };
}

/**
 * Wat de uitvoerder besloot doorvoeren: store bijwerken, zeggen, en een
 * eventuele herstart aanzwengelen. Eén plek, zodat het regelpad en het
 * modelpad niet twee verschillende dingen met dezelfde uitkomst doen.
 */
function pasBesturingToe(uit: BesturingsUitvoer, bron: 'rules' | 'plan'): void {
  for (const patch of uit.patches) useAxeJobStore.getState().patch(patch.id, patch.over);
  if (uit.starts.length) startAxeJobs(uit.starts);
  publiceer(uit.tekst, { provider: bron, model: `besturing/${uit.actie}` }, 'ack');
}

/**
 * Gaat deze zin over werk dat al loopt?
 *
 * Staat bewust VOOR het plan. "hoe staat het met de trading agent en de
 * northsea taak?" is twee stukken, gaat dus naar het plan, kost daar tot zes
 * seconden -- en het plan mág jobs starten, dus een vraag over werk kan nieuw
 * werk opstarten. Dat is precies wat er gemeten werd. `jobStatusTekst`
 * beantwoordt het gratis uit de store.
 *
 * En bewust NA `probeerGesprokenGoedkeuring`: die kent de snapshot-controle
 * voor een kale "ja" op een net gestelde vraag.
 */
async function probeerBesturing(text: string): Promise<boolean> {
  const alle = useAxeJobStore.getState().jobs;
  const uit = await besturingsBeurt(text, alle, besturingDeps());
  if (!uit) return false;
  zetGebruiker(text);
  pushTierRoute(
    { tier: 1, kind: 'session', via: 'rules', reason: `besturing:${uit.actie}`, agent: 'axe', skill: null, confident: true, intercept: true, latencyMs: 0 },
    { query: text.slice(0, 60) },
  );
  pasBesturingToe(uit, 'rules');
  recordBeurt(text, uit.tekst, 'rules', `besturing:${uit.actie}`);
  return true;
}

/**
 * Na een herstart: de draad weer oppakken.
 *
 * Jobs staan sinds deze ronde in localStorage, maar de pollers niet -- die
 * leven in een module-lokale Set. Zonder dit staat er na een herlaad een
 * balk vol "running" waar niemand meer naar kijkt.
 */
function hervatJobMonitors(): void {
  const jobs = useAxeJobStore.getState().jobs;

  // Nooit een taskId gekregen: het aanmaken is nooit afgerond. Die gaan
  // nergens heen, dus ze horen niet als lopend te blijven staan.
  for (const job of verweesdeJobs(jobs)) {
    useAxeJobStore.getState().patch(job.id, {
      state: 'failed', summary: nooitGestartTekst(job), finishedAt: Date.now(),
    });
  }

  // Wel een taskId: gewoon weer volgen. Was hij ondertussen klaar, dan komt
  // het resultaat bij de eerste poll alsnog binnen -- in de chat, niet hardop.
  for (const job of hervatbareJobs(jobs)) void monitorTier3(job, true);

  neemOudRegisterOver();
}

/**
 * Het tweede register leeghalen, één keer.
 *
 * `installStableChat` hield zijn eigen lopende taken bij in
 * `axe_active_durable_tasks`, met een eigen poller. Dat is nu weg, maar wie de
 * app bijwerkt terwijl daar nog een taak in staat zou die zien verdwijnen --
 * hij draait door op de VPS en niemand kijkt meer. Dus adopteren we ze als
 * gewone jobs en gooien de sleutel weg.
 *
 * Titel en agent kennen we niet meer; `monitorTier3` haalt de stappen en het
 * resultaat alsnog op, en dat is wat telt.
 */
function neemOudRegisterOver(): void {
  const SLEUTEL = 'axe_active_durable_tasks';
  let ids: string[];
  try {
    const ruw = localStorage.getItem(SLEUTEL);
    if (!ruw) return;
    const waarde: unknown = JSON.parse(ruw);
    ids = Array.isArray(waarde) ? waarde.filter((v): v is string => typeof v === 'string') : [];
    localStorage.removeItem(SLEUTEL);
  } catch { return; }

  const bekend = new Set(useAxeJobStore.getState().jobs.map((j) => j.taskId).filter(Boolean));
  const overgenomen: AxeJob[] = ids
    .filter((taskId) => !bekend.has(taskId))
    .map((taskId) => ({
      id: `job-oud-${taskId.slice(0, 8)}`,
      title: `Task ${taskId.slice(0, 8)}`,
      agent: 'axe' as AxeAgentId,
      state: 'running' as const,
      startedAt: Date.now(),
      taskId,
      sourceText: '',
    }));
  if (!overgenomen.length) return;
  useAxeJobStore.getState().voeg(overgenomen);
  for (const job of overgenomen) void monitorTier3(job, true);
}

async function maakPlan(text: string): Promise<{ plan: BeurtPlan; lopend: AxeJob[] } | null> {
  const modellen = planModellen();
  if (!modellen.length) return null;
  const geschiedenis = useVoiceStore.getState().conversation
    .slice(-7, -1)
    .map((m) => ({ role: m.role === 'user' ? 'user' as const : 'axe' as const, text: m.text }));
  // Genummerd, zoals de prompt belooft. Kale titels betekenden dat het model
  // nergens naar kon wijzen en élke control werd weggegooid.
  const lopendJobs = lopendeJobs(useAxeJobStore.getState().jobs);
  const lopend = lopendeRegels(lopendJobs);
  const geheugen = await geheugenVoorBeurt(text);
  const plan = await planBeurt(text, { modellen, geschiedenis, lopend, geheugen });
  return plan ? { plan, lopend: lopendJobs } : null;
}

/** Het plan uitvoeren: praten, starten, onthouden, herinneren. Niets hiervan
 *  laat de chat wachten; alleen het antwoord gaat meteen de lucht in. */
function voerPlanUit(text: string, plan: BeurtPlan, lopend: AxeJob[]): void {
  publiceer(plan.reply, { provider: 'plan', model: plan.jobs.map((j) => j.agent).join('+') || 'reply' }, 'ack');
  recordBeurt(text, plan.reply, 'plan', `plan:${plan.jobs.length}`);

  // Werk dat al loopt: stoppen, bijsturen, of erover vertellen. Dit stond hier
  // niet -- het plan parseerde `controls` netjes en niemand las ze ooit.
  if (plan.controls.length) {
    void (async () => {
      const alle = useAxeJobStore.getState().jobs;
      for (const uit of await controlBeurt(plan.controls, lopend, alle, besturingDeps())) {
        pasBesturingToe(uit, 'plan');
      }
    })();
  }

  if (plan.jobs.length) {
    const tab = tabVanPad(typeof location !== 'undefined' ? location.pathname : '/');
    startAxeJobs(plan.jobs.map((j) => ({
      text: j.request,
      titel: j.title,
      device: j.device ?? null,
      tab,
      bron: 'plan' as const,
      route: {
        tier: 3 as const,
        kind: 'agent' as const,
        via: 'model' as const,
        reason: j.skill ? `plan:skill:${j.skill}` : 'plan',
        agent: j.skill ? (skillDef(j.skill)?.agent ?? j.agent) : j.agent,
        /* Stond hier hard op null, en dat was waar de vijf skills hun naam
           verloren: het planmodel draait vóór de regels, dus bij een
           samengestelde beurt kwam `plan today` hier langs als naamloze job.
           De agent kreeg dan de zin zelf in plaats van de instructie uit
           axeSkills.ts. */
        skill: j.skill ?? null,
        confident: true,
      },
    })));
  }

  for (const content of plan.onthoud) {
    onthoudInGesprek(content);
    void saveRagMemory({
      category: 'user',
      content,
      importance: 6,
      metadata: { source: 'axe_plan', said: text.slice(0, 300) },
    }).catch((e) => console.warn('[AXE] plan memory failed:', e));
  }

  for (const h of plan.herinneringen) {
    void createDurableTask({
      title: h.title,
      goal: h.title,
      requested_by: 'luka',
      capability: 'task_manage',
      execution_mode: 'read',
      metadata: {
        uiStatus: 'todo',
        progress: 0,
        routedBy: 'axe-core',
        source: 'axe_plan',
        ...(h.dueAt ? { dueAt: h.dueAt } : {}),
      },
    }).catch((e) => console.warn('[AXE] plan reminder failed:', e));
  }
}

/** Probeert het plan; true als het de beurt heeft afgehandeld. */
async function probeerPlan(text: string, keuze: AxeRouteKeuze): Promise<boolean> {
  zetGebruiker(text);
  const uitkomst = await maakPlan(text);
  if (!uitkomst) {
    haalGebruikerWeg(text);
    return false;
  }
  const { plan, lopend } = uitkomst;
  pushTierRoute(
    { ...keuze, tier: plan.jobs.length ? 3 : 2, kind: plan.jobs.length ? 'agent' : 'quick', intercept: true, reason: `plan:${plan.jobs.length}j/${plan.onthoud.length}m/${plan.herinneringen.length}r` },
    { query: text.slice(0, 60) },
  );
  voerPlanUit(text, plan, lopend);
  return true;
}

/** Zet jobs uit zonder dat sendMessage daarop wacht. Ook de ingang voor de
 *  realtime-voice-tool `start_background_task` — zelfde dispatch, zelfde
 *  monitor, geen tweede takenrij. */
export function startAxeJobs(stukken: AxeBeurtStuk[]): void {
  const tab = tabVanPad(typeof location !== 'undefined' ? location.pathname : '/');
  const metContext = stukken.map((s) => ({ ...s, tab: s.tab ?? tab }));
  const ids = metContext.map((_, i) => `job-${Date.now()}-${i}`);
  let n = 0;
  const queued = jobsVanStukken(metContext, Date.now(), () => ids[n++]);
  useAxeJobStore.getState().voeg(queued);
  n = 0;
  void startJobsParallel(metContext, {
    create: createDurableTask,
    id: () => queued[n++]?.id ?? `job-x-${n}`,
    kluis: schrijfTaakKluis,
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

/**
 * Van tekst naar achtergrondwerk: zeggen dat je begint, en beginnen.
 *
 * Geëxporteerd omdat dit de ENIGE manier hoort te zijn waarop de app een
 * durable task start. `installStableChat` had hier zijn eigen versie van --
 * eigen localStorage-sleutel, eigen poller, eigen aankondiging -- en een taak
 * die daar begon verscheen nooit in de balk, niet op de telefoon, en was
 * nergens mee te besturen. Eén deur, één register.
 */
export function voerJobsUit(text: string, stukken: AxeBeurtStuk[]): boolean {
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

/** Gewoon terugpraten (tier 2, gestreamd), zonder iets te starten. */
async function praatTerug(text: string, keuze: AxeRouteKeuze): Promise<boolean> {
  const praat: AxeRouteKeuze = { ...keuze, tier: 2, kind: 'quick', intercept: true, reason: 'praten:geen-plan' };
  pushTierRoute(praat, { query: text.slice(0, 60) });
  const conv = useVoiceStore.getState().conversation;
  if (conv[conv.length - 1]?.role !== 'user' || conv[conv.length - 1]?.text !== text) zetGebruiker(text);
  const eerlijk = 'Nothing was started this turn. If he asked for something to be done, do not claim it is running: say in a few words you could not start it just now and ask him to say it once more.';
  if (await voerTier2Uit(text, praat, eerlijk)) return true;
  haalGebruikerWeg(text);
  return false;
}

export function installTierRouter(): void {
  if (installed) return;
  installed = true;
  warmGeheugen();
  hervatJobMonitors();
  zetSpraakSpreker((text) => speakZonderKap(text, 'ack'));

  /* Het dagbriefje in het gesprek zetten.
     De luisteraar staat hier omdat `zetAxeStil` hier staat -- dat is de enige
     plek die weet hoe je AXE's woorden in de chat zet zonder ze te laten
     uitspreken, en daar een tweede copy van maken is precies het soort
     verdubbeling waar deze ronde over gaat. `axeBootstrap` (application) mag de
     store niet aanraken, dus hij stuurt een event; dat is hoe de rest van de app
     ook over de laaggrens praat (axe-focus-composer, axe-agents-changed, ...).
     Waarom het nodig is: op de telefoon en de iPad blokkeert de browser geluid
     vóór de eerste aanraking, dus hardop lukt daar vaak niet -- en dan is dit de
     enige manier waarop je het briefje ziet. */
  if (typeof window !== 'undefined') {
    window.addEventListener('axe-dagbriefje', (e: Event) => {
      const tekst = (e as CustomEvent<{ tekst?: string }>).detail?.tekst?.trim();
      if (!tekst) return;
      zetAxeStil(tekst, { provider: 'rules', model: 'dagbriefje' });
    });
  }

  /* Een jobresultaat dat binnenkomt terwijl jij praat of AXE praat gaat in de
     wachtrij -- `moetSpraakWachtrij`: een agent mag je niet afkappen. Maar de
     enige plek die die rij ooit leegmaakte zat in de Whisper-lus, en die is
     op 29 sep uit main.tsx gehaald. Sindsdien verdween gewachte job-spraak
     stilletjes voor de rest van de sessie. Hier wordt hij alsnog uitgesproken
     zodra het stil is. */
  useVoiceStore.subscribe((st, vorige) => {
    if (st.voiceStatus === vorige.voiceStatus) return;
    if (st.voiceStatus !== 'idle') return;
    if (spraakRijLengte() === 0) return;
    flushAxeSpraakRij();
  });

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;
      startBeurtIndienNodig();

      // Als AXE net om toestemming vroeg, moet een kort gesproken ja/nee die
      // echte geparkeerde taak bedienen -- niet als nieuw chatbericht eindigen.
      if (await probeerGesprokenGoedkeuring(text)) return;

      // "mac: ..." was een legacy bypass naar claude_local. Dat maakte twee
      // werkelijkheden: gewone opdrachten gingen via de durable AXE-kernel,
      // expliciete Mac-opdrachten omzeilden juist die kernel. Vanaf hier is de
      // Mac gewoon een execution node van dezelfde agentic task.
      const mac = detectMacRoute(text);
      if (mac) {
        const gerouteerd = classifyAxeTier(mac.prompt);
        const agent: AxeAgentId = gerouteerd.agent === 'axe' ? 'apps' : gerouteerd.agent;
        const keuze: AxeRouteKeuze = {
          tier: 3,
          kind: 'agent',
          via: 'rules',
          reason: 'explicit mac -> durable kernel',
          agent,
          skill: null,
          confident: true,
          intercept: true,
          latencyMs: 0,
        };
        pushTierRoute(keuze, { query: text.slice(0, 60) });
        zetGebruiker(text);
        voerJobsUit(text, [{
          text: `Use Luka's Mac fleet for this request. Pick the correct online Mac with list_devices/run_on_device and actually do it: ${mac.prompt}`,
          route: keuze,
        }]);
        return;
      }

      // Gaat dit over werk dat al loopt? Dan hoeft er geen model aan te pas
      // te komen, en mag het plan hier zeker geen nieuwe taak van maken.
      if (await probeerBesturing(text)) return;

      const stukken = splitsAxeBeurten(text);
      const jobs = jobStukkenVan(stukken);

      // Een brain dump of meerdere dingen tegelijk: eerst begrijpen wat Luka
      // bedoelt, dan pas knippen. Lukt het plan niet, dan de regels hieronder.
      if (jobs.length >= 2 || moetPlannen(text, jobs.length, 2)) {
        // Alleen regels (geen netwerk): het plan zelf is de echte klassificatie.
        const voorlopig: AxeRouteKeuze = { ...classifyAxeTier(text), intercept: true, latencyMs: 0 };
        if (await probeerPlan(text, voorlopig)) return;
        // Geen plan: dan is dit een gesprek, geen stapel opdrachten. Knippen op
        // komma's maakte op 25 sep van één gewoon gesprek 25 agent-taken.
        if (await praatTerug(text, voorlopig)) return;
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
          // Echt werk: het plan maakt er een opdracht van die op zichzelf
          // staat en kiest de agent. Zonder plan de oude route.
          haalGebruikerWeg(text);
          /* Eén uitzondering: een benoemde skill is al een besluit. Wie hem
             doet, op welke tier en met welke instructie staat in axeSkills.ts.
             Hem alsnog door het planmodel halen kostte tot 6 s (PLAN_TIMEOUT_MS)
             en gooide de naam weg -- het model geeft zijn eigen request terug,
             en de agent moest raden wat "inbox brief" betekent. */
          if (!keuze.skill && await probeerPlan(text, keuze)) return;
          // Zonder plan alleen een korte, duidelijke opdracht als één taak --
          // nooit geknipt. Al het andere is praten.
          if (!keuze.skill && !isKorteOpdracht(text)) {
            if (await praatTerug(text, keuze)) return;
          } else {
            zetGebruiker(text);
            // Bij een skill is de instructie die van de tabel, niet jouw zin:
            // "deep research naar lithium" wordt de volle onderzoeksopdracht
            // met het onderwerp eraan vast.
            const def = keuze.skill ? skillDef(keuze.skill) : null;
            const opdracht = def ? `${def.request}\n\nLuka said: ${text}` : text;
            if (voerJobsUit(text, [{ text: opdracht, titel: def?.label, route: keuze }])) return;
          }
        }
      } catch (e) {
        console.warn('[AXE] tier router failed, falling through:', e);
      }

      haalGebruikerWeg(text);
      await original(text);
    },
  });
}
