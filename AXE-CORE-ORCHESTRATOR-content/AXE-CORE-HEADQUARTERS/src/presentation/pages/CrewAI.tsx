import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Rocket, Send, Sparkles, Target, Users } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { crewRun, apiCreateTask, isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { SPECIALISTS } from '@/domain/catalogs/specialists';

/**
 * CrewAI — run the REAL multi-specialist crew as an explicit background job.
 *
 * The roster below is the canonical 9-specialist catalog
 * (domain/catalogs/specialists.ts), the same ids the VPS crew runner
 * (axe_api /crew/run -> run_crew_kickoff) selects agents by. This page is the
 * only place the crew is invoked — chat never calls it implicitly.
 *
 * Honesty contract: the result box shows exactly what /crew/run returned.
 * Until the CrewAI venv is deployed on the VPS, that is a clean error saying
 * so — never a fabricated "dispatch sent" success.
 */

type RunState = 'idle' | 'running' | 'done' | 'error';

export default function CrewAI() {
  const [task, setTask] = useState('');
  const [selected, setSelected] = useState<string[]>(['axe_core']);
  const [state, setState] = useState<RunState>('idle');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskMsg, setTaskMsg] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const runCrew = async () => {
    if (!task.trim()) return;
    setState('running');
    setResult(null);
    setError(null);
    try {
      const res = await crewRun({ task: task.trim(), specialists: selected.length > 0 ? selected : undefined });
      if (res.status === 'ok' && res.result) {
        setState('done');
        setResult(res.result);
      } else {
        setState('error');
        setError(res.error || `Crew returned status "${res.status}" without a result.`);
      }
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveAsTask = async () => {
    setTaskMsg(null);
    try {
      await apiCreateTask({
        title: task.slice(0, 120) || 'Crew run',
        description: result ? `Crew result:\n\n${result.slice(0, 4000)}` : task,
        priority: 'high',
        source_app: 'crewai',
        requested_by: 'CrewAI page',
        assignee: 'AXE Core',
        capability: 'crewai',
        payload: { source: 'crewai_page', task, specialists: selected },
      });
      setTaskMsg('Saved to the control plane (core_tasks).');
    } catch (e) {
      setTaskMsg(`Could not save task: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <motion.div className="p-4 sm:p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>CrewAI Specialists</h1>
          <p className="text-xs-custom max-w-2xl" style={{ color: 'var(--text-muted)' }}>
            Run a real multi-specialist crew on the VPS as a background job. Pick the specialists, describe the task,
            and get their synthesized result — this can take minutes on local Ollama models.
          </p>
        </div>
        <div
          className="text-[10px] px-2 py-1 rounded-full self-start"
          style={{
            background: isAxeApiConfigured ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            color: isAxeApiConfigured ? '#34d399' : '#f87171',
            border: `1px solid ${isAxeApiConfigured ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}`,
          }}
        >
          {isAxeApiConfigured ? 'AXE API connected' : 'AXE API not configured'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Specialists', value: SPECIALISTS.length, icon: Bot, color: '#22d3ee' },
          { label: 'Selected', value: selected.length, icon: Users, color: '#8b5cf6' },
          { label: 'Runtime', value: 'VPS · Ollama', icon: Rocket, color: '#10b981' },
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <WidgetCard title="Crew Roster" headerAction={<Users size={13} style={{ color: 'var(--accent-cyan)' }} />}>
          <div className="space-y-2">
            {SPECIALISTS.map(s => {
              const active = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className="w-full text-left rounded-xl p-3 transition-colors"
                  style={{
                    background: active ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>
                        {s.emoji} {s.name} — {s.role}
                      </div>
                      <div className="text-xs-custom mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.focus}</div>
                    </div>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-mono self-start shrink-0"
                      style={{
                        background: active ? 'rgba(34,211,238,0.15)' : 'rgba(139,92,246,0.12)',
                        color: active ? 'var(--accent-cyan)' : '#c084fc',
                      }}
                    >
                      {active ? 'selected' : s.id}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </WidgetCard>

        <div className="space-y-4">
          <WidgetCard title="Crew Task" headerAction={<Sparkles size={13} style={{ color: 'var(--accent-cyan)' }} />}>
            <div className="space-y-2.5">
              <textarea
                value={task}
                onChange={e => setTask(e.target.value)}
                rows={5}
                placeholder="Describe the task for the crew — e.g. 'Draft a launch plan for Trading OS: positioning, pricing, and the first three automation flows.'"
                className="w-full px-3 py-2 rounded-lg text-xs-custom outline-none resize-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => { void runCrew(); }}
                  disabled={!task.trim() || state === 'running' || !isAxeApiConfigured}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs-custom font-medium flex-1"
                  style={{
                    background: 'var(--accent-cyan)', color: '#000',
                    opacity: (!task.trim() || state === 'running' || !isAxeApiConfigured) ? 0.6 : 1,
                  }}
                >
                  <Send size={13} />
                  {state === 'running' ? 'Crew running… (can take minutes)' : 'Run Crew'}
                </button>
                {result && (
                  <button
                    onClick={() => { void saveAsTask(); }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs-custom font-medium"
                    style={{ background: 'rgba(139,92,246,0.12)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.25)' }}
                  >
                    <Target size={13} />
                    Save as Task
                  </button>
                )}
              </div>
              {taskMsg && (
                <div className="rounded-xl px-3 py-2 text-xs-custom" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(34,211,238,0.16)' }}>
                  {taskMsg}
                </div>
              )}
            </div>
          </WidgetCard>

          <WidgetCard title={state === 'error' ? 'Crew Error' : 'Crew Result'}>
            {state === 'idle' && (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                No run yet. The result shown here is exactly what the VPS crew returns — if the CrewAI runtime
                isn't deployed on the VPS yet, you'll see its real error message, not a fake success.
              </p>
            )}
            {state === 'running' && (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                Running {selected.length || 1} specialist{(selected.length || 1) > 1 ? 's' : ''} sequentially on VPS Ollama…
              </p>
            )}
            {state === 'error' && (
              <div className="rounded-xl px-3 py-2 text-xs-custom whitespace-pre-wrap" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)' }}>
                {error}
              </div>
            )}
            {state === 'done' && result && (
              <div className="rounded-xl px-3 py-2 text-xs-custom whitespace-pre-wrap max-h-[420px] overflow-y-auto" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {result}
              </div>
            )}
          </WidgetCard>
        </div>
      </div>
    </motion.div>
  );
}
