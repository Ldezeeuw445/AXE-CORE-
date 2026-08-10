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
import { SmartRingWidget } from '@/presentation/components/widgets/SmartRingWidget';
import { ModelStatusWidget } from '@/presentation/components/widgets/ModelStatusWidget';
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
            background: active === 'mindset' ? 'rgba(34,211,238,0.22)' : 'rgba(34,211,238,0.1)',
            border: '1px solid rgba(34,211,238,0.4)',
            color: 'var(--accent-cyan)',
          }}
        >
          <Flame size={14} /> {active === 'mindset' ? '…' : 'Mindset'}
        </button>
        <button
          onClick={fireAxe}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs-custom font-semibold"
          style={{
            background: active === 'axe' ? 'rgba(34,211,238,0.22)' : 'rgba(34,211,238,0.1)',
            border: '1px solid rgba(34,211,238,0.4)',
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
  return (
    <WidgetCard title="REPLY LANGUAGE">
      <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Chat + TTS + Mindset</p>
      <div className="flex gap-1.5">
        {(['en', 'nl', 'auto'] as const).map(id => (
          <button
            key={id}
            onClick={() => choose(id)}
            className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium"
            style={{
              background: mode === id ? 'rgba(34,211,238,0.12)' : 'var(--bg-base)',
              border: `1px solid ${mode === id ? 'rgba(34,211,238,0.35)' : 'var(--border-subtle)'}`,
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
        .not('status', 'in', '(done,approved,rejected,cancelled)')
        .order('created_at', { ascending: false })
        .limit(6);
      if (data) setTasks(data as ActiveTask[]);
    };
    void load();
    const channel = sb
      .channel('active_tasks_widget')
      .on('postgres_changes' as never, { event: '*', schema: 'public', table: 'core_tasks' }, () => { void load(); })
      .subscribe();
    return () => { sb.removeChannel(channel); };
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
        <span className="text-xs-custom px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1A1A1A', color: 'var(--text-secondary)' }}>
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
              <span className="text-small block truncate" style={{ color: '#FFFFFF' }}>{task.title}</span>
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

export function RightPanel() {
  const { rightPanelOpen, rightDrawerOpen, setRightDrawerOpen, setRightPanelOpen, setCommandPaletteOpen } = useUIStore();
  const isTablet = useIsTablet();
  const isMobile = useIsMobile();
  const isCompact = isMobile || isTablet;
  const navigate = useNavigate();
  const voice = useVoiceStore();

  const panelWidth = 320;
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
    { id: '3', label: voice.voiceStatus === 'listening' ? 'Stop Voice Chat' : 'Start Voice Chat', icon: 'mic' },
    { id: '4', label: 'Run Workflow', icon: 'play' },
    { id: '5', label: 'Open Command', icon: 'terminal' },
    { id: '6', label: 'Create Note', icon: 'file-plus' },
  ];

  const content = (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex justify-end px-3 pt-2 pb-0">
        <button
          onClick={() => (isCompact ? setRightDrawerOpen(false) : setRightPanelOpen(false))}
          className="p-1 rounded-md hover:bg-white/5"
          title={isCompact ? 'Close' : 'Collapse'}
        >
          {isCompact ? <X size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-0 space-y-3">
        <CyanQuoteButtons />
        <ReplyLanguageWidget />

        <WidgetCard title="LUKA'S HEALTH">
          <SmartRingWidget />
        </WidgetCard>

        <WidgetCard title="MODELS & TESTS">
          <ModelStatusWidget />
        </WidgetCard>

        <MissionTimelineWidget />

        <ActiveTasksWidget />

        <div>
          <span className="text-xs-custom uppercase tracking-widest block mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            QUICK ACTIONS
          </span>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map(action => {
              const Icon = quickActionIcons[action.icon] || Plus;
              return (
                <button
                  key={action.id}
                  onClick={() => void runQuickAction(action.id)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg"
                  style={{ backgroundColor: '#0A0A0A', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <Icon size={20} style={{ color: 'var(--text-secondary)' }} />
                  <span className="text-xs-custom text-center" style={{ color: 'var(--text-secondary)' }}>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (isCompact) {
    return (
      <Sheet open={rightDrawerOpen} onOpenChange={setRightDrawerOpen}>
        <SheetContent side="right" className="bg-black text-white border-l border-white/5 w-[280px] max-w-[85vw] p-0" style={{ backgroundColor: '#000000' }}>
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
      </aside>
    );
  }

  return (
    <aside className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: panelWidth }}>
      {content}
    </aside>
  );
}
