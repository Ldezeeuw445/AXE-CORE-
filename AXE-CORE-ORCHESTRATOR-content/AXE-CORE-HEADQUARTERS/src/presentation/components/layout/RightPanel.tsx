import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Calendar, Mic, Play, Terminal, FilePlus,
  Activity, Zap, Cpu,
  ChevronRight,
  ChevronLeft,
  X,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const quickActionIcons: Record<string, React.ComponentType<any>> = {
  plus: Plus,
  calendar: Calendar,
  mic: Mic,
  play: Play,
  terminal: Terminal,
  'file-plus': FilePlus,
};

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
        {/* Luka's Health (smart ring / Apple Health) — top of right panel, above AI CORE */}
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
            <SheetDescription>Health, habits, AI Core status, and quick actions</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  if (!rightPanelOpen) {
    return (
      <aside
        className="flex-shrink-0 flex flex-col items-center py-3"
        style={{ width: '36px' }}
      >
        <button
          onClick={() => setRightPanelOpen(true)}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5"
          title="Expand panel"
        >
          <ChevronLeft size={14} style={{ color: 'var(--accent-cyan)' }} />
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
