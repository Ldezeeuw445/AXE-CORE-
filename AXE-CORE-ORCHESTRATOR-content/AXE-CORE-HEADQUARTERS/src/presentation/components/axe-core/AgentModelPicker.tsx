/**
 * Pick the model one agent thinks with, from where you can see what it does.
 *
 * ## Why it lives on the lane and not only in Settings
 *
 * The choice is about this agent's job, and the lane is where the job is
 * visible — what it concluded last, how stale that is, what it handed on. Made
 * in a settings screen, the same choice is seven identical dropdowns with no
 * context to choose by.
 *
 * ## Only providers with a key
 *
 * Offering a provider that has no key produces a choice that silently falls
 * through the cascade to something else, and then the lane says one thing while
 * another model answers. The list is built from what is actually configured.
 *
 * "No preference" stays first and is a real answer: it inherits the shared
 * cascade, which is what every agent did before this existed.
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AgentId, ModelChoice } from '@/domain/agentModels';
import { agentSpec, resolveChoice, sameModel } from '@/domain/agentModels';
import { catalogPairs } from '@/domain/modelCatalog';
import type { ProviderId } from '@/domain/providers';
import { PROVIDERS } from '@/domain/providers';
import { loadAgentModelChoices, AGENT_MODELS_KEY } from '@/application/tradingIntel/deskAgentModels';
import { saveAgentModelChoices } from '@/infrastructure/persistence/userSettingsService';

/** Providers with a key saved, in the order the catalogue lists them. */
function configuredProviders(): ProviderId[] {
  let conns: Record<string, { key?: string }> = {};
  try {
    conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}');
  } catch { /* nothing configured */ }
  return PROVIDERS
    .map(p => p.id)
    .filter(id => !!conns[id]?.key || id === 'ollama');
}

export function AgentModelPicker({ agent, accent }: { agent: AgentId; accent: string }) {
  const [choices, setChoices] = useState(loadAgentModelChoices);
  const [open, setOpen] = useState(false);

  // Another surface may have changed this — the same choice is editable from
  // Settings, and two views of one setting that disagree is worse than one view.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AGENT_MODELS_KEY) setChoices(loadAgentModelChoices());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const current = resolveChoice(agent, choices);
  const spec = agentSpec(agent);
  const options = catalogPairs(configuredProviders());

  const pick = useCallback((choice: ModelChoice | null) => {
    const next = { ...choices, [agent]: choice };
    setChoices(next);
    setOpen(false);
    void saveAgentModelChoices(next);
  }, [choices, agent]);

  // Only meaningful for the pair that exists to disagree. Said, never enforced —
  // there are days when you want both lanes on whichever model is working.
  const twin: AgentId | null = agent === 'intel' ? 'companion' : agent === 'companion' ? 'intel' : null;
  const clash = twin ? sameModel(current, resolveChoice(twin, choices)) : false;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={spec?.wants}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono-data"
        style={{
          background: `${accent}14`,
          border: `1px solid ${clash ? '#fbbf24' : accent}3E`,
          color: 'var(--text-secondary)',
        }}
      >
        <span>{current ? current.model : 'no preference'}</span>
        <ChevronDown size={9} />
      </button>

      {clash && (
        <p className="text-[8px] mt-0.5" style={{ color: '#fbbf24' }}>
          Same model as its pair — one opinion in two voices
        </p>
      )}

      {open && (
        <div
          className="absolute right-0 mt-1 z-30 rounded-lg overflow-hidden"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', minWidth: 230 }}
        >
          {spec && (
            <p className="text-[9px] px-2 py-1.5" style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid var(--border-subtle)' }}>
              {spec.wants}
            </p>
          )}

          <button
            type="button"
            onClick={() => pick(null)}
            className="w-full text-left px-2 py-1.5 text-[10px]"
            style={{ color: current ? 'var(--text-secondary)' : accent }}
          >
            No preference
            <span className="block text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Uses the shared cascade
            </span>
          </button>

          {options.length === 0 && (
            <p className="text-[9px] px-2 py-2" style={{ color: '#fbbf24' }}>
              No provider has a key yet — set one in Settings.
            </p>
          )}

          {options.map(o => {
            const active = current?.provider === o.provider && current?.model === o.model;
            return (
              <button
                key={`${o.provider}:${o.model}`}
                type="button"
                onClick={() => pick({ provider: o.provider, model: o.model })}
                className="w-full text-left px-2 py-1.5 text-[10px]"
                style={{
                  color: active ? accent : 'var(--text-secondary)',
                  background: active ? `${accent}14` : 'transparent',
                }}
              >
                {o.model}
                <span className="block text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {o.provider} · {o.note}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
