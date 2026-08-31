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
import { Page, Grid, Block, Stat } from '@/presentation/components/surface/Page';
import { getSystemState, checkAllServices, type ServiceState } from '@/application/system/systemService';
import { FEATURES, STATE_META, countByState, type Feature, type FeatureState } from '@/domain/system/featureRegistry';

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

  return (
    <Page
      title="Status"
      subtitle={
        checkedAt
          ? `Services checked at ${checkedAt.toLocaleTimeString('nl-NL')} · features declared 31 Aug 2026`
          : 'Services measured live · features declared, not measured'
      }
      actions={
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
    >
      <Grid rowHeight={132} min={168} className="mb-3">
        <Block title="Works"><Stat value={counts.works} tone="ok" label="tabs" /></Block>
        <Block title="Partial"><Stat value={counts.partial} tone="warn" label="thin or unfinished" /></Block>
        <Block title="Broken"><Stat value={counts.broken} tone="err" label="do not work" /></Block>
        <Block title="Empty"><Stat value={counts.empty} label="nothing in them" /></Block>
        <Block title="Duplicate"><Stat value={counts.duplicate} label="same as another tab" /></Block>
        <Block title="Services">
          <Stat
            value={services.length ? `${online}/${services.length}` : '—'}
            tone={offline > 0 ? 'warn' : 'ok'}
            label={services.length ? 'online' : 'run a health check'}
          />
        </Block>
      </Grid>

      <Grid rowHeight={430} min={330}>
        <Block
          span={2}
          title="Features — declared, not measured"
          action={
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
        </Block>

        <Block title="Services — measured now">
          {services.length === 0 ? (
            <p className="pt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              No reading yet. Press Health check.
            </p>
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
        </Block>
      </Grid>
    </Page>
  );
}
