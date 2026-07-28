import { useEffect, useState } from 'react';
import {
  Zap, Activity, Globe, Code, FileCode, Bot, Wrench, Search, Braces, ChevronLeft, ChevronRight, X,
  AlertTriangle, Lightbulb, Target, MessageSquare, Trash2, CheckSquare, Clock, Check, Plus,
} from 'lucide-react';
import { useUIStore } from '@/presentation/store/uiStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useIsTablet } from '@/presentation/hooks/use-tablet';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { StatusBadge } from '@/presentation/components/widgets/StatusBadge';
import { LiveIndicator } from '@/presentation/components/shared/LiveIndicator';
import { SmartHomeWidget } from '@/presentation/components/widgets/SmartHomeWidget';
import { BrowserPanel } from '@/presentation/components/axe-core/BrowserPanel';
import { CodeAgentPanel } from '@/presentation/components/axe-core/CodeAgentPanel';
import { KimiToolsPanel } from '@/presentation/components/axe-core/KimiToolsPanel';
import { AICoreLogs } from '@/presentation/components/axe-core/AICoreLogs';
import { HUD_BASE_BG } from '@/presentation/styles/hudBackground';

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
  briefing: Bot,
  tip: Lightbulb,
  task: Target,
  live: Activity,
  default: Zap,
};

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
        <button onClick={() => setAdding(v => !v)} style={{ color: 'var(--accent-blue)' }}>
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

export function Sidebar() {
  const { leftDrawerOpen, setLeftDrawerOpen, leftPanelOpen, toggleLeftPanel } = useUIStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isCompact = isMobile || isTablet;
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

  const content = (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: HUD_BASE_BG }}>
      {/* Header with toggle button */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--text-primary)' }}>
            Tools
          </span>
        </div>
        {/* Close/collapse — the drawer's own default close button is an
            unstyled Radix default with no explicit color, easy to miss
            against this dark theme, so give the compact/drawer case an
            equally visible affordance instead of relying on it alone. */}
        {isCompact ? (
          <button
            onClick={() => setLeftDrawerOpen(false)}
            className="p-1 rounded-md transition-colors hover:bg-white/5"
            title="Close panel"
          >
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        ) : (
          <button
            onClick={toggleLeftPanel}
            className="p-1 rounded-md transition-colors hover:bg-white/5"
            title={leftPanelOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {leftPanelOpen ? (
              <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-0 space-y-2">
        <WidgetCard title="BROWSER" icon={<Globe size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <BrowserPanel />
        </WidgetCard>

        <WidgetCard title="CODE AGENT" icon={<Code size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <CodeAgentPanel />
        </WidgetCard>

        <WidgetCard title="KIMI TOOLS" icon={<Braces size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <KimiToolsPanel />
        </WidgetCard>

        <WidgetCard title="SMART HOME" icon={<Bot size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <SmartHomeWidget />
        </WidgetCard>

        <WidgetCard title="MISSION TIMELINE" icon={<Clock size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <MissionTimeline />
        </WidgetCard>

        <WidgetCard title="AI CORE LOGS" icon={<FileCode size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <div style={{ maxHeight: 200 }}>
            <AICoreLogs />
          </div>
        </WidgetCard>

        {voice.conversation.length > 0 && (
          <WidgetCard title="CONVERSATION" icon={<MessageSquare size={12} style={{ color: 'var(--accent-cyan)' }} />}
            headerAction={
              <button onClick={() => voice.clearConversation()} style={{ color: 'var(--text-muted)' }} className="transition-colors hover:text-red-400">
                <Trash2 size={12} />
              </button>
            }
          >
            <div className="space-y-2">
              {voice.conversation.slice(-5).map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor: msg.role === 'user' ? 'rgba(34,211,238,0.1)' : 'rgba(59,130,246,0.1)',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: msg.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-blue)',
                    }}
                  >
                    {msg.role === 'user' ? 'U' : 'A'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs-custom font-semibold" style={{ color: msg.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-blue)' }}>
                        {msg.role === 'user' ? 'You' : 'AXE'}
                      </span>
                      {msg.role === 'axe' && msg.provider && (
                        <span className="text-[8px] px-1 py-0.5 rounded font-mono"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          {msg.provider}{msg.model ? ` · ${msg.model.split('/').pop()?.split(':')[0]}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs-custom leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </WidgetCard>
        )}

        <WidgetCard
          title="LIVE INTELLIGENCE FEED"
          icon={<Search size={12} style={{ color: 'var(--accent-cyan)' }} />}
          headerAction={
            notifications.length > 0 ? (
              <div className="flex items-center gap-1">
                <LiveIndicator size={6} color="var(--success)" />
                <span className="text-xs-custom" style={{ color: 'var(--success)' }}>LIVE</span>
              </div>
            ) : (
              <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>NO DATA</span>
            )
          }
        >
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
                    <span className="text-small block truncate" style={{ color: '#FFFFFF' }}>{item.message}</span>
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
        </WidgetCard>

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
      </div>
    </div>
  );

  if (isCompact) {
    return (
      <Sheet open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen}>
        <SheetContent
          side="left"
          className="bg-black text-white border-r border-white/5 w-[280px] max-w-[85vw] p-0"
          style={{ backgroundColor: '#000000' }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Tools</SheetTitle>
            <SheetDescription>Browser, Code Agent, Kimi Tools, Smart Home, and system feeds</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: collapsible sidebar
  if (!leftPanelOpen) {
    return (
      <aside
        className="flex-shrink-0 flex flex-col items-center py-3"
        style={{
          width: '36px',
          backgroundColor: '#000000',
          borderRight: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <button
          onClick={toggleLeftPanel}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5 mb-2"
          title="Expand sidebar"
        >
          <ChevronRight size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
        <div className="w-px h-4 bg-white/10 mb-2" />
        <div className="flex flex-col items-center gap-3">
          <span title="Browser" className="flex"><Globe size={14} style={{ color: 'var(--text-muted)' }} /></span>
          <span title="Code Agent" className="flex"><Code size={14} style={{ color: 'var(--text-muted)' }} /></span>
          <span title="Kimi Tools" className="flex"><Braces size={14} style={{ color: 'var(--text-muted)' }} /></span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        width: '240px',
        backgroundColor: '#000000',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {content}
    </aside>
  );
}
