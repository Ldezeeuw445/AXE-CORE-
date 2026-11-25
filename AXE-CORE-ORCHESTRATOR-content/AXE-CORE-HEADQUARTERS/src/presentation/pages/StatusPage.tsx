/**
 * Status — the page that answers "what actually works".
 *
 * Two halves, kept visibly apart because they are different kinds of claim:
 *
 *   Services are MEASURED. checkAllServices() pings them now.
 *   Features are DECLARED. Nothing can ping "is the agents panel good", so
 *   featureRegistry states it, with a note and the evidence behind it.
 *
 * Blurring those would make the page worse than nothing: a measured green and
 * someone's opinion should never look identical.
 *
 * Also the first page built on Page/Grid/Block, so it doubles as the proof
 * that the equal-blocks layout holds up on real content.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { DashSchil, DashKop, DashRaster, DashKaart, DashLeeg } from '@/presentation/components/layout/dashboardSchil';
import { getSystemState, checkAllServices, type ServiceState } from '@/application/system/systemService';
import { FEATURES, STATE_META, countByState, type Feature, type FeatureState } from '@/domain/system/featureRegistry';
import { chatSaveHealth, type ChatSaveHealth } from '@/infrastructure/persistence/chatPersistence';
import { feedbackHealth } from '@/infrastructure/persistence/memoryFeedbackService';
import { ServiceMonitoringGlance } from '@/presentation/components/axe-core/ServiceMonitoringGlance';

const TONE_COLOR = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  err: 'var(--error)',
  muted: 'var(--text-muted)',
} as const;

function Dot({ tone }: { tone: keyof typeof TONE_COLOR }) {
  return (
    <span
      className="inline-block flex-none rounded-full"
      style={{ width: 6, height: 6, background: TONE_COLOR[tone] }}
    />
  );
}

/** One row of the feature list. Same shape as every other row in the app. */
function FeatureRow({ f, onOpen }: { f: Feature; onOpen: (r: string) => void }) {
  const meta = STATE_META[f.state];
  return (
    <button
      type="button"
      onClick={() => onOpen(f.route)}
      className="group flex w-full items-start gap-3 rounded-card px-2 py-2 text-left transition-colors duration-100 hover:bg-white/[.06]"
    >
      <span className="mt-1.5"><Dot tone={meta.tone} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <b className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {f.label}
          </b>
          <code className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            /{f.route}
          </code>
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {f.note}
        </span>
        {f.evidence && (
          <span className="mt-0.5 block font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {f.evidence}
          </span>
        )}
      </span>
      <span
        className="mt-0.5 flex-none rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          color: TONE_COLOR[meta.tone],
          background: `color-mix(in srgb, ${TONE_COLOR[meta.tone]} 12%, transparent)`,
        }}
      >
        {meta.label}
      </span>
      <ExternalLink
        size={13}
        className="mt-1 flex-none opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: 'var(--text-muted)' }}
      />
    </button>
  );
}

