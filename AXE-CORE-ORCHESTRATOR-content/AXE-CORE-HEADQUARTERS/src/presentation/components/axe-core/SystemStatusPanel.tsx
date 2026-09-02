/**
 * One line per question worth asking before you trust the screen.
 *
 * Collapsed to a single summary until something needs attention, because a
 * status panel that is always open stops being read. It opens itself when a
 * check is bad — the whole point is that you find out without going to look.
 *
 * The four states are drawn differently on purpose. Green and red alone would
 * merge "this is broken" with "this could not be checked", and those need
 * opposite responses: one is a repair, the other is a blind spot.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import {
  runSystemChecks, worstState, type SystemCheck, type CheckState,
} from '@/application/system/systemStatus';

const TONE: Record<CheckState, { dot: string; text: string; word: string }> = {
  ok:      { dot: '#34d399', text: 'rgba(255,255,255,0.55)', word: 'fine' },
  warn:    { dot: '#fbbf24', text: '#fbbf24',                 word: 'needs a look' },
  bad:     { dot: '#f87171', text: '#f87171',                 word: 'broken' },
  unknown: { dot: '#64748b', text: '#94a3b8',                 word: 'unknown' },
};

const GROUP_LABEL: Record<SystemCheck['group'], string> = {
  desk: 'The desk',
  data: 'Data',
  platform: 'Platform',
};

export function SystemStatusPanel() {
  const [checks, setChecks] = useState<SystemCheck[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const next = await runSystemChecks();
      setChecks(next);
      // Opens itself on trouble. A panel you have to remember to open is a
      // panel that reports a dead trading loop to nobody.
      if (worstState(next) === 'bad') setOpen(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const i = setInterval(() => void load(), 120_000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [load]);

  const worst = checks ? worstState(checks) : 'unknown';
  const tone = TONE[worst];
  const trouble = checks?.filter(c => c.state !== 'ok') ?? [];

  const groups: SystemCheck['group'][] = ['desk', 'platform', 'data'];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${worst === 'ok' ? 'var(--border-subtle)' : tone.dot + '55'}`,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
      >
        {open ? <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.35)' }} />
              : <ChevronRight size={13} style={{ color: 'rgba(255,255,255,0.35)' }} />}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tone.dot }} />
        <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>System</span>

        <span className="text-[10px] min-w-0 truncate" style={{ color: tone.text }}>
          {!checks ? 'checking…'
            : trouble.length === 0 ? `all ${checks.length} checks fine`
              : trouble.map(t => t.label).join(' · ')}
        </span>

        <span
          className="ml-auto shrink-0"
          onClick={e => { e.stopPropagation(); void load(); }}
          title="Re-check now"
        >
          <RefreshCw size={11} style={{ color: 'rgba(255,255,255,0.3)', opacity: busy ? 0.4 : 1 }} />
        </span>
      </button>

      {open && checks && (
        <div className="px-3 pb-3 space-y-2.5">
          {groups.map(g => {
            const rows = checks.filter(c => c.group === g);
            if (!rows.length) return null;
            return (
              <div key={g}>
                <p className="text-[9px] uppercase tracking-[0.14em] mb-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {GROUP_LABEL[g]}
                </p>
                <div className="space-y-1">
                  {rows.map(c => {
                    const t = TONE[c.state];
                    return (
                      <div key={c.id} className="rounded px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div className="flex items-baseline gap-2">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.dot }} />
                          <span className="text-[11px] w-[130px] shrink-0" style={{ color: 'var(--text-primary)' }}>
                            {c.label}
                          </span>
                          <span className="text-[10px] flex-1 min-w-0" style={{ color: t.text }}>
                            {c.detail}
                          </span>
                        </div>
                        {c.action && (
                          <p className="text-[9px] mt-1 ml-[145px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
                            {c.action}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Grey means the check itself could not run — that is a blind spot, not a pass.
            Re-checks every two minutes.
          </p>
        </div>
      )}
    </div>
  );
}
