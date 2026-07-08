import { useEffect, useState } from 'react';
import {
  Plus, Calendar, Mic, Play, Terminal, FilePlus,
  Briefcase, AlertTriangle, Lightbulb, Activity, Target, Zap,
  MessageSquare, Trash2, CheckSquare,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { getSupabase } from '@/lib/supabaseClient';
import { StatusBadge } from '@/components/widgets/StatusBadge';
import { LiveIndicator } from '@/components/shared/LiveIndicator';

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

export function RightPanel() {
  const { rightPanelOpen } = useUIStore();
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

  if (!rightPanelOpen) return null;

  return (
    <aside
      className="fixed right-0 top-[48px] bottom-[56px] z-sticky overflow-y-auto edge-glow"
      style={{
        width: '320px',
        backgroundColor: '#080808',
        borderLeft: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div className="p-4 space-y-5">
        {/* Conversation Widget */}
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

        {/* Intelligence Feed — live from core_notifications */}
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
            const label = `${ts.getHours().toString().padStart(2,'0')}:${ts.getMinutes().toString().padStart(2,'0')}`;
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

        {/* Active Tasks — live from core_tasks */}
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
    </aside>
  );
}
