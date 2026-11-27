/**
 * Always-on AXE floating notch — louis_rlee / Mochi visual language.
 * Collapsed: HQ dark-shell pill (#0A0A0A) + blob + home/chat/+/settings/volume.
 * Expanded: chat history, composer, drop zone, live activity, approvals.
 * Icons are wired; body always fills the window when open (no empty glass).
 */
import { berichtTijd, balkTijd } from '@/domain/overlay/notchWidgets';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { ArrowRight, Bot, Check, CalendarDays, CheckCircle2, ChevronUp, History, Home, LayoutGrid, Maximize2, MessageSquare, Mic, Minimize2, Plus, RotateCcw, Settings, SquareTerminal, Users, Paperclip, X } from 'lucide-react';
import { claudeLive, klok, leesStand, type ClaudeLive } from '@/domain/overlay/claudeLive';
import { vpsAuthHeaders, isTauriRuntime, VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';
import {
  getDurableTask,
  listPendingApprovals,
  retryDurableTask,
  type DurableTaskApproval,
} from '@/infrastructure/gateways/axeCoreApiService';
import {
  bewaarGrootte, grootteUitCmd, heeftCompact, leesGrootte, stapTerug, toetsActie, wisselGrootte, zichtbareGrootte,
  type NotchGrootte,
} from '@/domain/overlay/notchGrootte';
import {
  compacteStand, foutZin, groet, magOpnieuw, stapRijen, verdeelTaken, wachtZin,
  type NotchStap, type NotchTaak,
} from '@/domain/overlay/notchCompact';
import { notchOntwerp } from './notchOntwerp';
import { beslisApproval } from '@/application/approvals/beslisAgentOk';
import './AxeOverlayNotch.css';
import { groepeerSleep, sorteerSleep, type GesleeptItem, type SleepInvoer } from '@/domain/overlay/gesleepteItems';
import { beoordeelNotch } from '@/domain/overlay/notchLeven';
import { projectieUitVraag } from '@/application/sphere/vraagRouter';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { NotchResultaat } from './NotchResultaat';
import { NotchWidgets } from './NotchWidgets';
import { AXE_CYAAN, AxeGezicht, CLAUDE_KORAAL, type Stemming } from '@/presentation/components/axe-core/AxeGezicht';
import { AXE_AGENTS, type AxeAgentId } from '@/domain/agents/roster';
import { bewaarManagerChat, laadManagerChat, nieuwMsg } from '@/domain/agents/managerChatOpslag';
import { laatManagerAntwoorden } from '@/application/managers/managerAntwoord';
import { startManagerJob } from '@/presentation/store/managerJob';
import { syncManagerDraad, MANAGER_DRAAD_EVT } from '@/infrastructure/persistence/managerDraadSync';
import { isVoorMij, landTekst } from '@/domain/portal/portal';
import { claimWorp, getekendeLink, openWorpen } from '@/infrastructure/gateways/portalService';
import { ditToestel } from '@/infrastructure/gateways/axeDeviceService';
import { eerstvolgende, geluidVoor, homeStand, nieuwePeeks, PEEK_MS, zetInRij, type NotchMoment, type Peek, kiesOkStrook } from '@/domain/overlay/notchPeeks';
import { geluidAan, speelToon, zetGeluid } from './notchToon';
import { calendarJobs, gedeeldeStappen, logRitme, type GedeeldeStap } from '@/infrastructure/gateways/axeCoreApiService';
import { ritmeStrook, type RitmeDag } from '@/domain/overlay/ritme';
import { EEN_DING_SLEUTEL, datumSleutel, kiesEenDing, type EigenDing } from '@/domain/overlay/eenDing';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

type Tab = 'chat' | 'approvals' | 'settings' | 'claude' | 'home' | 'widgets';

/** Voorbeelddata in ontwerpmodus; in een gebouwde app altijd null. */
const ONTWERP = notchOntwerp();

function opslag(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/**
 * Claude Code live (18 nov): leest ~/.axe/claude-live.json via de Tauri-
 * opdracht lees_claude_live, eens per seconde, alleen als er een sessie is
 * twee keer zo vaak niet nodig. Buiten Tauri: niets.
 */
function useClaudeLive(): ClaudeLive | null {
  const [live, setLive] = useState<ClaudeLive | null>(null);
  const vorige = useRef<string | null>(null);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let weg = false;
    const tik = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const ruw = await invoke<string | null>('lees_claude_live');
        if (weg) return;
        const l = claudeLive(leesStand(ruw), Date.now() / 1000, vorige.current);
        vorige.current = l?.sessieId ?? null;
        setLive(l);
      } catch { /* oudere build zonder de opdracht */ }
    };
    void tik();
    const id = window.setInterval(() => { void tik(); }, 1000);
    return () => { weg = true; window.clearInterval(id); };
  }, []);
  return live;
}

/** Wie doet het: kleur en naam voor een taak-assignee (18 nov, gezichten in de notch). */
function gezichtVoor(wie: string | null | undefined): { kleur: string; naam: string } {
  const id = String(wie || '').toLowerCase();
  if (id.includes('claude')) return { kleur: CLAUDE_KORAAL, naam: 'Claude' };
  const a = AXE_AGENTS.find((x) => x.id === id);
  if (!a || a.id === 'axe') return { kleur: AXE_CYAAN, naam: 'AXE' };
  return { kleur: a.accent, naam: a.kort || a.name };
}

/** Vaste, per naam verschillende voorsprong in het ritme (0–4,6 s), zodat
 *  een rij gezichten niet tegelijk knippert of ademt (Luka 27 nov). */
function fase(sleutel: string): number {
  let h = 0;
  for (let i = 0; i < sleutel.length; i++) h = (h * 31 + sleutel.charCodeAt(i)) >>> 0;
  return (h % 47) / 10;
}

const CLAUDE_STEMMING: Record<'bezig' | 'wacht' | 'klaar', Stemming> = { bezig: 'werkt', wacht: 'wacht', klaar: 'klaar' };
/** De bol-toestanden (notchLeven) als ogen van het AXE-driehoekje. */
const AXE_STEMMING: Record<string, Stemming> = { rust: 'rust', werkt: 'werkt', denkt: 'werkt', luistert: 'rust', wacht: 'wacht', onbereikbaar: 'fout' };

type Msg = { role: 'user' | 'assistant' | 'system'; content: string; at: number };

/* `agent` = de echte roster-id. Tot 20 nov praatte de notch met een los
   gpt-4o-mini dat zich voordeed als de manager, buiten zijn gesprek om. Nu
   is het hetzelfde gesprek als op de Managers-tab (punt 8). */
const MANAGERS = [
  { id: 'axe', agent: 'axe', label: 'AXE' },
  { id: 'projects', agent: 'projectsmgr', label: 'Projects' },
  { id: 'axe-core', agent: 'axemanager', label: 'CORE' },
  { id: 'companion', agent: 'companionmgr', label: 'Companion' },
  { id: 'trading', agent: 'tradingos', label: 'Trading OS' },
  { id: 'axon', agent: 'axon', label: 'AXON' },
  { id: 'northsea', agent: 'northseamgr', label: 'NorthSea' },
] as const satisfies ReadonlyArray<{ id: string; agent: AxeAgentId; label: string }>;

/** Het managergesprek als notch-regels. */
function draadAlsRegels(agent: AxeAgentId): Msg[] {
  return laadManagerChat(agent)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.kind && m.text.trim())
    .slice(-30)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text, at: m.at }));
}


function isDangerousApproval(a: DurableTaskApproval): boolean {
  const blob = `${a.kind || ''} ${a.title || ''} ${a.detail || ''} ${a.wat || ''}`.toLowerCase();
  return /trade|trading|order|payment|pay|transfer|wire|sepa|iban|purchase|buy\b|sell\b/.test(blob);
}

async function focusMainShell() {
  if (!isTauriRuntime()) {
    window.location.hash = '#/';
    return;
  }
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const main = await WebviewWindow.getByLabel('main');
    if (main) {
      await main.show();
      await main.unminimize();
      await main.setFocus();
    }
  } catch { /* ignore */ }
}

/** Opent een tab in het hoofdvenster (alleen routes uit de allowlist in installOverlayDeeplink). */
async function openInShell(route: '/managers') {
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('axe://open-route', route);
  } catch { /* browser of oude build: alleen het venster naar voren */ }
  await focusMainShell();
}

function Teller({ n }: { n: number }) {
  if (!n) return null;
  return <span className="axe-ov__teller" aria-hidden>{n > 9 ? '9+' : n}</span>;
}


/**
 * Lopende taken, mét of de VPS überhaupt antwoordde.
 *
 * Hier stond `catch { return [] }`. Een lege lijst en een onbereikbare server
 * zien er dan identiek uit, en de notch toont in beide gevallen "niets te
 * doen". Dat is de ene fout die een altijd-aanwezige balk niet mag maken: je
 * vertrouwt dan op iets dat al een uur dood kan zijn. Daarom twee velden.
 */
async function fetchActivity(): Promise<{ ok: boolean; regels: string[]; wie?: string[]; ruw?: Parameters<typeof verdeelTaken>[0] }> {
  if (ONTWERP) {
    const open = ONTWERP.taken.filter((t) => /running|queued|active|in_progress|waiting/i.test(t.status)).slice(0, 4);
    return { ok: ONTWERP.bereikbaar, regels: open.map((t) => `${t.title} · ${t.status}`), wie: open.map((t) => t.assignee), ruw: ONTWERP.taken };
  }
  try {
    const url = `${VPS_API_ORIGIN}/tasks?limit=12`;
    const r = await fetch(url, { headers: { ...vpsAuthHeaders(url) } });
    if (!r.ok) return { ok: false, regels: [] };
    const data = (await r.json()) as { tasks?: Array<{ id?: string; title?: string; goal?: string; status?: string; capability?: string; assignee?: string | null; error?: unknown; updated_at?: string }> };
    const open = (data.tasks || [])
      .filter((t) => /running|queued|active|in_progress|waiting/i.test(String(t.status || '')))
      .slice(0, 4);
    return {
      ok: true,
      regels: open.map((t) => `${t.title || t.capability || 'task'} · ${t.status}`),
      wie: open.map((t) => String(t.assignee || '')),
      ruw: data.tasks || [],
    };
  } catch {
    return { ok: false, regels: [] };
  }
}

