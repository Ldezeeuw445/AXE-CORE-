/**
 * ModelStatusWidget — which models answer, and how fast.
 *
 * Replaces the habit tracker in the right panel. Habits were a personal
 * side-note; whether Gemini is reachable decides whether AXE can think at
 * all, and it is the first thing worth knowing when a reply fails.
 *
 * Reuses `checkAllServices`, which already probes every provider, rather than
 * inventing a second health path that could disagree with the one the system
 * page shows.
 */
import { useEffect, useState, useCallback } from 'react';
import { checkAllServices, type ServiceState } from '@/application/system/systemService';

/** Model providers first — the rest of the estate has its own panel. */
const MODEL_KEYS = ['gemini', 'openrouter', 'groq', 'xai', 'ollama'] as const;
/** Backends a failing model usually depends on, so a red here explains a red there. */
const SUPPORT_KEYS = ['supabase', 'crewai'] as const;

const REFRESH_MS = 60_000;

export function ModelStatusWidget() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const run = useCallback(async () => {
    setChecking(true);
    try {
      const all = await checkAllServices();
      setServices(all);
      setCheckedAt(Date.now());
    } catch {
      // checkAllServices settles every probe itself, so a throw here means the
      // call never ran — keep the last known result rather than blanking it.
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void run();
    const t = window.setInterval(() => void run(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [run]);

  const pick = (keys: readonly string[]) =>
    keys
      .map(k => services.find(s => s.service === k || s.id === k))
      .filter((s): s is ServiceState => Boolean(s));

  const models = pick(MODEL_KEYS);
  const support = pick(SUPPORT_KEYS);
  const okCount = models.filter(s => s.status === 'online').length;

  const Row = ({ s }: { s: ServiceState }) => {
    const ok = s.status === 'online';
    return (
      <div className="flex items-center justify-between gap-2 py-[3px]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex-shrink-0 rounded-full"
            style={{
              width: 6, height: 6,
              background: ok ? 'var(--success)' : 'var(--error)',
              boxShadow: ok ? '0 0 6px rgba(52,211,153,0.7)' : 'none',
            }}
          />
          <span className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {s.display || s.service}
          </span>
        </div>
        <span
          className="flex-shrink-0 text-[10px] font-mono"
          style={{ color: ok ? 'var(--success)' : 'var(--error)' }}
        >
          {ok ? (s.latency_ms != null ? `${s.latency_ms}ms` : 'OK') : 'FAIL'}
        </span>
      </div>
    );
  };

  if (checking && services.length === 0) {
    return (
      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Modellen testen…
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Geen statusdata — health check onbereikbaar.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {okCount}/{models.length} modellen OK
        </span>
        <button
          type="button"
          onClick={() => void run()}
          disabled={checking}
          className="text-[10px] font-mono"
          style={{ color: checking ? 'var(--text-muted)' : 'var(--accent-cyan)', background: 'none', border: 'none', cursor: checking ? 'default' : 'pointer' }}
        >
          {checking ? '…' : 'test'}
        </button>
      </div>

      {models.map(s => <Row key={s.id || s.service} s={s} />)}

      {support.length > 0 && (
        <>
          <div className="my-1" style={{ height: 1, background: 'var(--border-subtle)' }} />
          {support.map(s => <Row key={s.id || s.service} s={s} />)}
        </>
      )}

      {checkedAt && (
        <div className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
          {new Date(checkedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}
