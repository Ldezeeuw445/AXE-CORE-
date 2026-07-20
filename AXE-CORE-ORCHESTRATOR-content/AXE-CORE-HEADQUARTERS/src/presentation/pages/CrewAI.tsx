import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Megaphone, Rocket, Target, TrendingUp, Send, Sparkles, Zap } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { apiCreateTask, apiExecuteCrewAI, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';

const crewAgents = [
  {
    key: 'sales_outreach_coordinator',
    role: 'Sales Outreach Coordinator',
    focus: 'Lead generation, email campaigns, CRM management',
  },
  {
    key: 'pitch_deck_specialist',
    role: 'Pitch Deck Specialist',
    focus: 'Pitch decks, business plans, fundraising materials',
  },
  {
    key: 'ai_trading_ecosystem_launch_specialist',
    role: 'AI Trading Ecosystem Launch Specialist',
    focus: 'Launch Trading OS + AXE Companion as one ecosystem',
  },
  {
    key: 'product_ecosystem_strategist',
    role: 'Product Ecosystem Strategist',
    focus: 'Connection between gateway app and main app',
  },
  {
    key: 'ai_trading_revolution_marketing_specialist',
    role: 'AI Trading Revolution Marketing Specialist',
    focus: 'Marketing strategy and fintech messaging',
  },
  {
    key: 'revenue_acceleration_specialist',
    role: 'Revenue Acceleration Specialist',
    focus: 'Pricing, early adopters, monetization',
  },
  {
    key: 'first_mover_advantage_optimizer',
    role: 'First-Mover Advantage Optimizer',
    focus: 'Moats, partnerships, market leadership',
  },
];

const crewTasks = [
  'trading_platform_final_polish_and_launch',
  'trading_democratization_marketing_strategy',
  'revenue_generation_strategy',
  'first_mover_market_domination',
  'sales_outreach_campaign_execution',
  'fundraising_materials_creation',
  'complete_launch_execution_plan',
];

type DispatchState = 'idle' | 'dispatching' | 'creating' | 'done' | 'error';

export default function CrewAI() {
  const [selectedTask, setSelectedTask] = useState(crewTasks[0]);
  const [customTitle, setCustomTitle] = useState('Launch Trading OS + AXE Companion');
  const [customNotes, setCustomNotes] = useState('Turn the attached CrewAI launch stack into a live execution task.');
  const [status, setStatus] = useState<DispatchState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const createControlTask = async (taskLabel: string, notes?: string) => {
    if (!isAxeApiConfigured) {
      setStatus('error');
      setMessage('AXE Core API is not configured yet. Set VITE_AXE_CORE_API_URL and VITE_AXE_CORE_API_KEY.');
      return;
    }
    setStatus('creating');
    setMessage(null);
    try {
      await apiCreateTask({
        title: taskLabel,
        description: notes ?? `CrewAI bridge task for ${taskLabel}`,
        priority: 'high',
        source_app: 'crewai',
        requested_by: 'CrewAI Bridge',
        assignee: 'AXE Core',
        capability: 'crewai',
        execution_mode: 'execute',
        route_path: '/internal/crewai/execute',
        payload: {
          source: 'crewai_bridge',
          crew_task: taskLabel,
          notes: notes ?? '',
          agents: crewAgents.map(agent => ({ key: agent.key, role: agent.role, focus: agent.focus })),
        },
        metadata: {
          bridge: 'crewai',
          route: '/internal/crewai/execute',
        },
        steps: [
          { title: 'Validate launch brief', status: 'pending', tool_name: 'crewai' },
          { title: 'Dispatch agent crew', status: 'pending', tool_name: 'crewai' },
          { title: 'Report back into control plane', status: 'pending', tool_name: 'supabase' },
        ],
      });
      setStatus('done');
      setMessage(`Control-plane task created for "${taskLabel}".`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to create control-plane task.');
    }
  };

  const dispatchCrew = async (taskLabel: string) => {
    if (!isAxeApiConfigured) {
      setStatus('error');
      setMessage('AXE Core API is not configured yet. Set VITE_AXE_CORE_API_URL and VITE_AXE_CORE_API_KEY.');
      return;
    }
    setStatus('dispatching');
    setMessage(null);
    try {
      await apiExecuteCrewAI({
        route_path: '/internal/crewai/execute',
        payload: {
          source: 'crewai_bridge',
          crew_task: taskLabel,
          agents: crewAgents.map(agent => ({ key: agent.key, role: agent.role, focus: agent.focus })),
        },
        metadata: {
          bridge: 'crewai',
          source_app: 'axe_core',
        },
      });
      setStatus('done');
      setMessage(`CrewAI dispatch sent for "${taskLabel}".`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to dispatch CrewAI.');
    }
  };

  return (
    <motion.div className="p-4 sm:p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>CrewAI Bridge</h1>
          <p className="text-xs-custom max-w-2xl" style={{ color: 'var(--text-muted)' }}>
            Imported launch crew for Trading OS + AXE Companion. Use this page to create live control-plane tasks and dispatch them to a real CrewAI endpoint when it is configured.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.08)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.18)' }}>
            Source: attached CrewAI project
          </div>
          <div className="text-[10px] px-2 py-1 rounded-full" style={{ background: isAxeApiConfigured ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', color: isAxeApiConfigured ? '#34d399' : '#f87171', border: `1px solid ${isAxeApiConfigured ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}` }}>
            {isAxeApiConfigured ? 'AXE API connected' : 'AXE API not configured'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Agents', value: crewAgents.length, icon: Bot, color: '#22d3ee' },
          { label: 'Tasks', value: crewTasks.length, icon: Rocket, color: '#8b5cf6' },
          { label: 'Launch Focus', value: 'Yes', icon: TrendingUp, color: '#10b981' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <WidgetCard key={card.label} title="">
              <div className="text-center py-1">
                <Icon size={15} className="mx-auto mb-1" style={{ color: card.color }} />
                <div className="text-2xl font-bold font-mono-data" style={{ color: card.color }}>{card.value}</div>
                <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
              </div>
            </WidgetCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <WidgetCard title="Launch Task Composer" headerAction={<Sparkles size={13} style={{ color: 'var(--accent-cyan)' }} />}>
          <div className="space-y-2.5">
            <input
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="Launch task title..."
              className="w-full px-3 py-2 rounded-lg text-small outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <textarea
              value={customNotes}
              onChange={e => setCustomNotes(e.target.value)}
              rows={4}
              placeholder="Task notes..."
              className="w-full px-3 py-2 rounded-lg text-xs-custom outline-none resize-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedTask}
                onChange={e => setSelectedTask(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-xs-custom outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                {crewTasks.map(task => <option key={task} value={task}>{task}</option>)}
              </select>
              <button
                onClick={() => { void createControlTask(customTitle, customNotes); }}
                disabled={!customTitle.trim() || status === 'creating' || status === 'dispatching'}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs-custom font-medium"
                style={{ background: 'var(--accent-cyan)', color: '#000', opacity: (!customTitle.trim() || status === 'creating' || status === 'dispatching') ? 0.6 : 1 }}
              >
                <Target size={13} />
                Create Task
              </button>
              <button
                onClick={() => { void dispatchCrew(selectedTask); }}
                disabled={status === 'creating' || status === 'dispatching'}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs-custom font-medium"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.25)', opacity: (status === 'creating' || status === 'dispatching') ? 0.6 : 1 }}
              >
                <Send size={13} />
                Dispatch Crew
              </button>
            </div>
            {message && (
              <div className="rounded-xl px-3 py-2 text-xs-custom" style={{ background: status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,211,238,0.08)', color: status === 'error' ? '#f87171' : 'var(--text-secondary)', border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.18)' : 'rgba(34,211,238,0.16)'}` }}>
                {message}
              </div>
            )}
          </div>
        </WidgetCard>

        <WidgetCard title="What this bridge is for">
          <ul className="space-y-2 text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            <li>• Marketing and launch coordination for the Trading OS + AXE Companion ecosystem.</li>
            <li>• Revenue planning, funnel design and pitch materials.</li>
            <li>• Launch execution can be persisted to `core_tasks`, `core_events` and a real CrewAI backend.</li>
            <li>• Nothing here changes the existing Trading OS or AXE Companion flows.</li>
          </ul>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <WidgetCard title="Crew Agents">
          <div className="space-y-2">
            {crewAgents.map(agent => (
              <div key={agent.key} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{agent.role}</div>
                    <div className="text-xs-custom mt-0.5" style={{ color: 'var(--text-muted)' }}>{agent.focus}</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono self-start" style={{ background: 'rgba(139,92,246,0.12)', color: '#c084fc' }}>
                    {agent.key}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Crew Tasks">
          <div className="space-y-2">
            {crewTasks.map((task, index) => (
              <div key={task} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-small font-medium break-words" style={{ color: 'var(--text-primary)' }}>{task}</div>
                    <div className="text-xs-custom mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Queue item {index + 1} in the launch plan
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedTask(task); void createControlTask(task, `CrewAI task: ${task}`); }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium self-start"
                    style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.16)' }}
                  >
                    <Zap size={11} />
                    Create
                  </button>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <WidgetCard title="Bridge Status">
          <div className="rounded-xl p-3" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.12)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Target size={13} style={{ color: 'var(--accent-cyan)' }} />
              <div className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>AXE dispatch</div>
            </div>
            <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
              This bridge can now create persisted tasks and send execution payloads to a configured CrewAI endpoint. When the endpoint is live, the control plane will stop being a mock layer.
            </p>
          </div>
        </WidgetCard>

        <WidgetCard title="Operational Note">
          <ul className="space-y-2 text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            <li>• Use the composer for a custom launch brief.</li>
            <li>• Use "Create" on any queue item to push it into the control plane.</li>
            <li>• Use "Dispatch Crew" to send the same payload to the live CrewAI endpoint.</li>
          </ul>
        </WidgetCard>
      </div>
    </motion.div>
  );
}
