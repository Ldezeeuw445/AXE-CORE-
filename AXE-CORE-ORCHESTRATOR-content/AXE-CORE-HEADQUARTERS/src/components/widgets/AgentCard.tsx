import { StatusBadge } from './StatusBadge';
import type { Agent } from '@/lib/mockData';
import { MiniChart } from './MiniChart';

interface AgentCardProps {
  agent: Agent;
  compact?: boolean;
}

export function AgentCard({ agent, compact = false }: AgentCardProps) {
  if (compact) {
    return (
      <div
        className="flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-normal cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          minWidth: '100px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-active)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(34,211,238,0.06)';
          e.currentTarget.style.transform = 'translateY(-3px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div
          className="rounded-full flex items-center justify-center text-xs font-bold"
          style={{
            width: '36px',
            height: '36px',
            background: `linear-gradient(135deg, ${agent.avatarColor.includes('from-') ? 'var(--accent-cyan)' : agent.avatarColor})`,
            border: `2px solid ${agent.status === 'active' ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
          }}
        >
          <span style={{ color: '#fff' }}>{agent.initials}</span>
        </div>
        <span
          className="text-xs font-semibold text-center truncate w-full"
          style={{ color: 'var(--text-primary)' }}
        >
          {agent.name}
        </span>
        <StatusBadge
          variant={agent.status === 'active' ? 'active' : 'standby'}
          size="sm"
        />
        <MiniChart
          data={
            agent.status === 'active'
              ? [30, 50, 40, 70, 55, 80, 60]
              : [10, 15, 12, 18, 14, 20, 16]
          }
          width={60}
          height={16}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg transition-all duration-normal"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-active)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div
        className="rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{
          width: '40px',
          height: '40px',
          background: `linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))`,
          border: `2px solid ${agent.status === 'active' ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
        }}
      >
        <span style={{ color: '#fff' }}>{agent.initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-body font-semibold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {agent.name}
          </span>
        </div>
        <span className="text-small truncate block" style={{ color: 'var(--text-secondary)' }}>
          {agent.role}
        </span>
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge
            variant={agent.status === 'active' ? 'active' : 'standby'}
            size="sm"
          />
          <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            {agent.taskCount} tasks
          </span>
        </div>
      </div>
    </div>
  );
}
