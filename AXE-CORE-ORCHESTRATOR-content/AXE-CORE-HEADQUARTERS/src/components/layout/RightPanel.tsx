import { useEffect, useState } from 'react';
import {
  Plus, Calendar, Mic, Play, Terminal, FilePlus,
  Briefcase, AlertTriangle, Lightbulb, Activity, Target, Zap,
  MessageSquare, Trash2, CheckSquare, Clock, Cpu, Check, X,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { useIsTablet } from '@/hooks/use-tablet';
import { useIsMobile } from '@/hooks/use-mobile';
import { getSupabase } from '@/lib/supabaseClient';
import { StatusBadge } from '@/components/widgets/StatusBadge';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { AICoreLogs } from '@/components/axe-core/AICoreLogs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { loadSetting } from '@/services/userSettingsService';

interface Notification {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
}

interface TimelineItem {
  id: string;
  time: string;
  title: string;
  done: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  warn: AlertTriangle,
  alert: AlertTriangle,
  briefing: Briefcase,
  tip: Lightbulb,
  task: Target,
  live: Activity,
  default: Zap,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const quickActionIcons: Record<string, React.ComponentType<any>> = {
  plus: Plus,
  calendar: Calendar,
  mic: Mic,
  play: Play,
  terminal: Terminal,
  'file-plus': FilePlus,
};

const quickActions = [
  { id: '1', label: 'Start New Task', icon: 'plus' },
  { id: '2', label: 'Open Calendar', icon: 'calendar' },
  { id: '3', label: 'Start Voice Chat', icon: 'mic' },
  { id: '4', label: 'Run Workflow', icon: 'play' },
  { id: '5', label: 'Open Command', icon: 'terminal' },
  { id: '6', label: 'Create Note', icon: 'file-plus' },
];

/* ── AI Core System widget ─────────────────────────────────────────────── */
function AICoreSystem() {
  const [supaConnected, setSupaConnected] = useState(false);
  const [llmCount, setLlmCount] = useState(0);

  useEffect(() => {
    const check = async () => {
      try {
        const url = await loadSetting<string>('axe_supa_url', '');
        setSupaConnected(!!url);
      } catch { /* ignore */ }
    };
    void check();
    try {
      const stored = localStorage.getItem('axe_llm_connections');
      if (stored) {
        const parsed = JSON.parse(stored);
        setLlmCount(Object.keys(parsed).length);
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="space-y-1.5">
      {[
        { icon: Activity, label: 'Status', val: 'Online', ok: true },
        { icon: Cpu, label: 'Models', val: `${llmCount} active`, ok: llmCount > 0 },
        { icon: Mic, label: 'Voice', val: 'Piper TTS', ok: true },
        { icon: Zap, label: 'Memory', val: supaConnected ? 'Linked' : '—', ok: supaConnected },
      ].map(({ icon: Icon, label, val, ok }) => (
        <div key={label} className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon size={11} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
          <span className="text-[11px] font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Mission Timeline widget ─────────────────────────────────────────── */
function MissionTimeline() {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [newEvent, setNewEvent] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('axe_timeline');
      if (stored) setTimeline(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const save = (items: TimelineItem[]) => {
    setTimeline(items);
    localStorage.setItem('axe_timeline', JSON.stringify(items));
  };

  const add = () => {
    if (!newEvent.trim()) return;
    const now = new Date();
    const item: TimelineItem = {
      id: Date.now().toString(),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      title: newEvent.trim(),
      done: false,
    };
    save([...timeline, item]);
    setNewEvent('');
    setAdding(false);
  };

  const toggle = (id: string) => {
    save(timeline.map(e => e.id === id ? { ...e, done: !e.done } : e));
  };

  const remove = (id: string) => {
    save(timeline.filter(e => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>MISSION TIMELINE</span>
        <button onClick={() => setAdding(v => !v)} style={{ color: 'var(--accent-blue)', fontSize: '0.65rem' }}>
          <Plus size={11} />
        </button>
      </div>
      {adding && (
        <div className="flex gap-1.5 mb-2">
          <input
            value={newEvent}
            onChange={e => setNewEvent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Event..."
            className="flex-1 text-[10px] px-2 py-1 rounded"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
          />
          <button onClick={add} className="px-1.5 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
            <Check size={11} />
          </button>
        </div>
      )}
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-2">
          <Clock size={16} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>No events</span>
        </div>
      ) : (
        <div className="space-y-1 max-h-24 overflow-y-auto">
          {timeline.map(ev => (
            <div key={ev.id} className="flex items-center gap-1.5 group">
              <span className="font-mono-data text-[8px] w-6 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{ev.time}</span>
              <button onClick={() => toggle(ev.id)} className="flex-shrink-0">
                <span className="block rounded-full" style={{ width: 4, height: 4, background: ev.done ? 'var(--text-muted)' : 'var(--accent-cyan)', boxShadow: ev.done ? 'none' : '0 0 4px var(--accent-cyan)' }} />
              </button>
              <span className="flex-1 text-[9px] truncate" style={{ color: ev.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: ev.done ? 'line-through' : 'none' }}>{ev.title}</span>
              <button onClick={() => remove(ev.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={9} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── RightPanel ──────────────────────────────────────────────────────── */
export function RightPanel() {
  const { rightPanelOpen, rightDrawerOpen, setRightDrawerOpen } = useUIStore();
  const isTablet = useIsTablet();
  const isMobile = useIsMobile();
  const voice = useVoiceStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from('core_notifications')
      .select('id,type,message,created_at')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => { if (data) setNotifications(data as Notification[]); });
    sb.from('core_tasks')
      .select('id,title,status,priority')
      .in('status', ['pending', 'queued', 'in_progress', 'waiting_approval'])
      .limit(4)
      .then(({ data }) => { if (data) setTasks(data as Task[]); });
  }, []);

  const panelWidth = isTablet ? 280 : 320;

  const content = (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#000000' }}>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* AI Core System */}
        <WidgetCard title="AI CORE SYSTEM">
          <AICoreSystem />
        </WidgetCard>

        {/* Mission Timeline */}
        <WidgetCard title="MISSION TIMELINE">
          <MissionTimeline />
        </WidgetCard>

        {/* AI Core Logs */}
        <WidgetCard title="AI CORE LOGS">
          <div style={{ maxHeight: 200 }}>
            <AICoreLogs />
          </div>
        </WidgetCard>

        {/* Conversation */}
        {voice.conversation.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs-custom uppercase tracking-widest flex items-center gap-1.5"
                style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
              >
                <MessageSquare size={12} />
                CONVERSATION
              </span>
              <button
                onClick={() => voice.clearConversation()}
                style={{ color: 'var(--text-muted)' }}
                className="transition-colors hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div
              className="rounded-lg p-2.5 space-y-2"
              style={{
                backgroundColor: '#0A0A0A',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {voice.conversation.slice(-5).map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor:
                        msg.role === 'user'
                          ? 'rgba(34,211,238,0.1)'
                          : 'rgba(59,130,246,0.1)',
                      fontSize: '9px',
                      fontWeight: 700,
                      color:
                        msg.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-blue)',
                    }}
                  >
                    {msg.role === 'user' ? 'U' : 'A'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-xs-custom font-semibold"
                        style={{ color: msg.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-blue)' }}
                      >
                        {msg.role === 'user' ? 'You' : 'AXE'}
                      </span>
                      {msg.role === 'axe' && msg.provider && (
                        <span className="text-[8px] px-1 py-0.5 rounded font-mono"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          {msg.provider}{msg.model ? ` · ${msg.model.split('/').pop()?.split(':')[0]}` : ''}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xs-custom leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs-custom uppercase tracking-widest"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
          >
            LIVE INTELLIGENCE FEED
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <LiveIndicator size={6} color="var(--success)" />
              <span className="text-xs-custom" style={{ color: 'var(--success)' }}>
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Intelligence Feed */}
        <div className="space-y-1">
          {notifications.length === 0 ? (
            <p className="text-xs-custom py-2" style={{ color: 'var(--text-muted)' }}>No notifications yet</p>
          ) : notifications.map((item) => {
            const typeKey = (item.type ?? 'default').toLowerCase();
            const Icon = TYPE_ICONS[typeKey] ?? Zap;
            const iconColor =
              typeKey === 'warn' || typeKey === 'alert' ? 'var(--warning)'
              : typeKey === 'briefing' ? 'var(--accent-blue)'
              : typeKey === 'tip' ? 'var(--accent-cyan)'
              : 'var(--success)';
            const ts = new Date(item.created_at);
            const label = `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`;
            return (
              <div
                key={item.id}
                className="flex items-start gap-2.5 p-2 rounded-lg transition-colors duration-fast cursor-pointer"
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#111111'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Icon size={16} style={{ color: iconColor, marginTop: '2px', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <span className="text-small block truncate" style={{ color: '#FFFFFF' }}>
                    {item.message}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <StatusBadge
                      variant={typeKey === 'warn' || typeKey === 'alert' ? 'warning' : typeKey === 'live' ? 'active' : 'standby'}
                      label={item.type?.toUpperCase()}
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
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

        {/* Active Tasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs-custom uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
            >
              ACTIVE TASKS
            </span>
            <span
              className="text-xs-custom px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#1A1A1A', color: 'var(--text-secondary)' }}
            >
              {tasks.length}
            </span>
          </div>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-xs-custom py-1" style={{ color: 'var(--text-muted)' }}>No active tasks</p>
            ) : tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2">
                <CheckSquare size={14} className="mt-0.5 flex-shrink-0" style={{ color: task.status === 'in_progress' ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                <div className="flex-1 min-w-0">
                  <span className="text-small block truncate" style={{ color: '#FFFFFF' }}>
                    {task.title}
                  </span>
                  <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                    {task.status.replace(/_/g, ' ')} · {task.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={rightDrawerOpen} onOpenChange={setRightDrawerOpen}>
        <SheetContent
          side="right"
          className="bg-black text-white border-l border-white/5 w-[280px] max-w-[85vw] p-0"
          style={{ backgroundColor: '#000000' }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Status Panel</SheetTitle>
            <SheetDescription>AI Core status, timeline, logs, and notifications</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  if (!rightPanelOpen) return null;

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        width: panelWidth,
        backgroundColor: '#080808',
        borderLeft: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {content}
    </aside>
  );
}
