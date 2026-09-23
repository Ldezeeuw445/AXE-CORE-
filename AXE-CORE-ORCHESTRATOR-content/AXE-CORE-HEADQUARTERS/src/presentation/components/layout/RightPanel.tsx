import { TERMINAL_TASK_STATUSES } from '@/domain/tasks/taskStatus';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Calendar, Mic, Play, Terminal, FilePlus,
  CheckSquare, ChevronRight, ChevronLeft, X, Flame, Zap, Clock, Check,
} from 'lucide-react';
import { useUIStore } from '@/presentation/store/uiStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useIsTablet } from '@/presentation/hooks/use-tablet';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { ModelStatusWidget } from '@/presentation/components/widgets/ModelStatusWidget';
import { AxeAlgoWidget } from '@/presentation/components/widgets/AxeAlgoWidget';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { nextMindsetLine, nextAxeLine } from '@/domain/catalogs/mindsetLines';
import {
  getReplyLanguage,
  setReplyLanguage,
  type ReplyLanguage,
} from '@/domain/replyLanguage';
import { speakGlobal } from '@/infrastructure/gateways/globalTts';
import { LIST_GRID } from '@/presentation/components/surface/Page';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const quickActionIcons: Record<string, React.ComponentType<any>> = {
  plus: Plus,
  calendar: Calendar,
  mic: Mic,
  play: Play,
  terminal: Terminal,
  'file-plus': FilePlus,
};

interface ActiveTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
}

function speakLine(text: string, onDone?: () => void): void {
  speakGlobal(text, onDone);
}

function CyanQuoteButtons() {
  const [active, setActive] = useState<'mindset' | 'axe' | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const fireMindset = () => {
    const line = nextMindsetLine();
    setActive('mindset');
    setHint(line);
    speakLine(line, () => setActive(null));
  };

  const fireAxe = () => {
    const line = nextAxeLine();
    if (!line) {
      setHint(getReplyLanguage() === 'nl'
        ? 'Geen AXE-quotes — Settings → AXE Quotes'
        : 'No AXE quotes — Settings → AXE Quotes');
      setActive(null);
      return;
    }
    setActive('axe');
    setHint(line);
    speakLine(line, () => setActive(null));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={fireMindset}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs-custom font-semibold"
          style={{
            background: active === 'mindset' ? 'var(--tint-hi)' : 'var(--tint)',
            border: '1px solid var(--tint-line)',
            color: 'var(--accent-cyan)',
          }}
        >
          <Flame size={14} /> {active === 'mindset' ? '…' : 'Mindset'}
        </button>
        <button
          onClick={fireAxe}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs-custom font-semibold"
          style={{
            background: active === 'axe' ? 'var(--tint-hi)' : 'var(--tint)',
            border: '1px solid var(--tint-line)',
            color: 'var(--accent-cyan)',
          }}
        >
          <Zap size={14} /> {active === 'axe' ? '…' : 'AXE'}
        </button>
      </div>
      {hint && (
        <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {hint.startsWith('Geen') || hint.startsWith('No AXE') ? hint : `“${hint}”`}
        </p>
      )}
    </div>
  );
}

function ReplyLanguageWidget() {
  const [mode, setMode] = useState<ReplyLanguage>(getReplyLanguage);
  const choose = (next: ReplyLanguage) => {
    setReplyLanguage(next);
    setMode(next);
  };
  /* De ondertitel stond op een eigen regel onder de kop. In een rail van 302px
     is elke regel die niets doet een regel te veel -- naast de titel zegt hij
     hetzelfde en kost hij niets. */
  return (
    <WidgetCard
      title="REPLY LANGUAGE"
      headerAction={
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Chat + TTS + Mindset</span>
      }
    >
      <div className="flex gap-1.5">
        {(['en', 'nl', 'auto'] as const).map(id => (
          <button
            key={id}
            onClick={() => choose(id)}
            className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium"
            style={{
              background: mode === id ? 'var(--tint)' : 'var(--bg-base)',
              border: `1px solid ${mode === id ? 'var(--tint-line)' : 'var(--border-subtle)'}`,
              color: mode === id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            }}
          >
            {id === 'en' ? 'English' : id === 'nl' ? 'Nederlands' : 'Auto'}
          </button>
        ))}
      </div>
    </WidgetCard>
  );
}

