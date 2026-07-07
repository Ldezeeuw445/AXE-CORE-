import {
  Plus, Calendar, Mic, Play, Terminal, FilePlus,
  Briefcase, AlertTriangle, Lightbulb, Activity, Target, Zap,
  MessageSquare, Trash2,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { intelligenceFeed, activeTasks, systemMetrics } from '@/lib/mockData';
import { StatusBadge } from '@/components/widgets/StatusBadge';
import { ProgressRing } from '@/components/widgets/ProgressRing';
import { LiveIndicator } from '@/components/shared/LiveIndicator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const feedIcons: Record<string, React.ComponentType<any>> = {
  briefcase: Briefcase,
  'alert-triangle': AlertTriangle,
  lightbulb: Lightbulb,
  activity: Activity,
  target: Target,
  zap: Zap,
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
                  <div className="min-w-0">
                    <span
                      className="text-xs-custom font-semibold"
                      style={{
                        color:
                          msg.role === 'user'
                            ? 'var(--accent-cyan)'
                            : 'var(--accent-blue)',
                      }}
                    >
                      {msg.role === 'user' ? 'You' : 'AXE'}
                    </span>
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
          {intelligenceFeed.slice(0, 6).map((item) => {
            const Icon = feedIcons[item.icon] || Activity;
            const iconColor =
              item.type === 'MEETING'
                ? 'var(--accent-blue)'
                : item.type === 'WARN'
                  ? 'var(--warning)'
                  : item.type === 'TIP'
                    ? 'var(--accent-cyan)'
                    : item.type === 'FOCUS'
                      ? 'var(--accent-ice)'
                      : 'var(--success)';

            return (
              <div
                key={item.id}
                className="flex items-start gap-2.5 p-2 rounded-lg transition-colors duration-fast cursor-pointer"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#111111';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon size={16} style={{ color: iconColor, marginTop: '2px', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-small truncate" style={{ color: '#FFFFFF' }}>
                      {item.title}
                    </span>
                  </div>
                  <span
                    className="text-xs-custom block truncate"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {item.description}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                      {item.timestamp}
                    </span>
                    <StatusBadge
                      variant={
                        item.type === 'WARN'
                          ? 'warning'
                          : item.type === 'MEETING'
                            ? 'online'
                            : item.type === 'LIVE'
                              ? 'active'
                              : 'standby'
                      }
                      label={item.type}
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
              {activeTasks.filter((t) => !t.completed).length}
            </span>
          </div>
          <div className="space-y-2">
            {activeTasks.slice(0, 4).map((task) => (
              <div key={task.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={task.completed}
                  readOnly
                  className="rounded"
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <div className="flex-1 min-w-0">
                  <span
                    className="text-small block truncate"
                    style={{
                      color: task.completed ? 'var(--text-muted)' : '#FFFFFF',
                      textDecoration: task.completed ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </span>
                  <div
                    className="h-1 rounded-full mt-1"
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-slow"
                      style={{
                        width: `${task.progress}%`,
                        backgroundColor: task.completed ? 'var(--success)' : 'var(--accent-cyan)',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div>
          <span
            className="text-xs-custom uppercase tracking-widest block mb-3"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
          >
            SYSTEM HEALTH
          </span>
          <div className="flex justify-around">
            <ProgressRing value={systemMetrics.cpu} label="CPU" size="sm" />
            <ProgressRing value={systemMetrics.ram} label="RAM" size="sm" />
            <ProgressRing value={systemMetrics.disk} label="Disk" size="sm" />
          </div>
        </div>
      </div>
    </aside>
  );
}
