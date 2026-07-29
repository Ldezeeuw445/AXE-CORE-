import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Calendar, Mic, Play, Terminal, FilePlus,
  Activity, Zap, Cpu, CheckSquare,
  ChevronRight,
  ChevronLeft,
  X,
  Flame,
} from 'lucide-react';
import { useUIStore } from '@/presentation/store/uiStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useIsTablet } from '@/presentation/hooks/use-tablet';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { SmartRingWidget } from '@/presentation/components/widgets/SmartRingWidget';
import { HabitTrackerWidget } from '@/presentation/components/widgets/HabitTrackerWidget';
import { SmartHomeWidget } from '@/presentation/components/widgets/SmartHomeWidget';
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
import { speakWithFishAudio, isFishAudioConfigured, stopFishAudio } from '@/infrastructure/gateways/fishAudioService';
import { speakWithElevenLabs, stopTTS, speakWithBrowser } from '@/infrastructure/gateways/elevenLabsService';

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
  priority: string;
}

function speakLine(text: string, onDone?: () => void): void {
  stopTTS();
  stopFishAudio();
  let ttsProvider: 'fish' | 'elevenlabs' | 'browser' = 'fish';
  try {
    ttsProvider = (localStorage.getItem('axe_tts_provider') as typeof ttsProvider) || 'fish';
  } catch { /* ignore */ }
  if (ttsProvider === 'fish' && isFishAudioConfigured()) {
    void speakWithFishAudio(text, onDone, () => speakWithBrowser(text, onDone));
    return;
  }
  if (ttsProvider === 'elevenlabs') {
    void speakWithElevenLabs(text, onDone, onDone, () => speakWithBrowser(text, onDone));
    return;
  }
  speakWithBrowser(text, onDone);
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
      setHint('Geen AXE-quotes — voeg toe in Settings → AXE Quotes');
      setActive(null);
      return;
    }
    setActive('axe');
    setHint(line);
    speakLine(line, () => setActive(null));
  };

  const cyanBtn = (
    id: 'mindset' | 'axe',
    label: string,
    Icon: typeof Flame,
    onClick: () => void,
  ) => (
    <button
      key={id}
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs-custom font-semibold transition-all"
      style={{
        background: active === id ? 'rgba(34,211,238,0.22)' : 'rgba(34,211,238,0.1)',
        border: '1px solid rgba(34,211,238,0.4)',
        color: 'var(--accent-cyan)',
      }}
    >
      <Icon size={14} />
      {active === id ? '…' : label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {cyanBtn('mindset', 'Mindset', Flame, fireMindset)}
        {cyanBtn('axe', 'AXE', Zap, fireAxe)}
      </div>
      {hint && (
        <p className="text-[11px] leading-snug px-0.5" style={{ color: 'var(--text-secondary)' }}>
          {hint.startsWith('Geen') ? hint : `“${hint}”`}
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

  const btn = (id: ReplyLanguage, label: string) => (
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
      {label}
    </button>
  );

  return (
    <WidgetCard title="REPLY LANGUAGE">
      <div className="flex gap-1.5">
        {btn('en', 'English')}
        {btn('nl', 'Nederlands')}
        {btn('auto', 'Auto')}
      </div>
    </WidgetCard>
  );
}

function ActiveTasksWidget() {
  const [tasks, setTasks] = useState<ActiveTask[]>([]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('core_tasks')
      .select('id,title,status,priority')
      .in('status', ['pending', 'queued', 'in_progress', 'waiting_approval'])
      .limit(4)
      .then(({ data }) => { if (data) setTasks(data as ActiveTask[]); });
  }, []);

  return (
    <WidgetCard
      title="ACTIVE TASKS"
      icon={<CheckSquare size={12} style={{ color: 'var(--accent-cyan)' }} />}
      headerAction={
        <span className="text-xs-custom px-1.5 py-0.5 rounded" style={{ backgroundColor: '#1A1A1A', color: 'var(--text-secondary)' }}>
          {tasks.length}
        </span>
      }
    >
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-xs-custom py-1" style={{ color: 'var(--text-muted)' }}>No active tasks</p>
        ) : tasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2">
            <CheckSquare size={14} className="mt-0.5 flex-shrink-0" style={{ color: task.status === 'in_progress' ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-small block truncate" style={{ color: '#FFFFFF' }}>{task.title}</span>
              <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                {task.status.replace(/_/g, ' ')} · {task.priority}
              </span>
            </div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

function AICoreSystem() {
  const [supaOk, setSupaOk] = useState<boolean | null>(null);
  const [elevenOk, setElevenOk] = useState<boolean>(false);
  const [llmCount, setLlmCount] = useState(0);
  const voice = useVoiceStore();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('axe_llm_connections');
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, { key?: string }>;
        const configured = Object.values(parsed).filter(c => c?.key && c.key.length > 4).length;
        setLlmCount(configured);
      }
    } catch { /* ignore */ }

    const elKey = import.meta.env.VITE_ELEVENLABS_API_KEY ?? '';
    setElevenOk(elKey.length > 8);

    const pingSupabase = async () => {
      try {
        const sb = getSupabase();
        if (!sb) { setSupaOk(false); return; }
        const { error } = await sb.auth.getSession();
        setSupaOk(!error);
      } catch { setSupaOk(false); }
    };
    void pingSupabase();
  }, []);

  const voiceLabel = voice.isGeminiLive
    ? 'Gemini Live'
    : elevenOk
    ? 'ElevenLabs'
    : 'Browser TTS';

  const msgCount = voice.conversation.length;
  const memVal = supaOk === null ? 'Checking…' : supaOk ? `Supabase · ${msgCount} msgs` : '— offline';

  return (
    <div className="space-y-1.5">
      {[
        { icon: Activity, label: 'Status',  val: llmCount > 0 ? 'Online' : 'No AI',    ok: llmCount > 0 },
        { icon: Cpu,      label: 'Models',  val: `${llmCount} configured`,              ok: llmCount > 0 },
        { icon: Mic,      label: 'Voice',   val: voiceLabel,                            ok: voice.isGeminiLive || elevenOk },
        { icon: Zap,      label: 'Memory',  val: memVal,                                ok: supaOk === true },
      ].map(({ icon: Icon, label, val, ok }) => (
        <div key={label} className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon size={11} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ok ? 'var(--success)' : supaOk === null && label === 'Memory' ? 'var(--warning)' : 'rgba(255,255,255,0.15)' }} />
            <span className="text-[11px] font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
          </div>
        </div>
      ))}
    </div>
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
          onClick={() => isCompact ? setRightDrawerOpen(false) : setRightPanelOpen(false)}
          className="p-1 rounded-md transition-colors hover:bg-white/5"
          title={isCompact ? 'Close panel' : 'Collapse panel'}
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

        <WidgetCard title="DAILY HABITS">
          <HabitTrackerWidget />
        </WidgetCard>

        <WidgetCard title="SMART HOME">
          <SmartHomeWidget />
        </WidgetCard>

        <WidgetCard title="AI CORE SYSTEM">
          <AICoreSystem />
        </WidgetCard>

        <ActiveTasksWidget />

        <div>
          <span
            className="text-xs-custom uppercase tracking-widest block mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
          >
            QUICK ACTIONS
          </span>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action) => {
              const Icon = quickActionIcons[action.icon] || Plus;
              return (
                <button
                  key={action.id}
                  onClick={() => void runQuickAction(action.id)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg transition-all duration-fast"
                  style={{
                    backgroundColor: '#0A0A0A',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1A1A1A';
                    e.currentTarget.style.borderColor = 'var(--border-active)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#0A0A0A';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Icon size={20} style={{ color: 'var(--text-secondary)' }} />
                  <span
                    className="text-xs-custom text-center"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {action.label}
                  </span>
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
        <SheetContent
          side="right"
          className="bg-black text-white border-l border-white/5 w-[280px] max-w-[85vw] p-0"
          style={{ backgroundColor: '#000000' }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Status Panel</SheetTitle>
            <SheetDescription>Mindset, AXE quotes, health, and quick actions</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  if (!rightPanelOpen) {
    return (
      <aside
        className="flex-shrink-0 flex flex-col items-center py-3 gap-2"
        style={{ width: '36px' }}
      >
        <button
          onClick={() => setRightPanelOpen(true)}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5"
          title="Expand panel"
        >
          <ChevronLeft size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
        <button
          onClick={() => {
            const line = nextMindsetLine();
            speakLine(line);
          }}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5"
          title="Mindset"
        >
          <Flame size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
        <button
          onClick={() => {
            const line = nextAxeLine();
            if (line) speakLine(line);
            else setRightPanelOpen(true);
          }}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5"
          title="AXE quotes"
        >
          <Zap size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{ width: panelWidth }}
    >
      {content}
    </aside>
  );
}