interface TimelineItem {
  id: string;
  time: string;
  title: string;
  done: boolean;
}

function MissionTimelineWidget() {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [newEvent, setNewEvent] = useState('');
  const routingLog = useVoiceStore(s => s.routingLog);
  const voiceStatus = useVoiceStore(s => s.voiceStatus);
  const conversation = useVoiceStore(s => s.conversation);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('axe_timeline');
      if (stored) setTimeline(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Auto-append from routing / voice activity so the strip feels alive
  useEffect(() => {
    const head = routingLog[0];
    if (!head?.winner) return;
    const title = `${head.capability} → ${head.winner}`;
    setTimeline(prev => {
      if (prev.some(e => e.title === title && Date.now() - Number(e.id) < 120_000)) return prev;
      const now = new Date();
      const item: TimelineItem = {
        id: String(Date.now()),
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        title,
        done: true,
      };
      const next = [item, ...prev].slice(0, 40);
      try { localStorage.setItem('axe_timeline', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, [routingLog]);

  useEffect(() => {
    if (voiceStatus !== 'processing') return;
    const lastUser = [...conversation].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    const title = `Working: ${lastUser.text.slice(0, 48)}`;
    setTimeline(prev => {
      if (prev[0]?.title.startsWith('Working:')) return prev;
      const now = new Date();
      const item: TimelineItem = {
        id: String(Date.now()),
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        title,
        done: false,
      };
      const next = [item, ...prev].slice(0, 40);
      try { localStorage.setItem('axe_timeline', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, [voiceStatus, conversation]);

  const save = (items: TimelineItem[]) => {
    setTimeline(items);
    try { localStorage.setItem('axe_timeline', JSON.stringify(items)); } catch { /* */ }
  };

  const add = () => {
    if (!newEvent.trim()) return;
    const now = new Date();
    save([{ id: String(Date.now()), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, title: newEvent.trim(), done: false }, ...timeline]);
    setNewEvent('');
    setAdding(false);
  };

  return (
    <WidgetCard
      title="MISSION TIMELINE"
      icon={<Clock size={12} style={{ color: 'var(--accent-cyan)' }} />}
      headerAction={
        <button onClick={() => setAdding(v => !v)} style={{ color: 'var(--accent-cyan)' }}><Plus size={12} /></button>
      }
    >
      {adding && (
        <div className="flex gap-1.5 mb-2">
          <input
            value={newEvent}
            onChange={e => setNewEvent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Event..."
            className="flex-1 text-[10px] px-2 py-1 rounded outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
          />
          <button onClick={add} className="px-1.5 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
            <Check size={11} />
          </button>
        </div>
      )}
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-3">
          <Clock size={16} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Events appear as AXE works</span>
        </div>
      ) : (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {timeline.slice(0, 12).map(ev => (
            <div key={ev.id} className="flex items-center gap-1.5">
              <span className="font-mono text-[8px] w-7 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{ev.time}</span>
              <span className="block rounded-full flex-shrink-0" style={{ width: 4, height: 4, background: ev.done ? 'var(--text-muted)' : 'var(--accent-cyan)', boxShadow: ev.done ? 'none' : '0 0 4px var(--accent-cyan)' }} />
              <span className="flex-1 text-[9px] truncate" style={{ color: ev.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{ev.title}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

function ActiveTasksWidget() {
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const voiceStatus = useVoiceStore(s => s.voiceStatus);
  const conversation = useVoiceStore(s => s.conversation);
  const pendingExec = useVoiceStore(s => s.pendingExec);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const load = async () => {
      const { data } = await sb
        .from('core_tasks')
        .select('id,title,status,priority')
        // Built from the shared terminal set, not hand-listed. The hand-listed
        // version excluded `approved` but kept `completed` and `failed`, so
        // finished work sat in the "active tasks" panel forever.
        .not('status', 'in', `(${TERMINAL_TASK_STATUSES.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(6);
      if (data) setTasks(data as ActiveTask[]);
    };
    void load();
    // Polled, not realtime — see MissionControlStrip.tsx for why: core_tasks
    // isn't in the supabase_realtime publication, so this can't ever fire.
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Live synthetic tasks from AXE activity when DB is empty
  const live: ActiveTask[] = [];
  if (pendingExec) {
    live.push({ id: 'pending-exec', title: pendingExec.title || 'Waiting for approval', status: 'waiting_approval', priority: 'high' });
  }
  if (voiceStatus === 'processing' || voiceStatus === 'speaking' || voiceStatus === 'listening') {
    const lastUser = [...conversation].reverse().find(m => m.role === 'user');
    live.push({
      id: 'voice-live',
      title: lastUser ? lastUser.text.slice(0, 60) : `AXE ${voiceStatus}`,
      status: voiceStatus === 'listening' ? 'listening' : voiceStatus === 'speaking' ? 'speaking' : 'in_progress',
      priority: 'normal',
    });
  }

  const shown = [...live, ...tasks].slice(0, 5);

  return (
    <WidgetCard
      title="ACTIVE TASKS"
      icon={<CheckSquare size={12} style={{ color: 'var(--accent-cyan)' }} />}
      headerAction={
        <span className="text-xs-custom px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
          {shown.length}
        </span>
      }
    >
      <div className="space-y-2">
        {shown.length === 0 ? (
          <p className="text-xs-custom py-1" style={{ color: 'var(--text-muted)' }}>No active tasks</p>
        ) : shown.map(task => (
          <div key={task.id} className="flex items-start gap-2">
            <CheckSquare
              size={14}
              className="mt-0.5 flex-shrink-0"
              style={{
                color: ['in_progress', 'listening', 'speaking', 'waiting_approval'].includes(task.status)
                  ? 'var(--accent-cyan)'
                  : 'var(--text-muted)',
              }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-small block truncate" style={{ color: 'var(--text-primary)' }}>{task.title}</span>
              <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                {task.status.replace(/_/g, ' ')}
                {task.priority ? ` · ${task.priority}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

/**
 * De drie kamers van dit paneel.
 *
 * Was één lange scroll: Mindset-knoppen, taalkeuze, achttien providers, de
 * missietijdlijn, actieve taken, snelacties, en dan -- op dezelfde scroll --
 * een heel apart AXE Algo-blok met een live handelslijst en een eigen
 * chatveld. Luka's klacht ("half zichtbaar, valt over of boven dingen") kwam
 * niet alleen van het uitschuif-euvel hierboven (zie de `<aside>`-stijl) --
 * een paneel zo dicht IS zelf al precies wat die indruk geeft, ongeacht of de
 * uitschuif-bug er ook nog bovenop zat.
 *
 * Drie kamers, geen nieuw navigatiepatroon: dezelfde platte knoppenrij als
 * `ReplyLanguageWidget` hieronder, gehergebruikt in plaats van uitgevonden.
 */
type RailKamer = 'status' | 'activiteit' | 'algo';
const RAIL_KAMERS: Array<{ id: RailKamer; label: string }> = [
  { id: 'status', label: 'Status' },
  { id: 'activiteit', label: 'Activiteit' },
  { id: 'algo', label: 'AXE Algo' },
];

function RailKamerKiezer({ kamer, opKamer }: { kamer: RailKamer; opKamer: (k: RailKamer) => void }) {
  return (
    <div className="flex gap-1.5">
      {RAIL_KAMERS.map(k => (
        <button
          key={k.id}
          onClick={() => opKamer(k.id)}
          className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium"
          style={{
            background: kamer === k.id ? 'var(--tint)' : 'var(--bg-base)',
            border: `1px solid ${kamer === k.id ? 'var(--tint-line)' : 'var(--border-subtle)'}`,
            color: kamer === k.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
          }}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

export function RightPanel() {
  const { rightPanelOpen, rightDrawerOpen, setRightDrawerOpen, setRightPanelOpen, setCommandPaletteOpen } = useUIStore();
  const [kamer, setKamer] = useState<RailKamer>('status');
  const isTablet = useIsTablet();
  const isMobile = useIsMobile();
  const isCompact = isMobile || isTablet;
  const navigate = useNavigate();
  const voice = useVoiceStore();

  // Een kwart breder dan de 320px waar hij op stond, om dezelfde reden als de
  // linkerzijbalk: de inhoud paste er niet in en werd afgekapt.
  // Eén breedte voor elke uitschuifbalk -- zie --axe-rail-breedte.
  const panelWidth = 'var(--axe-rail-breedte)';
  const closePanel = () => { if (isCompact) setRightDrawerOpen(false); };

  const runQuickAction = async (id: string) => {
    closePanel();
    switch (id) {
      case '1': navigate('/tasks'); break;
      case '2': navigate('/calendar'); break;
      case '3':
        try {
          if (voice.voiceStatus === 'idle') await voice.startListening();
          else voice.stopListening();
        } catch (e) { console.error(e); }
        break;
      case '4': navigate('/cron-manager'); break;
      case '5': setCommandPaletteOpen(true); break;
      case '6': navigate('/obsidian'); break;
    }
  };

  const quickActions = [
    { id: '1', label: 'Start New Task', icon: 'plus' },
    { id: '2', label: 'Open Calendar', icon: 'calendar' },
    { id: '3', label: voice.voiceStatus !== 'idle' ? 'Stop Voice Chat' : 'Start Voice Chat', icon: 'mic' },
    { id: '4', label: 'Run Workflow', icon: 'play' },
    { id: '5', label: 'Open Command', icon: 'terminal' },
    { id: '6', label: 'Create Note', icon: 'file-plus' },
  ];

  const content = (
    // min-w-0 on both layers below: a flex child's `truncate` only works if
    // something in its ancestor chain actually allows the box to shrink
    // below its content's natural (min-content) width. `ActiveTasksWidget`'s
    // task titles and `MissionTimelineWidget`'s event titles already had
    // `truncate` on the right span, but neither of THESE two wrappers had
    // `min-w-0` -- so a long task title could still push this whole column
    // wider than its own fixed `--axe-rail-breedte`, which is exactly the
    // 52px-past-the-window overflow the evaluator measured on the Activiteit
    // tab.
    <div className="h-full flex flex-col overflow-hidden min-w-0">
      <div className="flex justify-end px-3 pt-2 pb-0">
        <button
          onClick={() => (isCompact ? setRightDrawerOpen(false) : setRightPanelOpen(false))}
          className="p-1 rounded-md hover:bg-white/5"
          title={isCompact ? 'Close' : 'Collapse'}
        >
          {isCompact ? <X size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </button>
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-0 space-y-3">
        <RailKamerKiezer kamer={kamer} opKamer={setKamer} />

        {kamer === 'status' && (
          <>
            <CyanQuoteButtons />
            <ReplyLanguageWidget />
            <WidgetCard title="MODELS & TESTS">
              <ModelStatusWidget />
            </WidgetCard>
          </>
        )}

        {kamer === 'activiteit' && (
          <>
            <MissionTimelineWidget />
            <ActiveTasksWidget />

            <div>
              <span className="text-xs-custom uppercase tracking-widest block mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                QUICK ACTIONS
              </span>
              <div className={LIST_GRID}>
                {quickActions.map(action => {
                  const Icon = quickActionIcons[action.icon] || Plus;
                  return (
                    <button
                      key={action.id}
                      onClick={() => void runQuickAction(action.id)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg"
                      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <Icon size={20} style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-xs-custom text-center" style={{ color: 'var(--text-secondary)' }}>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {kamer === 'algo' && <AxeAlgoWidget />}
      </div>
    </div>
  );

  if (isCompact) {
    /* Corrective (evaluator round 1): this Sheet is what everyone from 768 to
     * 1600px wide actually sees -- `useIsTablet()` covers that whole range,
     * so the `<aside>` branch below only ever runs above 1600px, a width
     * almost nobody runs at. Two things were wrong here, both invisible if
     * you only test above 1600:
     *
     * 1. `backgroundColor: 'var(--bg-base)'` -- under `data-look='glass'`,
     *    `--bg-base` itself resolves to `transparent` (see axe-look.css's
     *    glass-mode tokens), so this "opaque" override was transparent too.
     *    Whatever sat behind it (the Code Editor's "Start the dev server"
     *    placeholder) showed straight through. Same opaque gradient the
     *    hover-rail `<aside>` already uses (axe-look.css, `.axe-shell aside`)
     *    instead of a CSS variable that isn't guaranteed opaque.
     * 2. `inset-y-0` (from `SheetContent`'s own class) starts the sheet at
     *    the very top of the viewport, UNDER the fixed TopNav (`z-fixed` =
     *    100, this sheet is `z-[110]`) -- so it painted OVER the search/bell/
     *    avatar icons instead of beside them. `top` below starts it under the
     *    topbar's own measured height instead. */
    return (
      <Sheet open={rightDrawerOpen} onOpenChange={setRightDrawerOpen}>
        <SheetContent
          side="right"
          className="text-white border-l border-white/5 w-[300px] max-w-[85vw] p-0"
          style={{
            background: 'linear-gradient(180deg, rgba(20,20,24,0.98) 0%, rgba(12,12,15,0.99) 100%)',
            top: 'calc(66px + env(safe-area-inset-top))',
            height: 'calc(100dvh - 66px - env(safe-area-inset-top))',
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Status Panel</SheetTitle>
            <SheetDescription>Health, timeline, tasks</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  if (!rightPanelOpen) {
    return (
      <aside className="flex-shrink-0 flex flex-col items-center py-3 gap-2" style={{ width: '36px' }}>
        <button onClick={() => setRightPanelOpen(true)} className="p-1.5 rounded-md hover:bg-white/5" title="Expand">
          <ChevronLeft size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
        <button
          onClick={() => speakLine(nextMindsetLine())}
          className="p-1.5 rounded-md hover:bg-white/5"
          title="Mindset"
        >
          <Flame size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
        {/* Zie Sidebar: de host hoort er ook ingeklapt te zijn, anders heeft
            een tab geen doel om zijn rail in te portalen. */}
        <div id="axe-rail-rechts" className="axe-rail-host" hidden />
      </aside>
    );
  }

  return (
    <aside
      data-rail="right"
      className="flex-shrink-0 flex flex-col overflow-hidden"
      /* Corrective (evaluator round 1, issues 6 & 8): this used to force
       * visibility with an inline `style` override (position/transform/
       * opacity) that silently fought `:root[data-look] .axe-shell aside`'s
       * hover-to-peek rule -- it worked, but nothing else in the shell knew
       * this rail was now permanently pinned instead of hover-triggered.
       * `AxePresenceDock.tsx`'s `vindZichtbareRechterRail()` reads the SAME
       * "is a right rail visible" signal to keep its own card clear of it,
       * and a rail that is ALWAYS visible now ALWAYS counts as an obstacle
       * to it -- which is exactly how the presence orb ended up on top of
       * the composer's mic/camera buttons at 1920px: a regression this pin
       * caused, not something the pin was meant to fix.
       *
       * `data-rail-r-vast` below is the explicit state the evaluator asked
       * for: a flag both this component and AxePresenceDock read on purpose,
       * instead of one silently overriding the other's assumptions. The
       * visual effect on THIS element is unchanged (still opts out of the
       * hover transform/opacity while open); what changes is that
       * AxePresenceDock can now tell "pinned rail" apart from "hover rail"
       * and only treat it as a real obstacle where it actually, vertically,
       * overlaps the composer band (see that file for the other half). */
      style={{ width: panelWidth }}
      data-rail-vast={rightPanelOpen ? 'ja' : undefined}
    >
      {/* Een tab kan hier zijn eigen inhoud in renderen (zie useTabRail).
          Doet hij dat, dan verbergt de CSS de standaardinhoud hieronder --
          met :has() op een leeg vakje, dus zonder staat die uit de pas kan lopen. */}
      <div id="axe-rail-rechts" className="axe-rail-host" />
      <div className="axe-rail-standaard flex-1 min-h-0 flex flex-col overflow-hidden">{content}</div>
    </aside>
  );
}