export function AxeOverlayNotch({
  onHome,
  onSend,
  onOpenChange,
  onInklappen,
  onPeekChange,
  onGrootteChange,
}: {
  onHome?: () => void;
  onSend?: (text: string) => void;
  onOpenChange?: (open: boolean) => void;
  /** Klapt de notch in tot alleen een handvat. Zonder deze prop geen knop. */
  onInklappen?: () => void;
  /** Een peek gaat open/dicht: het venster zakt even een regel uit (18 nov). */
  onPeekChange?: (aan: boolean) => void;
  /** Compact of groot open (27 nov): FloatAxe zet het venster op die hoogte. */
  onGrootteChange?: (g: NotchGrootte) => void;
}) {
  const [open, setOpen] = useState(false);
  /* 27 nov: openvouwen = Home, compact. Hier stond 'chat', en dan opende de
     bol altijd het grote paneel. */
  const [tab, setTab] = useState<Tab>('home');
  /* De onthouden keuze compact/groot (notchGrootte.ts). Alleen de knop, ⌘E
     en overlay.cmd veranderen hem; een tab die groot moet niet. */
  const [onthouden, setOnthouden] = useState<NotchGrootte>(() => (ONTWERP?.groot ? 'groot' : leesGrootte(opslag())));
  const kiesGrootte = (g: NotchGrootte) => {
    setOnthouden(g);
    if (!ONTWERP) bewaarGrootte(opslag(), g);
  };
  const onthoudenRef = useRef(onthouden);
  onthoudenRef.current = onthouden;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const claude = useClaudeLive();
  // Vraagt Claude toestemming, dan gaat de notch zelf open (één keer per vraag).
  const gezienVraag = useRef<string | null>(null);
  useEffect(() => {
    const id = claude?.toestemming?.id ?? null;
    if (id && id !== gezienVraag.current) {
      gezienVraag.current = id;
      set(true);
      setTab('claude');
    }
    // `set` staat verderop (useCallback): in de deps-lijst zou hij vóór zijn
    // declaratie gelezen worden. Alleen een nieuwe vraag moet dit opnieuw doen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claude?.toestemming?.id]);
  const beantwoord = async (besluit: 'toestaan' | 'altijd' | 'weigeren') => {
    const id = claude?.toestemming?.id;
    if (!id) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('claude_antwoord', { id, besluit });
      setStatusNote(besluit === 'weigeren' ? 'Geweigerd' : besluit === 'altijd' ? 'Toegestaan, ook voortaan' : 'Toegestaan');
    } catch (e) {
      setStatusNote(`Lukte niet: ${(e as Error).message}`);
    }
  };
  const [tekst, setTekst] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [files, setFiles] = useState<GesleeptItem[]>([]);
  const [dragging, setDragging] = useState(() => ONTWERP?.stand === 'gesleept');
  /* Ronde 2 (20 nov): gesleepte bestanden met hun echte pad, om om te zetten.
     De HTML-drop geeft alleen een naam; Tauri's eigen drag-drop het pad. */
  const [omzet, setOmzet] = useState<{ pad: string; naam: string; doelen: string[]; bezig?: string; klaar?: string; fout?: string }[]>([]);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let stop: (() => void) | undefined;
    let weg = false;
    void (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      const { invoke } = await import('@tauri-apps/api/core');
      const af = await getCurrentWebview().onDragDropEvent(async (e) => {
        const p = e.payload as { type: string; paths?: string[] };
        if (p.type === 'enter' || p.type === 'over') setDragging(true);
        else if (p.type === 'leave') setDragging(false);
        else if (p.type === 'drop') {
          setDragging(false);
          const paden = (p.paths ?? []).slice(0, 8);
          if (!paden.length) return;
          const rij = await Promise.all(paden.map(async (pad) => ({
            pad,
            naam: pad.split('/').pop() || pad,
            // Niet naar zijn eigen formaat (docx -> docx, heic -> heic).
            doelen: (await invoke<string[]>('omzet_doelen', { pad }).catch(() => [] as string[]))
              .filter((d) => !zelfdeFormaat(pad, d)),
          })));
          setOmzet(rij);
          set(true);
          setTab('home');
        }
      });
      if (weg) af(); else stop = af;
    })().catch(() => undefined);
    return () => { weg = true; stop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const zelfdeFormaat = (pad: string, d: string) => {
    const ext = (pad.split('.').pop() || '').toLowerCase().replace('jpg', 'jpeg').replace(/^tif$/, 'tiff').replace(/^aif$/, 'aiff').replace(/^htm$/, 'html');
    return ext === d;
  };
  const zetOm = async (pad: string, naar: string) => {
    setOmzet((r) => r.map((x) => (x.pad === pad ? { ...x, bezig: naar, klaar: undefined, fout: undefined } : x)));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nieuw = await invoke<string>('bestand_omzetten', { pad, naar });
      setOmzet((r) => r.map((x) => (x.pad === pad ? { ...x, bezig: undefined, klaar: nieuw } : x)));
    } catch (err) {
      setOmzet((r) => r.map((x) => (x.pad === pad ? { ...x, bezig: undefined, fout: String(err).slice(0, 140) } : x)));
    }
  };
  const naarAxe = (x: { pad: string; naam: string }) => {
    neemSleepAan({ bestanden: [{ name: x.naam, size: 0 }], tekst: null, uriList: `file://${x.pad}` });
  };
  const [approvals, setApprovals] = useState<DurableTaskApproval[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  const [activityWie, setActivityWie] = useState<string[]>([]);
  /* De taken zelf (27 nov), voor de compacte kaart: echte stappen, wie, en
     wat er in de laatste 2 uur misging. */
  const [actiefTaken, setActiefTaken] = useState<NotchTaak[]>([]);
  const [misluktTaken, setMisluktTaken] = useState<NotchTaak[]>([]);
  // Begint op true: anders roept de notch "geen verbinding" in de seconde
  // vóór de eerste ronde, en dat is een vals alarm bij elke start.
  const [bereikbaar, setBereikbaar] = useState(true);
  const [projectie, setProjectie] = useState<ProjectionPayload | null>(null);
  const [managerIdx, setManagerIdx] = useState(0);
  const [statusNote, setStatusNote] = useState('');
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const manager = MANAGERS[managerIdx] || MANAGERS[0];
  // Het gesprek van de gekozen manager, en bijblijven als het ergens anders
  // verandert: de Managers-tab of de VPS in dit venster (MANAGER_DRAAD_EVT),
  // of een ander venster van de app (storage-event op dezelfde opslag).
  const agentId = manager.agent;
  useEffect(() => {
    const ververs = () => setMessages(draadAlsRegels(agentId));
    ververs();
    void syncManagerDraad([agentId]).then(ververs);
    const opOpslag = (e: StorageEvent) => { if (!e.key || e.key.includes(agentId)) ververs(); };
    window.addEventListener(MANAGER_DRAAD_EVT, ververs);
    window.addEventListener('storage', opOpslag);
    const t = window.setInterval(() => { void syncManagerDraad([agentId]).then(ververs); }, 20_000);
    return () => {
      window.removeEventListener(MANAGER_DRAAD_EVT, ververs);
      window.removeEventListener('storage', opOpslag);
      window.clearInterval(t);
    };
  }, [agentId]);

  /**
   * Eén toestand voor de hele strook — ingeklapt én open.
   *
   * Ingeklapt was de notch tot nu toe stom: de bol stond stil en wat hier
   * binnenkwam werd alleen in `axe-ov__body` getekend, en die bestaat niet als
   * hij dicht is. Je kon dus niet zien of AXE meeluisterde, bezig was, op je
   * wachtte of al een uur niets meer hoorde. De volgorde bij meerdere
   * signalen staat in `domain/overlay/notchLeven`, met de redenen erbij.
   */
  const leven = beoordeelNotch({
    luistert: listening,
    denkt: busy,
    bereikbaar,
    approvals: approvals.length,
    taken: activity.length,
  });

  const set = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        onOpenChange?.(next);
        return next;
      });
    },
    [onOpenChange],
  );

  // If the window is already tall (oversized empty glass), open the body once on mount.
  // Do NOT depend on onOpenChange — FloatAxe passes an inline lambda, so a dependency
  // would re-fire after every collapse and immediately expand again.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerHeight > 120) {
      setOpen(true);
      onOpenChange?.(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, tab]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      // Beide rondes apart, zodat één storing de andere niet meesleept — en
      // zodat `bereikbaar` echt betekent "we hebben net iets gehoord".
      // Begin op false en word alleen waar als er écht geantwoord is. De
      // andere kant op (begin true, zet false bij een fout) laat een pad dat
      // niemand voorzag doorgaan als "bereikbaar", en dat is de ene leugen
      // die deze strook niet mag vertellen.
      let approvalsOk = false;
      let takenOk = false;
      try {
        const a = ONTWERP ? ONTWERP.approvals : await listPendingApprovals(12);
        if (ONTWERP && !ONTWERP.bereikbaar) throw new Error('ontwerp: offline');
        if (!cancelled) setApprovals(a.filter((x) => x.status === 'pending'));
        approvalsOk = true;
      } catch {
        /* onbereikbaar; de vorige lijst blijft staan */
      }
      try {
        const act = await fetchActivity();
        if (act.ok) {
          if (!cancelled) {
            setActivity(act.regels);
            setActivityWie(act.wie ?? []);
            const v = verdeelTaken(act.ruw ?? [], Date.now());
            setActiefTaken(v.actief);
            setMisluktTaken(v.mislukt);
          }
          takenOk = true;
        }
      } catch {
        /* onbereikbaar */
      }
      if (!cancelled) setBereikbaar(approvalsOk && takenOk);
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Hammerspoon / parent shell can dispatch: window.dispatchEvent(new CustomEvent('axe-overlay-cmd',{detail:'expand'}))
  useEffect(() => {
    const onCmd = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.trim()) void handleCmd(detail.trim());
    };
    window.addEventListener('axe-overlay-cmd', onCmd as EventListener);
    return () => window.removeEventListener('axe-overlay-cmd', onCmd as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvals, manager.label]);

  const handleCmd = async (cmd: string) => {
    const g = grootteUitCmd(cmd, onthoudenRef.current);
    if (g) {
      kiesGrootte(g);
      set(true);
      if (!heeftCompact(tabRef.current)) setTab('home');
      return;
    }
    if (cmd === 'expand' || cmd === 'chat') {
      set(true);
      setTab('chat');
      return;
    }
    if (cmd === 'collapse') {
      set(false);
      return;
    }
    if (cmd === 'approvals') {
      set(true);
      setTab('approvals');
      return;
    }
    if (cmd === 'approve-top') {
      set(true);
      setTab('approvals');
      const top = approvals[0];
      if (!top) {
        setStatusNote('Geen pending approvals');
        return;
      }
      if (isDangerousApproval(top)) {
        setStatusNote('Geblokkeerd: trades/payments niet via notch');
        return;
      }
      try {
        await beslisApproval(top.task_id, top.id, true, 'notch F15 hold');
        setStatusNote(`Goedgekeurd: ${top.title || top.kind}`);
        setApprovals((prev) => prev.filter((a) => a.id !== top.id));
      } catch (e) {
        setStatusNote(`Approval fout: ${(e as Error).message}`);
      }
      return;
    }
    if (cmd === 'ptt-start') {
      set(true);
      setTab('chat');
      togglePtt(true);
      return;
    }
    if (cmd === 'ptt-stop') {
      togglePtt(false);
      return;
    }
    if (cmd.startsWith('ask:')) {
      set(true);
      setTab('chat');
      void doSend(cmd.slice(4));
      return;
    }
    if (cmd === 'ask-about-this') {
      set(true);
      setTab('chat');
      void doSend('what is this, what should I do? (selectie/clipboard + screenshot context)');
      return;
    }
    if (cmd === 'northsea-brief' || cmd === 'daily-brief') {
      set(true);
      setTab('chat');
      void doSend(cmd === 'daily-brief' ? 'Geef een korte daily brief: approvals, NorthSea, app status, trading demo.' : 'Geef een kort NorthSea brief: nieuwe deal-replies en next actions.');
      return;
    }
    if (cmd === 'manager-next') {
      setManagerIdx((i) => (i + 1) % MANAGERS.length);
      set(true);
      return;
    }
    if (cmd === 'manager-prev') {
      setManagerIdx((i) => (i - 1 + MANAGERS.length) % MANAGERS.length);
      set(true);
      return;
    }
    if (cmd === 'manager-open') {
      set(true);
      setTab('chat');
      setMessages((m) => [
        ...m,
        { role: 'system', content: `Manager: ${manager.label}`, at: Date.now() },
      ]);
      return;
    }
    if (cmd === 'focus-on' || cmd === 'focus-off') {
      setStatusNote(cmd === 'focus-on' ? 'Focus mode aan — AXE dempt notificaties' : 'Focus mode uit');
      set(true);
    }
  };

  const doSend = async (raw?: string) => {
    const text = (raw ?? tekst).trim();
    if ((!text && files.length === 0) || busy) return;
    const fileBlock =
      files.length === 0
        ? ''
        : `\n\n[Meegestuurd]\n${files.map((f) => `- ${f.label} (${f.soort}${f.grootte != null ? `, ${f.grootte} B` : ''})`).join('\n')}`;
    const payload = (text || 'Bestanden ontvangen — wat moet ik ermee?') + fileBlock;
    setTekst('');
    setFiles([]);
    setMessages((m) => [...m, { role: 'user', content: payload, at: Date.now() }]);
    setBusy(true);
    onSend?.(payload);

    /* "Laat me de kaart van LA zien" hoort niet als alinea tekst terug te
       komen, en ook niet op Home te landen -- dat is juist het venster dat je
       net geminimaliseerd hebt. Dit loopt naast het antwoord, niet ervoor:
       een geocode die traag is of mislukt mag het gesprek niet ophouden, en
       als de vraag niets te tonen heeft (het normale geval) blijft het stil. */
    void (async () => {
      try {
        const p = await projectieUitVraag(text);
        if (p) setProjectie(p);
      } catch {
        /* geen resultaatkaart; het tekstantwoord komt gewoon */
      }
    })();
    try {
      // In het echte gesprek van deze manager, zoals op de Managers-tab: de
      // manager antwoordt zelf (abonnement + zijn context), of het wordt een
      // taak met `chat`, en dan meldt de VPS de voortgang in dit gesprek.
      const rid = manager.agent;
      bewaarManagerChat(rid, [...laadManagerChat(rid), nieuwMsg('user', payload)]);
      setMessages(draadAlsRegels(rid));
      const zelf = await laatManagerAntwoorden(rid, payload, (actie) => startManagerJob(rid, actie));
      if (!zelf) {
        startManagerJob(rid, payload);
        setMessages((m) => [...m, { role: 'system', content: 'Gestart als taak — de voortgang komt in dit gesprek.', at: Date.now() }]);
      } else {
        setMessages(draadAlsRegels(rid));
      }
      void syncManagerDraad([rid]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Fout: ${(e as Error).message}`, at: Date.now() },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const togglePtt = (force?: boolean) => {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      setStatusNote('Spraakherkenning niet beschikbaar');
      return;
    }
    const wantStart = force === true || (force !== false && !listening);
    if (!wantStart) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'nl-NL';
    rec.onresult = (ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => {
      let final = '';
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else setTekst(r[0].transcript);
      }
      if (final.trim()) {
        setTekst(final.trim());
        void doSend(final.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  /**
   * Alles wat erin valt, gesorteerd in bakjes.
   *
   * Hiervoor nam de notch alleen `dataTransfer.files`: een gesleepte link of
   * een stuk tekst lichtte de rand op en verdween daarna. En alles wat wél
   * binnenkwam belandde op één hoop, waarin je weer moest zoeken.
   *
   * Het sorteren zelf staat in `domain/overlay/gesleepteItems` — zonder DOM,
   * zodat elk geval te toetsen is zonder browser.
   */
  const neemSleepAan = (invoer: SleepInvoer) => {
    const items = sorteerSleep(invoer);
    if (items.length === 0) return;
    setFiles((p) => [...p, ...items].slice(0, 12));
    set(true);
    setTab('chat');
  };

  /* ── Peeks (18 nov, uit Pulsar): dicht en er gebeurt iets → één regel
        zakt even uit en trekt zich terug. Nooit focus, nooit als de notch open is. */
  const moment: NotchMoment = {
    goedkeuringen: approvals.map((a) => ({ id: a.id, titel: a.wat || a.title })),
    claude: claude ? { sessieId: claude.sessieId, toestand: claude.toestand, project: claude.project, vraag: claude.vraag,
      nu: claude.nu, toestemming: Boolean(claude.toestemming) } : null,
    taken: activity,
  };
  const momentSleutel = JSON.stringify([moment.goedkeuringen.map((g) => g.id), moment.claude?.sessieId, moment.claude?.toestand,
    moment.claude?.toestemming, moment.taken]);
  const vorigMoment = useRef<NotchMoment | null>(null);
  const [peekRij, setPeekRij] = useState<Peek[]>([]);
  const [geluid, setGeluid] = useState(geluidAan);
  useEffect(() => {
    const erbij = nieuwePeeks(vorigMoment.current, moment);
    vorigMoment.current = moment;
    if (erbij.length && !open) setPeekRij((r) => zetInRij(r, erbij));
    /* 22 nov: zacht geluid bij een vraag en bij klaar -- alleen op de Mac
       waar Luka zit (stil < 2 min), zodat de twee Macs niet tegelijk piepen. */
    if (erbij.length && geluidAan()) {
      const speel = (stil: number | null) => {
        const g = geluidVoor(erbij, stil, true);
        if (g) speelToon(g);
      };
      if (isTauriRuntime()) {
        void import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke<number | null>('systeem_idle_s'))
          .then((s) => speel(typeof s === 'number' ? s : null))
          .catch(() => speel(null));
      } else speel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentSleutel]);
  /* Portal (18 nov): wat de iPhone hierheen gooit, landt hier. Elke 10 s
     kijken; alleen in de echte app (de Mac moet zelf downloaden). */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let weg = false;
    let mijnId = '';
    let bezig = false;
    const tik = async () => {
      if (bezig || weg) return;
      bezig = true;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (!mijnId) mijnId = (await ditToestel()).device_id;
        const rijen = await openWorpen();
        if (!rijen.length) return;
        const stil = await invoke<number | null>('systeem_idle_s').catch(() => null);
        for (const r of rijen.filter((x) => isVoorMij(x, mijnId, stil))) {
          const mijn = await claimWorp(r.id, mijnId);
          if (!mijn) continue; // een andere Mac was sneller
          const zeg = landTekst(mijn);
          let pad: string | undefined;
          if (mijn.soort === 'tekst') {
            await invoke('portal_klembord', { tekst: mijn.tekst ?? '' });
          } else if (mijn.pad) {
            pad = await invoke<string>('portal_bewaar', { url: await getekendeLink(mijn.pad), naam: mijn.naam });
          }
          const p: Peek = { id: `p-${mijn.id}`, soort: 'portal', titel: zeg.titel,
            tekst: mijn.soort === 'tekst' ? `${zeg.tekst} · staat op je klembord` : zeg.tekst, tab: 'home', pad };
          setPeekRij((rij) => zetInRij(rij, [p]));
          if (openRef.current) setStatusNote(`${p.titel}: ${p.tekst}`);
        }
      } catch {
        /* geen verbinding of nog niet ingelogd: volgende tik opnieuw */
      } finally {
        bezig = false;
      }
    };
    void tik();
    // 10 s: twee Macs die elke 4 s vragen is voor een kleine database niet niks (19 nov).
    const id = window.setInterval(() => void tik(), 10_000);
    return () => { weg = true; window.clearInterval(id); };
  }, []);
  const openRef = useRef(open);
  openRef.current = open;

  /* Ogen volgen de muis (27 nov). Eén listener op de notch, hooguit één
     schrijfactie per frame, alleen twee CSS-variabelen: de held-gezichten
     (`volg`) verschuiven hun ogen daarmee met een CSS-transition. */
  const wortelRef = useRef<HTMLDivElement>(null);
  const muisFrame = useRef(0);
  const volgMuis = (e: { clientX: number; clientY: number }) => {
    if (!openRef.current || muisFrame.current) return;
    const { clientX, clientY } = e;
    muisFrame.current = requestAnimationFrame(() => {
      muisFrame.current = 0;
      const el = wortelRef.current;
      const held = el?.querySelector('.axe-gezicht[data-volg]');
      if (!el || !held) return;
      const r = held.getBoundingClientRect();
      const klem = (v: number) => Math.max(-1, Math.min(1, v));
      el.style.setProperty('--axe-kijk-x', klem((clientX - (r.left + r.width / 2)) / 260).toFixed(2));
      el.style.setProperty('--axe-kijk-y', klem((clientY - (r.top + r.height / 2)) / 160).toFixed(2));
    });
  };
  useEffect(() => () => cancelAnimationFrame(muisFrame.current), []);

  /* ── Compact of groot (Luka 27 nov) ─────────────────────────────────────
     Wat je ziet: de onthouden keuze op Home/widgets, groot op de rest. */
  const zichtbaar: NotchGrootte = zichtbareGrootte(tab, onthouden);
  const compact = open && zichtbaar === 'compact';
  // Layout-effect: FloatAxe leest `groot` pas na een paar awaits in dockTop,
  // dus dit staat er al als het venster zijn hoogte kiest.
  useLayoutEffect(() => {
    onGrootteChange?.(open ? zichtbaar : 'compact');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zichtbaar]);

  /* ⌘E wisselt en onthoudt; Esc: groot → compact → dicht. Alleen als hij
     open is: dicht krijgt de notch nooit het toetsenbord (18 nov). */
  useEffect(() => {
    if (!open) return;
    const op = (e: KeyboardEvent) => {
      const actie = toetsActie(e);
      if (!actie) return;
      // Esc in "Eén ding kiezen" is van dat veld: dat sluit zichzelf.
      const doel = e.target as HTMLElement | null;
      if (actie === 'stap-terug' && doel?.closest?.('.axe-ov__eending-kies')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (actie === 'wissel') {
        kiesGrootte(wisselGrootte(zichtbaar));
        if (!heeftCompact(tabRef.current)) setTab('home');
        return;
      }
      const stap = stapTerug({ open: true, zichtbaar });
      if (!stap.open) { set(false); return; }
      kiesGrootte('compact');
      if (!heeftCompact(tabRef.current)) setTab('home');
    };
    // Capture: vóór de app-brede ⌘-letter-sneltoetsen (useKeyboardShortcuts).
    window.addEventListener('keydown', op, true);
    return () => window.removeEventListener('keydown', op, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zichtbaar]);

  /* De groet staat er de eerste seconden na het openvouwen. */
  const [openSinds, setOpenSinds] = useState(() => Date.now());
  const [nuTik, setNuTik] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const start = Date.now();
    setOpenSinds(ONTWERP?.stand === 'rust' ? start - 60_000 : start);
    setNuTik(start);
    const id = window.setInterval(() => setNuTik(Date.now()), 1000);
    const stop = window.setTimeout(() => window.clearInterval(id), 8000);
    return () => { window.clearInterval(id); window.clearTimeout(stop); };
  }, [open]);

  /* Echte stappen van de taak in beeld: /tasks/{id}, elke 5 s, alleen als
     de compacte kaart open is en er iets loopt. */
  const focusTaak = misluktTaken[0] ?? actiefTaken[0] ?? null;
  const [stappen, setStappen] = useState<NotchStap[]>([]);
  useEffect(() => {
    if (!(compact && tab === 'home' && focusTaak?.id)) { setStappen([]); return; }
    let weg = false;
    const laad = async () => {
      if (ONTWERP) { setStappen(ONTWERP.stappen); return; }
      try {
        const snap = await getDurableTask(focusTaak.id);
        if (!weg) setStappen((snap.steps ?? []).map((x) => ({ id: x.id, volgorde: x.step_order, titel: x.title, status: x.status })));
      } catch { /* stappen vallen weg; de titel blijft */ }
    };
    void laad();
    const id = window.setInterval(() => void laad(), 5000);
    return () => { weg = true; window.clearInterval(id); };
  }, [compact, tab, focusTaak?.id]);

  /* Eén veilige Opnieuw. retryDurableTask zet dezelfde taak terug in de rij
     (de server ontdubbelt). Alleen als magOpnieuw zegt dat er geen trade,
     betaling, verzending, deploy of merge in zit; anders alleen openen. */
  const [opnieuwBezig, setOpnieuwBezig] = useState(false);
  const opnieuw = async () => {
    if (opnieuwBezig) return;
    if (!bereikbaar) { window.location.reload(); return; }
    const t = misluktTaken[0];
    if (!t || !magOpnieuw(t)) return;
    if (ONTWERP) { setStatusNote('Design mode: retry not sent'); return; }
    setOpnieuwBezig(true);
    try {
      await retryDurableTask(t.id, 'luka');
      setMisluktTaken((r) => r.filter((x) => x.id !== t.id));
      setStatusNote(`Retrying: ${t.titel}`);
    } catch (e) {
      setStatusNote(`Retry failed: ${(e as Error).message}`);
    } finally {
      setOpnieuwBezig(false);
    }
  };

  const peek = !open ? peekRij[0] ?? null : null;
  useEffect(() => {
    if (open && peekRij.length) setPeekRij([]);
  }, [open, peekRij.length]);
  const okStrook = kiesOkStrook(
    approvals.map((a) => ({ id: a.id, titel: a.title || a.kind || 'Approval', detail: a.wat || a.detail || '', gevaarlijk: isDangerousApproval(a) })),
    open, Boolean(peek),
  );
  const [okBezig, setOkBezig] = useState(false);
  const beslisOk = async (id: string, ja: boolean) => {
    const a = approvals.find((x) => x.id === id);
    if (!a || okBezig) return;
    setOkBezig(true);
    try {
      await beslisApproval(a.task_id, a.id, ja, ja ? 'notch' : 'notch reject');
      setApprovals((prev) => prev.filter((x) => x.id !== a.id));
      setStatusNote(ja ? 'Goedgekeurd' : 'Afgewezen');
    } catch (e) {
      setStatusNote((e as Error).message);
    } finally {
      setOkBezig(false);
    }
  };
  useEffect(() => {
    onPeekChange?.(Boolean(peek || okStrook));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(peek || okStrook)]);
  useEffect(() => {
    if (!peek) return;
    const id = window.setTimeout(() => setPeekRij((r) => r.slice(1)), PEEK_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peek?.id]);

  /* ── Home (18 nov): wat er nu speelt in één blik. De agenda één keer per
        5 min; de rest leeft al in de notch. */
  const [volgende, setVolgende] = useState<{ naam: string; at: string } | null>(null);
  /* Eén ding vandaag (18 nov, uit Spazio): eigen keuze in user_settings, zodat
     iMac en Mac mini hetzelfde ding tonen; anders de oudste stap van Luka. */
  const [eigenDing, setEigenDing] = useState<EigenDing | null>(null);
  const [jouwBeurt, setJouwBeurt] = useState<GedeeldeStap[]>([]);
  const [ritme, setRitme] = useState<RitmeDag[]>([]);
  const [dingKiezen, setDingKiezen] = useState(false);
  const [dingTekst, setDingTekst] = useState('');
  const bewaarDing = async (d: EigenDing | null) => {
    setEigenDing(d);
    await saveSetting(EEN_DING_SLEUTEL(new Date()), d).catch(() => undefined);
  };
  const [homeNu, setHomeNu] = useState(() => new Date());
  // De klok rechts in de balk loopt op elke tab (Home ververst alleen zichzelf).
  const [balkNu, setBalkNu] = useState(() => new Date());
  useEffect(() => {
    if (!open) return;
    setBalkNu(new Date());
    const id = window.setInterval(() => setBalkNu(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, [open]);
  useEffect(() => {
    if (!(open && tab === 'home')) return;
    let weg = false;
    const laad = async () => {
      setHomeNu(new Date());
      try {
        const nu = new Date();
        const { items } = await calendarJobs(nu, new Date(nu.getTime() + 36 * 3600 * 1000));
        if (!weg) setVolgende(eerstvolgende(items.map((i) => ({ naam: i.naam, at: i.at })), nu));
      } catch { /* geen agenda bereikbaar: regel valt weg */ }
      try {
        const st = await gedeeldeStappen();
        if (!weg) setJouwBeurt(st.jouw_beurt);
      } catch { /* geen verbinding: dan alleen eigen keuze / goedkeuringen */ }
      try {
        const r = await logRitme();
        if (!weg) setRitme(r.dagen);
      } catch { /* oude API zonder /log/ritme: strookje valt weg */ }
      try {
        // De andere Mac kan het ding net gezet hebben: niet uit de lokale cache.
        const sleutel = EEN_DING_SLEUTEL(new Date());
        try { localStorage.removeItem(sleutel); } catch { /* */ }
        const d = await loadSetting<EigenDing | null>(sleutel, null);
        if (!weg) setEigenDing(d && typeof d === 'object' ? d : null);
      } catch { /* */ }
    };
    void laad();
    const id = window.setInterval(() => setHomeNu(new Date()), 30_000);
    const id2 = window.setInterval(() => void laad(), 5 * 60_000);
    return () => { weg = true; window.clearInterval(id); window.clearInterval(id2); };
  }, [open, tab]);
  const home = homeStand(homeNu, moment, volgende, bereikbaar);
  const eenDing = kiesEenDing(eigenDing, jouwBeurt, approvals.length, homeNu, bereikbaar);

  const onDropFiles = (list: FileList | File[]) => {
    neemSleepAan({ bestanden: Array.from(list).map((f) => ({ name: f.name, size: f.size })) });
  };

  const icons = (
    <>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="Home"
        aria-pressed={open && tab === 'home'}
        title="Home — wat er nu speelt"
        onClick={() => {
          set(true);
          setTab('home');
        }}
      >
        <Home size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="Chat"
        aria-pressed={open && tab === 'chat'}
        title="Chat"
        onClick={() => {
          set(true);
          setTab('chat');
          setTimeout(() => inputRef.current?.focus(), 80);
        }}
      >
        <MessageSquare size={15} strokeWidth={1.7} />
      </button>
      {/* Tweede pagina, zoals op Luka's foto: muziek, geluid, schakelaars, weer. */}
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="Widgets"
        aria-pressed={open && tab === 'widgets'}
        title="Music, sound, switches"
        onClick={() => {
          set(true);
          setTab('widgets');
        }}
      >
        <LayoutGrid size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="New"
        title="Nieuwe chat / bijlage"
        onClick={() => {
          set(true);
          setTab('chat');
          setMessages([]);
          setFiles([]);
          setTekst('');
          setProjectie(null);
          fileRef.current?.click();
        }}
      >
        <Plus size={15} strokeWidth={1.7} />
      </button>
      {/* 27 nov: groot alleen als Luka het wil. Ook ⌘E; Esc stapt terug. */}
      {open && (
        <button
          type="button"
          className="axe-ov__ico axe-ov__ico--maat"
          aria-label={zichtbaar === 'groot' ? 'Compact view' : 'Large view'}
          title={zichtbaar === 'groot' ? 'Compact (⌘E)' : 'Large (⌘E)'}
          onClick={() => {
            const naar = zichtbaar === 'groot' ? 'compact' : 'groot';
            kiesGrootte(naar);
            if (!heeftCompact(tab)) setTab('home');
          }}
        >
          {zichtbaar === 'groot' ? <Minimize2 size={15} strokeWidth={1.7} /> : <Maximize2 size={15} strokeWidth={1.7} />}
        </button>
      )}
    </>
  );
  const iconsRight = (
    <>
      {/* De klok alleen als het statuswoord naast de bol er niet staat: op
          900px breed liepen die twee over elkaar heen (27 nov). Compact toont
          de tijd in de Today-kaart. */}
      {open && !compact && leven.woord === '' && !claude && <span className="axe-ov__balktijd" aria-label="Date and time">{balkTijd(balkNu)}</span>}
      {/* Uit AXE Overlay (9 nov): goedkeuringen en agents horen in deze ene notch. */}
      <button
        type="button"
        className="axe-ov__ico axe-ov__ico--teller"
        aria-label={`Approvals${approvals.length ? ` (${approvals.length})` : ''}`}
        aria-pressed={open && tab === 'approvals'}
        title="Goedkeuringen"
        onClick={() => {
          set(true);
          setTab('approvals');
        }}
      >
        <CheckCircle2 size={15} strokeWidth={1.7} />
        <Teller n={approvals.length} />
      </button>
      {/* 18 nov: AXE én Claude in de notch -- één klik naar wat Claude doet. */}
      <button
        type="button"
        className={`axe-ov__ico ${claude ? 'axe-ov__ico--claude' : ''}`}
        aria-label="Claude"
        aria-pressed={open && tab === 'claude'}
        title={claude ? `Claude · ${claude.nu}` : 'Claude'}
        onClick={() => {
          set(true);
          setTab('claude');
        }}
      >
        <Bot size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="axe-ov__ico axe-ov__ico--teller"
        aria-label={`Agents${activity.length ? ` (${activity.length} busy)` : ''}`}
        title="Managers en agents"
        onClick={() => {
          set(false);
          void openInShell('/managers');
        }}
      >
        <Users size={15} strokeWidth={1.7} />
        <Teller n={activity.length} />
      </button>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="Settings"
        aria-pressed={open && tab === 'settings'}
        title="Instellingen"
        onClick={() => {
          set(true);
          setTab('settings');
        }}
      >
        <Settings size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className={`axe-ov__ico ${listening ? 'axe-ov__ico--hot' : ''}`}
        aria-label="Push-to-talk"
        aria-pressed={listening}
        title={listening ? 'Stop push-to-talk' : 'Push-to-talk'}
        onClick={() => {
          set(true);
          setTab('chat');
          togglePtt();
        }}
      >
        <Mic size={15} strokeWidth={1.7} />
      </button>
      {onInklappen && (
        <button
          type="button"
          className="axe-ov__ico"
          aria-label="Collapse to handle"
          title="Inklappen"
          onClick={() => {
            set(false);
            onInklappen();
          }}
        >
          <ChevronUp size={15} strokeWidth={1.7} />
        </button>
      )}
    </>
  );

  return (
    <div
      className={`axe-ov ${open ? 'axe-ov--open' : 'axe-ov--notch'} ${compact ? 'axe-ov--compact' : ''} ${dragging ? 'axe-ov--drag' : ''}`}
      data-axe-overlay
      ref={wortelRef}
      onMouseMove={volgMuis}
      onMouseLeave={() => { wortelRef.current?.style.setProperty('--axe-kijk-x', '0'); wortelRef.current?.style.setProperty('--axe-kijk-y', '0'); }}
      onDragEnter={(e: DragEvent) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={(e: DragEvent) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        // Bestanden, links én tekst. Eén sleep levert vaak twee vormen van
        // hetzelfde op (een uri-list plus dezelfde URL als platte tekst);
        // sorteerSleep ontdubbelt dat, dus ze mogen hier alle drie mee.
        neemSleepAan({
          bestanden: Array.from(e.dataTransfer.files ?? []).map((f) => ({ name: f.name, size: f.size })),
          uriList: e.dataTransfer.getData('text/uri-list') || null,
          tekst: e.dataTransfer.getData('text/plain') || null,
        });
      }}
    >
      <div className="axe-ov__stars" aria-hidden="true" />
      {dragging && (
        <div className="axe-ov__dropzone" aria-hidden="true">
          <div className="axe-ov__drop-vak">
            <AxeGezicht kleur={AXE_CYAAN} stemming="werkt" size={40} label="AXE" levend />
            <span>Drop here: ask AXE about it, or convert it to another format</span>
            <span className="axe-ov__drop-soorten"><i>PDF</i><i>Images</i><i>Docs</i><i>Links</i><i>…</i></span>
          </div>
          {/* Ronde 5, naar Luka's foto: de managers als rail ernaast. */}
          <div className="axe-ov__drop-rail">
            {AXE_AGENTS.filter((a) => a.id !== 'axe').slice(0, 5).map((a) => (
              <AxeGezicht key={a.id} kleur={a.accent} stemming="rust" size={24} label={a.kort || a.name} levend fase={fase(a.id)} />
            ))}
          </div>
        </div>
      )}
      {/* Géén data-tauri-drag-region. Die stond hier en maakte de hele balk
          tot venstergreep, dus één onbedoelde sleep zette de notch uit het
          midden en niets zette hem terug — precies wat Luka op 5 nov zag. Een
          strook die bij de schermrand hoort, hoort niet te verschuiven; de
          plek wordt bepaald in FloatAxe (dockTop) en nergens anders. */}
      <div className="axe-ov__top">
        <div className="axe-ov__icons">{icons}</div>
        {/* De bol ademt, en zodra er iets is staat het woord ernaast. De kleur
            zit in dat woord; de bol krijgt alleen een ring (wet 10). */}
        <div className="axe-ov__hart">
          {/* 27 nov (Luka): geen ring meer om AXE -- "nooit om gevraagd, niet
              luxe". De toestand zit nu in het gezicht zelf (ademen, ogen) en
              in het woord ernaast. */}
          <span className="axe-ov__bol" data-toestand={leven.toestand}>
            <button
              type="button"
              className="axe-ov__blob"
              aria-label={`${open ? 'Collapse' : 'Expand'} AXE — ${leven.uitleg}`}
              onClick={() => {
                // Openvouwen = Home, in de onthouden stand (compact tenzij Luka groot koos).
                if (!open) setTab('home');
                set((v) => !v);
              }}
              title={`${manager.label} — ${leven.uitleg}`}
            >
              {/* 19 nov: het AXE-driehoekje uit het Managers-tabblad, niet meer de ronde bol. */}
              <AxeGezicht kleur={AXE_CYAAN} stemming={AXE_STEMMING[leven.toestand] ?? 'rust'} size={34} label="AXE" levend />
            </button>
          </span>
          {claude && (
            <button
              type="button"
              className={`axe-ov__claude axe-ov__claude--${claude.toestand}`}
              title={`Claude · ${claude.project}${claude.vraag ? ` — ${claude.vraag}` : ''}`}
              onClick={() => { set(true); setTab('claude'); }}
            >
              <AxeGezicht kleur={CLAUDE_KORAAL} stemming={CLAUDE_STEMMING[claude.toestand]} size={22} label="Claude" levend fase={1.7} />
              <span className="axe-ov__claude-tekst">{claude.nu}</span>
              <span className="axe-ov__claude-tijd">{klok(claude.seconden)}</span>
            </button>
          )}
          {leven.woord !== '' && (
            <button
              type="button"
              className={`axe-ov__leven axe-ov__leven--${leven.toestand}`}
              title={leven.uitleg}
              onClick={() => {
                set(true);
                // Het woord is ook de kortste weg naar waar het over gaat.
                setTab(leven.toestand === 'wacht' ? 'approvals' : 'chat');
              }}
            >
              {leven.telling !== null && <b>{leven.telling}</b>}
              {leven.woord}
            </button>
          )}
        </div>
        <div className="axe-ov__icons">{iconsRight}</div>
      </div>

      {peek && (
        <button
          type="button"
          className={`axe-ov__peek axe-ov__peek--${peek.soort}`}
          onClick={() => {
            setPeekRij([]);
            if (peek.pad) {
              void import('@tauri-apps/api/core').then(({ invoke }) => invoke('portal_toon', { pad: peek.pad })).catch(() => undefined);
              return;
            }
            set(true);
            setTab(peek.tab);
          }}
          title="Openen"
        >
          <span className="axe-ov__peek-titel">{peek.titel}</span>
          <span className="axe-ov__peek-tekst">{peek.tekst}</span>
          {peekRij.length > 1 && <span className="axe-ov__peek-meer">+{peekRij.length - 1}</span>}
        </button>
      )}

      {okStrook && (
        <div className={`axe-ov__peek axe-ov__ok${okStrook.gevaarlijk ? ' axe-ov__ok--gevaar' : ''}`} role="group" aria-label="Approval waiting">
          <button type="button" className="axe-ov__ok-tekst" onClick={() => { set(true); setTab('approvals'); }} title="Open approvals">
            <span className="axe-ov__peek-titel">{okStrook.titel}</span>
            <span className="axe-ov__peek-tekst">{okStrook.tekst}</span>
            {okStrook.meer > 0 && <span className="axe-ov__peek-meer">+{okStrook.meer}</span>}
          </button>
          {okStrook.gevaarlijk ? (
            <button type="button" className="axe-ov__ok-knop" onClick={() => void focusMainShell()}>Open</button>
          ) : (
            <>
              <button type="button" className="axe-ov__ok-knop axe-ov__ok-knop--ja" disabled={okBezig}
                onClick={() => void beslisOk(okStrook.id, true)} aria-label="Approve">
                <Check size={14} strokeWidth={2.6} aria-hidden /> Approve
              </button>
              <button type="button" className="axe-ov__ok-knop" disabled={okBezig}
                onClick={() => void beslisOk(okStrook.id, false)} aria-label="Reject">
                <X size={14} strokeWidth={2.6} aria-hidden />
              </button>
            </>
          )}
        </div>
      )}

      {compact && (() => {
        const stand = compacteStand({
          gesleept: dragging || omzet.length > 0,
          bereikbaar,
          mislukt: misluktTaken.length,
          actief: activity.length + (claude ? 1 : 0),
          openSindsMs: nuTik - openSinds,
        });
        const stemming = AXE_STEMMING[leven.toestand] ?? 'rust';
        const naarGroot = (t: Tab) => { setTab(t); };
        const vandaagKaart = (
          <div className="axe-ov__vlak axe-ov__w axe-ov__dag axe-ov__dag--compact">
            <div className="axe-ov__w-kop">
              <span className="axe-ov__w-label"><CalendarDays size={13} strokeWidth={1.8} />Today</span>
              <span className="axe-ov__w-meta">{balkTijd(balkNu)}</span>
            </div>
            <b className="axe-ov__dag-groet">{groet(new Date(nuTik).getHours())}</b>
            <button type="button" className="axe-ov__dag-wacht" disabled={approvals.length === 0} onClick={() => naarGroot('approvals')}>
              {wachtZin(approvals.length)}
            </button>
          </div>
        );
        return (
          <div className={`axe-ov__compact axe-ov__compact--${tab === 'widgets' ? 'widgets' : stand}`} data-stand={tab === 'widgets' ? 'widgets' : stand}>
            {tab === 'widgets' ? (
              <NotchWidgets open={compact && tab === 'widgets'} pagina="werk" vandaag={vandaagKaart} />
            ) : stand === 'gesleept' && omzet.length > 0 ? (
              <div className="axe-ov__vlak axe-ov__omzet axe-ov__omzet--compact">
                <div className="axe-ov__omzet-kop">
                  <b>{omzet.length === 1 ? 'Dropped file' : `${omzet.length} dropped files`}</b>
                  <button type="button" onClick={() => setOmzet([])} aria-label="Close">×</button>
                </div>
                {omzet.slice(0, 2).map((x) => (
                  <div key={x.pad} className="axe-ov__omzet-rij">
                    <span className="axe-ov__omzet-naam" title={x.pad}>{x.naam}</span>
                    <div className="axe-ov__omzet-knoppen">
                      <button type="button" className="is-axe" onClick={() => naarAxe(x)}>Ask AXE</button>
                      {x.doelen.slice(0, 3).map((d) => (
                        <button key={d} type="button" disabled={Boolean(x.bezig)} onClick={() => void zetOm(x.pad, d)}>{x.bezig === d ? '…' : d}</button>
                      ))}
                    </div>
                    {x.klaar && <span className="axe-ov__omzet-klaar">Saved as {x.klaar.split('/').pop()}</span>}
                    {x.fout && <span className="axe-ov__omzet-fout">{x.fout}</span>}
                  </div>
                ))}
                {omzet.length > 2 && <button type="button" className="axe-ov__c-link" onClick={() => kiesGrootte('groot')}>+{omzet.length - 2} more · Large view</button>}
              </div>
            ) : stand === 'gesleept' ? (
              <div className="axe-ov__vlak axe-ov__c-kaart axe-ov__c-drop">
                <AxeGezicht kleur={AXE_CYAAN} stemming="werkt" size={48} label="AXE" levend />
                <div className="axe-ov__c-tekst">
                  <b>Drop it on AXE</b>
                  <span>Ask about it, or convert it to another format.</span>
                </div>
              </div>
            ) : stand === 'fout' ? (() => {
              const z = foutZin(bereikbaar, misluktTaken);
              const t = misluktTaken[0];
              const veilig = !bereikbaar || (t ? magOpnieuw(t) : false);
              return (
                <div className="axe-ov__vlak axe-ov__c-kaart axe-ov__c-fout">
                  <div className="axe-ov__gloed" data-toestand="fout" aria-hidden="true" />
                  <AxeGezicht kleur={t ? gezichtVoor(t.wie).kleur : AXE_CYAAN} stemming="fout" size={48} label={t ? gezichtVoor(t.wie).naam : 'AXE'} levend />
                  <div className="axe-ov__c-tekst">
                    <b>{z.titel}</b>
                    <span>{z.reden}</span>
                  </div>
                  {veilig ? (
                    <button type="button" className="axe-ov__c-knop" disabled={opnieuwBezig} onClick={() => void opnieuw()}>
                      <RotateCcw size={13} strokeWidth={2} aria-hidden /> {bereikbaar ? 'Retry' : 'Try again'}
                    </button>
                  ) : (
                    <button type="button" className="axe-ov__c-knop" onClick={() => { set(false); onHome?.(); void focusMainShell(); }} title="This task touches money, sends or deploys: check it in AXE CORE">
                      Open in AXE CORE
                    </button>
                  )}
                </div>
              );
            })() : stand === 'werkt' ? (() => {
              const rijen = stapRijen(stappen);
              const pillen = [
                ...(claude ? [{ sleutel: 'claude', kleur: CLAUDE_KORAAL, naam: 'Claude', tekst: claude.nu, stemming: CLAUDE_STEMMING[claude.toestand], tab: 'claude' as Tab }] : []),
                ...activity.map((line, i) => {
                  const g = gezichtVoor(activityWie[i]);
                  return { sleutel: `a${i}`, kleur: g.kleur, naam: g.naam, tekst: line.replace(/\s·\s[^·]*$/, ''),
                    stemming: (/waiting/i.test(line) ? 'wacht' : 'werkt') as Stemming, tab: (/waiting/i.test(line) ? 'approvals' : 'chat') as Tab };
                }),
              ].slice(0, 4);
              const hoofd = actiefTaken[0];
              return (
                <div className="axe-ov__c-werk">
                  <div className="axe-ov__vlak axe-ov__c-kaart axe-ov__c-held">
                    <div className="axe-ov__gloed" data-toestand={leven.toestand} aria-hidden="true" />
                    <button type="button" className="axe-ov__held-gezicht" onClick={() => naarGroot(leven.toestand === 'wacht' ? 'approvals' : 'chat')} title={leven.uitleg}>
                      <AxeGezicht kleur={AXE_CYAAN} stemming={stemming} size={52} label="AXE" levend volg />
                    </button>
                    <div className="axe-ov__c-tekst">
                      <b>{hoofd ? hoofd.titel : claude ? claude.nu : leven.uitleg}</b>
                      {rijen.length > 0 ? (
                        <ul className="axe-ov__c-stappen" aria-label="Steps">
                          {rijen.map((r) => (
                            <li key={r.id} className={`is-${r.merk}`}>
                              <i aria-hidden="true">{r.merk === 'klaar' ? <Check size={11} strokeWidth={3} /> : r.merk === 'mislukt' ? <X size={11} strokeWidth={3} /> : null}</i>
                              <span>{r.titel}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span>{hoofd ? `${gezichtVoor(hoofd.wie).naam} · ${hoofd.status.replace(/_/g, ' ')}` : leven.uitleg}</span>
                      )}
                    </div>
                  </div>
                  <div className="axe-ov__c-pillen" data-aantal={pillen.length}>
                    {pillen.map((p) => (
                      <button key={p.sleutel} type="button" className="axe-ov__vlak axe-ov__c-pil" style={{ ['--chip' as string]: p.kleur }} onClick={() => naarGroot(p.tab)} title={`${p.naam} · ${p.tekst}`}>
                        <AxeGezicht kleur={p.kleur} stemming={p.stemming} size={24} label={p.naam} levend fase={fase(p.sleutel)} />
                        <span className="axe-ov__c-pil-tekst"><b>{p.naam}</b><span>{p.tekst}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })() : (
              <div className={`axe-ov__vlak axe-ov__c-kaart axe-ov__c-${stand}`}>
                {stand === 'groet' && (
                  <div className="axe-ov__glinster" aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} />)}
                  </div>
                )}
                <div className="axe-ov__stof axe-ov__stof--l" aria-hidden="true" />
                <div className="axe-ov__stof axe-ov__stof--r" aria-hidden="true" />
                <div className="axe-ov__gloed" data-toestand={leven.toestand} aria-hidden="true" />
                <button type="button" className="axe-ov__held-gezicht" onClick={() => naarGroot('chat')} title="Ask AXE">
                  <AxeGezicht kleur={AXE_CYAAN} stemming={stand === 'groet' ? 'klaar' : stemming} size={52} label="AXE" levend volg />
                </button>
                <div className="axe-ov__c-tekst">
                  <b>{stand === 'groet' ? groet(new Date(nuTik).getHours()) : 'All quiet'}</b>
                  {/* Alleen een echt ding (eigen keuze, open stap, goedkeuring); de
                      lege 'rust'-tekst van eenDing is Nederlands en zegt niets. */}
                  <span>{eenDing.bron !== 'rust' && eenDing.tekst ? `Next · ${eenDing.tekst}` : 'Managers are quiet. Ask AXE anything.'}</span>
                </div>
                <div className="axe-ov__c-rechts">
                  <button type="button" className="axe-ov__c-knop" disabled={approvals.length === 0} onClick={() => naarGroot('approvals')}>
                    {wachtZin(approvals.length)}
                  </button>
                  <div className="axe-ov__c-rail" aria-label="Managers">
                    {MANAGERS.filter((m) => m.agent !== 'axe').slice(0, 5).map((m) => {
                      const g = gezichtVoor(m.agent);
                      return <AxeGezicht key={m.id} kleur={g.kleur} stemming="rust" size={20} label={g.naam} levend fase={fase(m.id)} />;
                    })}
                  </div>
                </div>
              </div>
            )}
            {statusNote && (
              <div className="axe-ov__note axe-ov__note--compact">
                {statusNote}
                <button type="button" aria-label="Sluit" onClick={() => setStatusNote('')}><X size={12} /></button>
              </div>
            )}
          </div>
        );
      })()}

      {open && !compact && (
        <div className="axe-ov__body">
          {/* Wie je spreekt: alleen in de chat (op Home/widgets was dit een
              tweede balk die de foto's niet hebben). Goedkeuringen hebben hun
              teller al op het icoon bovenin. */}
          {tab === 'widgets' && (
            <div className="axe-ov__home">
              <NotchWidgets open={open && tab === 'widgets'} pagina="mac" />
            </div>
          )}

          {tab === 'chat' && (
            <div className="axe-ov__manager">
              <button type="button" className="axe-ov__mgr-btn" onClick={() => setManagerIdx((i) => (i - 1 + MANAGERS.length) % MANAGERS.length)} aria-label="Vorige manager">‹</button>
              <span>{manager.label}</span>
              <button type="button" className="axe-ov__mgr-btn" onClick={() => setManagerIdx((i) => (i + 1) % MANAGERS.length)} aria-label="Volgende manager">›</button>
            </div>
          )}

          {/* Op Home staan ze als pillen in het eiland; niet dubbel. */}
          {((activity.length > 0 && tab !== 'home') || dragging) && (
            <div className="axe-ov__activity">
              {dragging && <div className="axe-ov__drop-hint">Drop → AXE</div>}
              {activity.map((line, i) => {
                const g = gezichtVoor(activityWie[i]);
                return (
                  <div key={i} className="axe-ov__act-chip axe-ov__act-chip--gezicht" style={{ ['--chip' as string]: g.kleur }} title={`${g.naam} · ${line}`}>
                    <AxeGezicht kleur={g.kleur} stemming={/waiting/i.test(line) ? 'wacht' : 'werkt'} size={22} label={g.naam} levend fase={fase(`r${i}`)} />
                    <span className="axe-ov__act-tekst">{line.replace(/\s·\s[^·]*$/, '')}</span>
                  </div>
                );
              })}
            </div>
          )}

          {statusNote && (
            <div className="axe-ov__note">
              {statusNote}
              <button type="button" aria-label="Sluit" onClick={() => setStatusNote('')}><X size={12} /></button>
            </div>
          )}

          {tab === 'home' && (
            <div className="axe-ov__home">
              {omzet.length > 0 && (
                <div className="axe-ov__vlak axe-ov__omzet">
                  <div className="axe-ov__omzet-kop">
                    <b>{omzet.length === 1 ? 'Dropped file' : `${omzet.length} dropped files`}</b>
                    <button type="button" onClick={() => setOmzet([])} aria-label="Close">×</button>
                  </div>
                  {omzet.map((x) => (
                    <div key={x.pad} className="axe-ov__omzet-rij">
                      <span className="axe-ov__omzet-naam" title={x.pad}>{x.naam}</span>
                      <div className="axe-ov__omzet-knoppen">
                        <button type="button" className="is-axe" onClick={() => naarAxe(x)}>Ask AXE</button>
                        {x.doelen.map((d) => (
                          <button key={d} type="button" disabled={Boolean(x.bezig)} onClick={() => void zetOm(x.pad, d)}>
                            {x.bezig === d ? '…' : d === 'web' ? 'web (small jpg)' : d === 'pdf' && /\.(docx?|rtf|odt|html?|md|txt)$/i.test(x.naam) ? 'pdf (text)' : d}
                          </button>
                        ))}
                      </div>
                      {x.klaar && (
                        <button type="button" className="axe-ov__omzet-klaar" onClick={() => void import('@tauri-apps/api/core').then(({ invoke }) => invoke('toon_in_finder', { pad: x.klaar }))}>
                          Saved as {x.klaar.split('/').pop()} · Show in Finder
                        </button>
                      )}
                      {x.fout && <span className="axe-ov__omzet-fout">{x.fout}</span>}
                      {x.doelen.length === 0 && !x.klaar && <span className="axe-ov__omzet-fout is-rustig">This type can't be converted; AXE can still read it.</span>}
                    </div>
                  ))}
                  <p className="axe-ov__omzet-voet">The original always stays. The new file goes next to it.</p>
                </div>
              )}
              {/* Het eiland (Luka 20 nov, ronde 1): links AXE groot met wat hij
                  doet, rechts wie er nog meer bezig is. Bij geen verbinding één
                  foutkaart in plaats van tellers die oud kunnen zijn. */}
              {leven.toestand === 'onbereikbaar' ? (
                <div className="axe-ov__vlak axe-ov__fout">
                  <div className="axe-ov__gloed" data-toestand="fout" aria-hidden="true" />
                  <AxeGezicht kleur={AXE_CYAAN} stemming="fout" size={56} label="AXE" levend />
                  <div className="axe-ov__fout-tekst">
                    <b>AXE can't reach the server</b>
                    <span>The VPS isn't answering, so what you see here may be old. Your managers keep working there; this view catches up when it's back.</span>
                  </div>
                  <button type="button" className="axe-ov__fout-opnieuw" aria-label="Try again" title="Try again" onClick={() => window.location.reload()}>↻</button>
                </div>
              ) : (
                activity.length === 0 && !claude ? (
                /* Ronde 5 (foto 2): niets te doen → AXE in het midden, sterrenstof
                   eromheen. Rust ziet er anders uit dan werk. */
                <div className="axe-ov__vlak axe-ov__rust">
                  <div className="axe-ov__stof axe-ov__stof--l" aria-hidden="true" />
                  <div className="axe-ov__stof axe-ov__stof--r" aria-hidden="true" />
                  <div className="axe-ov__gloed axe-ov__gloed--midden" data-toestand={leven.toestand} aria-hidden="true" />
                  <button type="button" className="axe-ov__held-gezicht" onClick={() => setTab(leven.toestand === 'wacht' ? 'approvals' : 'chat')} title={leven.uitleg}>
                    <AxeGezicht kleur={AXE_CYAAN} stemming={AXE_STEMMING[leven.toestand] ?? 'rust'} size={72} label="AXE" levend volg />
                  </button>
                  <span className="axe-ov__rust-tekst">{eenDing.tekst ? `Next · ${eenDing.tekst}` : 'Managers are quiet. Ask AXE anything.'}</span>
                </div>
                ) : (
                <div className="axe-ov__eiland">
                  <div className="axe-ov__vlak axe-ov__held">
                    <div className="axe-ov__gloed" data-toestand={leven.toestand} aria-hidden="true" />
                    <button type="button" className="axe-ov__held-gezicht" onClick={() => setTab(leven.toestand === 'wacht' ? 'approvals' : 'chat')} title={leven.uitleg}>
                      <AxeGezicht kleur={AXE_CYAAN} stemming={AXE_STEMMING[leven.toestand] ?? 'rust'} size={84} label="AXE" levend volg />
                    </button>
                    <ul className="axe-ov__stappen" aria-label="What AXE is doing">
                      {activity[1] && <li className="is-vorig"><History size={14} strokeWidth={1.7} /><span>{activity[1].replace(/\s·\s[^·]*$/, '')}</span></li>}
                      <li className="is-nu"><SquareTerminal size={17} strokeWidth={1.7} /><span>{activity[0] ? activity[0].replace(/\s·\s[^·]*$/, '') : leven.uitleg}</span></li>
                      {eenDing.tekst && <li className="is-volgend"><ArrowRight size={14} strokeWidth={1.7} /><span>{eenDing.tekst}</span></li>}
                    </ul>
                  </div>
                  <div className="axe-ov__vlak axe-ov__pillen">
                    {claude && (
                      <button type="button" className="axe-ov__pil" style={{ ['--chip' as string]: CLAUDE_KORAAL }} onClick={() => setTab('claude')} title={`Claude · ${claude.nu}`}>
                        <AxeGezicht kleur={CLAUDE_KORAAL} stemming={CLAUDE_STEMMING[claude.toestand]} size={28} label="Claude" levend fase={1.7} />
                        <span>{claude.nu}</span>
                      </button>
                    )}
                    {activity.slice(0, claude ? 3 : 4).map((line, i) => {
                      const g = gezichtVoor(activityWie[i]);
                      return (
                        <div key={i} className="axe-ov__pil" style={{ ['--chip' as string]: g.kleur }} title={`${g.naam} · ${line}`}>
                          <AxeGezicht kleur={g.kleur} stemming={/waiting/i.test(line) ? 'wacht' : 'werkt'} size={28} label={g.naam} levend fase={fase(`p${i}`)} />
                          <span>{line.replace(/\s·\s[^·]*$/, '')}</span>
                        </div>
                      );
                    })}
                    {!claude && activity.length === 0 && (
                      <p className="axe-ov__pillen-leeg">Managers are quiet. Ask AXE anything.</p>
                    )}
                  </div>
                </div>
                )
              )}
              {/* 20 nov, naar Luka's foto: één rij gelijke kaarten (Vandaag ·
                  Taken · Focus · Weer) in plaats van een lange pagina. */}
              <NotchWidgets open={open && tab === 'home'} pagina="werk" vandaag={(
              <div className="axe-ov__vlak axe-ov__w axe-ov__dag">
              <div className="axe-ov__w-kop">
                <span className="axe-ov__w-label"><CalendarDays size={13} strokeWidth={1.8} />{home.groet}</span>
                <span className="axe-ov__w-meta">today</span>
              </div>
              <div className={`axe-ov__eending axe-ov__eending--${eenDing.bron}${eenDing.klaar ? ' is-klaar' : ''}`}>
                <span className="axe-ov__eending-label">Eén ding vandaag</span>
                {dingKiezen ? (
                  <form
                    className="axe-ov__eending-kies"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const tekst = dingTekst.trim();
                      setDingKiezen(false);
                      void bewaarDing(tekst ? { datum: datumSleutel(new Date()), tekst, klaar: false } : null);
                    }}
                  >
                    <input
                      autoFocus
                      value={dingTekst}
                      onChange={(e) => setDingTekst(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setDingKiezen(false); }}
                      placeholder="Wat moet vandaag echt gebeuren?"
                      maxLength={140}
                    />
                    <button type="submit">Zet vast</button>
                  </form>
                ) : (
                  <>
                    <div className="axe-ov__eending-rij">
                      {eenDing.bron === 'eigen' && (
                        <button
                          type="button"
                          className="axe-ov__eending-vink"
                          aria-pressed={eenDing.klaar}
                          aria-label={eenDing.klaar ? 'Nog niet af' : 'Af'}
                          onClick={() => eigenDing && void bewaarDing({ ...eigenDing, klaar: !eigenDing.klaar })}
                        >
                          {eenDing.klaar ? '✓' : ''}
                        </button>
                      )}
                      <button
                        type="button"
                        className="axe-ov__eending-tekst"
                        disabled={!eenDing.tab}
                        onClick={() => { if (eenDing.tab) setTab(eenDing.tab); }}
                      >
                        {eenDing.tekst}
                      </button>
                    </div>
                    <div className="axe-ov__eending-voet">
                      <span>{eenDing.uitleg}</span>
                      <button
                        type="button"
                        onClick={() => { setDingTekst(eenDing.bron === 'eigen' ? eenDing.tekst : ''); setDingKiezen(true); }}
                      >
                        {eenDing.bron === 'eigen' ? 'Wijzig' : 'Zelf kiezen'}
                      </button>
                      {eenDing.bron === 'eigen' && (
                        <button type="button" onClick={() => void bewaarDing(null)}>Loslaten</button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <ul className="axe-ov__home-regels">
                {home.regels.map((r) => (
                  <li key={r.sleutel}>
                    <button
                      type="button"
                      className={`axe-ov__home-regel${r.rustig ? ' is-rustig' : ''}`}
                      disabled={!r.tab}
                      onClick={() => { if (r.tab) setTab(r.tab); }}
                    >
                      <span>{r.label}</span>
                      <b>{r.tekst}</b>
                    </button>
                  </li>
                ))}
              </ul>
              {ritme.length > 0 && (() => {
                const strook = ritmeStrook(ritme);
                return (
                  <div className="axe-ov__ritme" title="Steps done per day by every AI, last 30 days">
                    <div className="axe-ov__ritme-balken" aria-hidden="true">
                      {strook.balken.map((b) => (
                        <i key={b.dag} className={b.vandaag ? 'is-vandaag' : ''} style={{ height: `${Math.round(b.hoogte * 100)}%` }} title={`${b.dag}: ${b.aantal}`} />
                      ))}
                    </div>
                    <span>{strook.zin}</span>
                  </div>
                );
              })()}
              <button
                type="button"
                className="axe-ov__home-open"
                onClick={() => { set(false); onHome?.(); void focusMainShell(); }}
              >
                Open AXE CORE
              </button>
              </div>
              )} />
            </div>
          )}

          {tab === 'chat' && (
            <>
              <div className="axe-ov__messages" ref={listRef}>
                {messages.length === 0 && (
                  <p className="axe-ov__empty">
                    AXE always on your side — vraag iets, sleep bestanden, of PTT via de speaker.
                  </p>
                )}
                {/* 20 nov (Luka): "dat je een tijd ziet en alles" -- wie en wanneer
                    bij elk bericht, net als op de Managers-tab. */}
                {messages.map((m, i) => {
                  const wie = m.role === 'user' ? { naam: 'You', kleur: 'rgba(255,255,255,.55)' } : m.role === 'system' ? { naam: 'AXE', kleur: AXE_CYAAN } : gezichtVoor(manager.agent);
                  return (
                    <div key={i} className={`axe-ov__msg-rij axe-ov__msg-rij--${m.role}`}>
                      <div className="axe-ov__msg-kop">
                        <b style={{ color: wie.kleur }}>{wie.naam}</b>
                        {m.at ? <time dateTime={new Date(m.at).toISOString()}>{berichtTijd(m.at)}</time> : null}
                      </div>
                      <div className={`axe-ov__msg axe-ov__msg--${m.role}`}>{m.content}</div>
                    </div>
                  );
                })}
                {busy && (
                  <div className="axe-ov__dots" aria-label="Bezig">
                    <span /><span /><span />
                  </div>
                )}
              </div>

              {projectie && (
                <NotchResultaat projectie={projectie} onSluit={() => setProjectie(null)} />
              )}

              {/* Per bakje, niet op één hoop. Een kopje verschijnt alleen als
                  er iets in zit; "Downloads" boven niets is ruis. */}
              {files.length > 0 && groepeerSleep(files).map((groep) => (
                <div className="axe-ov__groep" key={groep.groep}>
                  <div className="axe-ov__groep-kop">
                    <span>{groep.label}</span>
                    <span className="axe-ov__groep-telling">{groep.items.length}</span>
                  </div>
                  <ul className="axe-ov__files">
                    {groep.items.map((f) => (
                      <li key={`${f.groep}-${f.label}-${f.waarde ?? ''}`}>
                        <span className="axe-ov__pdf">{f.soort}</span>
                        <span>{f.label}</span>
                        <span className="axe-ov__bestemming" title={f.bestemming === 'axon' ? 'Gaat naar het geheugen' : 'Gaat mee in het gesprek'}>
                          {f.bestemming === 'axon' ? 'AXON' : 'chat'}
                        </span>
                        <button
                          type="button"
                          aria-label="Verwijder"
                          onClick={() => setFiles((p) => p.filter((x) => x !== f))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <form
                className="axe-ov__input"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doSend();
                }}
              >
                <button
                  type="button"
                  className="axe-ov__attach-btn"
                  aria-label="Bijlage"
                  title="Bestand toevoegen"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip size={14} />
                </button>
                <input
                  ref={inputRef}
                  value={tekst}
                  placeholder="Bericht aan AXE…"
                  onChange={(e) => setTekst(e.target.value)}
                  aria-label="Message AXE"
                />
                <button type="submit" className="axe-ov__send" aria-label="Send" disabled={busy || (!tekst.trim() && files.length === 0)}>↑</button>
              </form>
            </>
          )}

          {tab === 'approvals' && (
            <div className="axe-ov__approvals">
              {approvals.length === 0 ? (
                <p className="axe-ov__empty">Geen pending approvals.</p>
              ) : (
                approvals.map((a) => (
                  <div key={a.id} className="axe-ov__appr-card">
                    <strong>{a.title || a.kind}</strong>
                    <p>{a.wat || a.detail || a.waarom || ''}</p>
                    {isDangerousApproval(a) ? (
                      <em className="axe-ov__warn">Trade/payment — keur goed in AXE CORE, niet hier.</em>
                    ) : (
                      <div className="axe-ov__appr-actions">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await beslisApproval(a.task_id, a.id, true, 'notch');
                              setApprovals((prev) => prev.filter((x) => x.id !== a.id));
                              setStatusNote('Goedgekeurd');
                            } catch (e) {
                              setStatusNote((e as Error).message);
                            }
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={async () => {
                            try {
                              await beslisApproval(a.task_id, a.id, false, 'notch reject');
                              setApprovals((prev) => prev.filter((x) => x.id !== a.id));
                            } catch (e) {
                              setStatusNote((e as Error).message);
                            }
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'claude' && (
            <div className="axe-ov__claude-paneel">
              {!claude ? (
                <p className="axe-ov__empty">
                  Claude is nu niet bezig. Zodra Claude Code werkt (op deze Mac, met de AXE-hook gekoppeld), zie je hier live wat hij doet.
                </p>
              ) : (
                <>
                  <div className="axe-ov__claude-kop">
                    <span>Claude · {claude.project || 'sessie'}</span>
                    <span>{klok(claude.seconden)}{claude.aantalSessies > 1 ? ` · ${claude.aantalSessies} sessies` : ''}</span>
                  </div>
                  {claude.toestemming && (
                    <div className="axe-ov__claude-toestemming">
                      <b>Claude vraagt toestemming · {claude.toestemming.tool}</b>
                      <pre>{claude.toestemming.opdracht}</pre>
                      <div className="axe-ov__claude-knoppen">
                        <button type="button" className="ghost" onClick={() => void beantwoord('weigeren')}>Weigeren</button>
                        {claude.toestemming.altijdKan && (
                          <button type="button" className="ghost" onClick={() => void beantwoord('altijd')}>Altijd</button>
                        )}
                        <button type="button" onClick={() => void beantwoord('toestaan')}>Toestaan</button>
                      </div>
                    </div>
                  )}
                  {claude.vraag && <p className="axe-ov__claude-vraag"><b>Je vroeg</b> {claude.vraag}</p>}
                  <ul className="axe-ov__claude-stappen">
                    {claude.stappen.slice(0, 12).map((st, i) => (
                      <li key={`${st.t}-${i}`} data-soort={st.soort} data-staat={st.staat}>
                        <i aria-hidden="true" />
                        <span>{st.wat}</span>
                        <em>{st.staat === 'bezig' ? 'bezig' : st.staat === 'mislukt' ? 'mislukt' : '✓'}</em>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="axe-ov__settings">
              <label className="axe-ov__check">
                <input
                  type="checkbox"
                  checked={launchAtLogin}
                  onChange={async (e) => {
                    const on = e.target.checked;
                    setLaunchAtLogin(on);
                    setStatusNote(on ? 'Launch at login: zet aan via Overlay Login Items / System Settings' : 'Launch at login uit');
                  }}
                />
                Launch overlay at login
              </label>
              <label className="axe-ov__check">
                <input
                  type="checkbox"
                  checked={geluid}
                  onChange={(e) => {
                    const aan = e.target.checked;
                    zetGeluid(aan);
                    setGeluid(aan);
                    if (aan) speelToon('klaar');
                  }}
                />
                Soft sound when something asks for you or finishes
              </label>
              <p className="axe-ov__hint">API key via ~/.axe/axe-api.key — nooit in de UI getoond.</p>
              <button type="button" className="axe-ov__link" onClick={() => void focusMainShell()}>Open AXE CORE shell</button>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onDropFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
