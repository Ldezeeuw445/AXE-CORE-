import { ExternalLink, Database, Cpu } from 'lucide-react';
import { StatusBadge } from '@/presentation/components/widgets/StatusBadge';

export interface CoreAgent {
  id: string;
  name: string;
  display_name: string;
  role: string;
  description: string;
  system_prompt: string | null;
  memory_namespace: string | null;
  toolset: unknown[];
  model_provider: string;
  model_name: string;
  status: string;
  version: string | null;
  capabilities: string[];
  supabase_tables: string[];
  app_url: string | null;
  tags: string[];
}

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  orchestrator: { bg: 'rgba(168,85,247,0.12)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  assistant:    { bg: 'var(--tint-line)',  text: 'var(--accent-cyan)', border: 'var(--tint-line)' },
  analyst:      { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  developer:    { bg: 'rgba(34,197,94,0.12)',   text: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  trader:       { bg: 'rgba(251,191,36,0.12)',  text: 'var(--warning)', border: 'rgba(251,191,36,0.3)' },
  privacy:      { bg: 'rgba(249,115,22,0.12)',  text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
};

interface AgentCardProps {
  agent: CoreAgent;
  /** True when chat deep-linked directly to this agent (?open=<id> on /agents). */
  highlighted?: boolean;
}

export function AgentCard({ agent, highlighted }: AgentCardProps) {
  const colors = ROLE_COLORS[agent.role] ?? ROLE_COLORS.assistant;
  const initials = (agent.display_name || agent.name || 'A')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const tableCount = Array.isArray(agent.supabase_tables) ? agent.supabase_tables.length : 0;
  const badgeVariant = agent.status === 'active' ? 'active' : agent.status === 'online' ? 'online' : 'standby';

  return (
    <div
      className="p-4 rounded-none transition-all duration-normal cursor-default"
      style={{
        backgroundColor: 'transparent',
        border: 'none',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="rounded-xl flex items-center justify-center flex-shrink-0 font-semibold text-sm"
            style={{
              width: 40,
              height: 40,
              backgroundColor: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {agent.display_name}
              </span>
              <StatusBadge variant={badgeVariant} />
            </div>
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: colors.text }}
            >
              {agent.role}
            </span>
          </div>
        </div>
        {agent.app_url && (
          <a
            href={agent.app_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink
              size={14}
              className="flex-shrink-0 mt-0.5 transition-opacity opacity-40 hover:opacity-100"
              style={{ color: colors.text }}
            />
          </a>
        )}
      </div>

      {/* Description */}
      <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {agent.description}
      </p>

      {/* System prompt preview */}
      {agent.system_prompt && (
        <div
          className="rounded-lg p-2.5 mb-3 text-xs leading-relaxed"
          style={{
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'var(--text-muted)',
          }}
        >
          {agent.system_prompt.slice(0, 120)}
          {agent.system_prompt.length > 120 && (
            <span style={{ color: colors.text }}>…</span>
          )}
        </div>
      )}

      {/* Footer: LLM + tables */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Cpu size={11} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {agent.model_provider} / {(agent.model_name || '').split('/').pop()}
          </span>
        </div>
        {tableCount > 0 && (
          <div className="flex items-center gap-1">
            <Database size={11} style={{ color: colors.text }} />
            <span className="text-xs" style={{ color: colors.text }}>
              {tableCount} tables
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {agent.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {agent.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