export default function StatusPage() {
  const navigate = useNavigate();
  const [services, setServices] = useState<ServiceState[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<FeatureState | 'all'>('all');
  // Chat persistence silently stopped for four days in August because the
  // failure only ever reached console.error. Showing it is the fix for that,
  // not the RLS change — a break that is visible gets noticed the same day.
  const [saveState, setSaveState] = useState<ChatSaveHealth>(() => chatSaveHealth());
  // Same reasoning as the chat-save tile: the learning loop was open for
  // months because nothing showed whether it was turning. A number that is
  // stuck at zero is a question; a loop with no readout is silence.
  const [loop, setLoop] = useState(() => feedbackHealth());
  useEffect(() => {
    const t = setInterval(() => {
      setSaveState(chatSaveHealth());
      setLoop(feedbackHealth());
    }, 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void getSystemState().then(setServices).catch(() => setServices([]));
  }, []);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      setServices(await checkAllServices());
      setCheckedAt(new Date());
    } catch {
      /* a failed check is itself the answer; the rows show what they show */
    } finally {
      setChecking(false);
    }
  }, []);

  const counts = useMemo(() => countByState(), []);
  const shown = useMemo(
    () => (filter === 'all' ? FEATURES : FEATURES.filter(f => f.state === filter)),
    [filter],
  );

  const online = services.filter(s => s.status === 'online').length;
  const offline = services.filter(s => s.status === 'offline').length;

  /* 25 nov (Luka: geen scroll): de acht stat-blokken staan nu als cijfers in
     de kopstrook, features + services + monitoring delen één raster. Alleen
     de lijsten schuiven, binnen hun eigen kaart. */
  return (
    <div className="axe-status-v3 flex min-h-0 flex-1 flex-col" data-axe-status="v3">
    <DashSchil
      tab="status"
      kop={
        <DashKop
          titel="Status"
          sub={
            checkedAt
              ? `Checked ${checkedAt.toLocaleTimeString('en-GB')} · features declared 31 Aug 2026`
              : 'Services measured live · features declared'
          }
          cijfers={[
            { label: 'Works', waarde: counts.works, sub: 'tabs', toon: 'ok' },
            { label: 'Partial', waarde: counts.partial, sub: 'unfinished', toon: 'warn' },
            { label: 'Broken', waarde: counts.broken, sub: `${counts.empty + counts.duplicate} empty or dup`, toon: 'fout' },
            {
              label: 'Services',
              waarde: services.length ? `${online}/${services.length}` : '—',
              sub: services.length ? 'online' : 'run a check',
              toon: services.length ? (offline > 0 ? 'warn' : 'ok') : undefined,
            },
          ]}
          acties={
            <button
              type="button"
              onClick={runCheck}
              disabled={checking}
              className="flex items-center gap-1.5 rounded-button px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: 'var(--tint)',
                border: '1px solid var(--tint-line)',
                color: 'var(--accent-cyan)',
                opacity: checking ? 0.6 : 1,
              }}
            >
              <RefreshCw size={12} className={checking ? 'animate-spin' : undefined} />
              {checking ? 'checking…' : 'Health check'}
            </button>
          }
        />
      }
    >
      <DashRaster kolommen={3} rijen={2}>
        <DashKaart
          kolom={2}
          rij={2}
          titel="Features · declared"
          telling={shown.length}
          actie={
            <div className="flex gap-1">
              {(['all', 'broken', 'partial', 'empty'] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                  style={{
                    color: filter === k ? 'var(--accent-ice)' : 'var(--text-muted)',
                    background: filter === k ? 'var(--tint)' : 'transparent',
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          }
        >
          <div className="flex flex-col gap-0.5">
            {shown.map(f => (
              <FeatureRow key={f.route} f={f} onOpen={r => navigate(`/${r}`)} />
            ))}
          </div>
        </DashKaart>

        <DashKaart titel="Services · measured" telling={services.length || undefined}>
          {services.length === 0 ? (
            <DashLeeg>No reading yet. Press Health check.</DashLeeg>
          ) : (
            <div className="flex flex-col gap-0.5">
              {services.map(s => (
                <div
                  key={s.id ?? s.service}
                  className="flex items-center gap-2.5 rounded-card px-2 py-1.5"
                >
                  <Dot
                    tone={
                      s.status === 'online' ? 'ok'
                        : s.status === 'degraded' ? 'warn'
                          : s.status === 'offline' ? 'err' : 'muted'
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                    {s.display || s.service}
                  </span>
                  {s.latency_ms != null && (
                    <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {s.latency_ms}ms
                    </span>
                  )}
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DashKaart>

        <DashKaart titel="Monitoring">
          <div className="mb-2 grid grid-cols-2 gap-2" data-axe-status-lussen="">
            <div className="rounded-card px-2.5 py-2" style={{ background: 'rgba(255,255,255,.03)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Chat save</div>
              <div className="font-mono text-[16px] font-semibold" style={{ color: saveState.ok ? 'var(--success)' : 'var(--error)' }}>
                {saveState.ok ? 'OK' : String(saveState.failures)}
              </div>
              <div className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {saveState.ok ? (saveState.lastSuccessAt ? 'last message stored' : 'nothing stored yet') : 'failed attempts'}
              </div>
            </div>
            <div className="rounded-card px-2.5 py-2" style={{ background: 'rgba(255,255,255,.03)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Learning loop</div>
              <div className="font-mono text-[16px] font-semibold" style={{ color: loop.reinforcedMemories > 0 ? 'var(--success)' : loop.turns > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                {loop.judged > 0 ? `${loop.good}/${loop.judged}` : String(loop.turns)}
              </div>
              <div className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {loop.judged > 0 ? `reviewed · ${loop.reinforcedMemories} reinforced` : loop.turns > 0 ? 'fetched, not reviewed yet' : 'nothing fetched yet'}
              </div>
            </div>
          </div>
          <ServiceMonitoringGlance />
        </DashKaart>
      </DashRaster>
    </DashSchil>
    </div>
  );
}
