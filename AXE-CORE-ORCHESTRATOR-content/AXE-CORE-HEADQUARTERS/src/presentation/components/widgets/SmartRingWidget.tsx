/**
 * SmartRingWidget — CORE vitals from Da Rings, top of RightPanel (above AI Core).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Heart, Footprints, Battery, Moon, RefreshCw,
  Droplets, Flame, Clock, Gauge,
} from 'lucide-react';
import {
  getRingSnapshot,
  setRingSnapshot,
  type RingSnapshot,
} from '@/infrastructure/persistence/ringSnapshotService';

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

function stressLabel(n: number): string {
  if (n < 30) return 'Relaxed';
  if (n < 60) return 'Normal';
  if (n < 80) return 'Medium';
  return 'Stressed';
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Premium decorative ECG trace — a real animated pulse line, not just a
 *  number. Cycle speed follows the actual BPM when known (60/bpm seconds
 *  per sweep) so a real live feed will visibly "beat" at the right pace;
 *  falls back to a calm resting-rate pace when there's no reading yet. */
function HeartbeatLine({ bpm, color = '#F43F5E' }: { bpm?: number; color?: string }) {
  const duration = bpm && bpm > 0 ? Math.max(0.4, Math.min(2, 60 / bpm)) : 1.1;
  return (
    <div className="relative w-full overflow-hidden rounded-md" style={{ height: 26, background: 'rgba(244,63,94,0.05)' }}>
      <svg width="200%" height="100%" viewBox="0 0 400 26" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        <path
          d="M0,13 L40,13 L52,13 L58,3 L64,23 L70,7 L76,13 L90,13 L200,13 L212,13 L218,3 L224,23 L230,7 L236,13 L250,13 L400,13"
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: `drop-shadow(0 0 3px ${color}80)`,
            animation: `axe-heartbeat-sweep ${duration * 2}s linear infinite`,
          }}
        />
      </svg>
      <style>{`
        @keyframes axe-heartbeat-sweep {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

export function SmartRingWidget() {
  const [snap, setSnap] = useState<RingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    steps: '', hr: '', spo2: '', hrv: '', stress: '', calories: '', duration: '', sleep: '', battery: '', bpSys: '', bpDia: '',
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSnap(await getRingSnapshot());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 20_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'axe_ring_snapshot') void reload();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('axe-ring-updated', () => void reload());
    return () => {
      window.clearInterval(t);
      window.removeEventListener('storage', onStorage);
    };
  }, [reload]);

  const saveQuick = async () => {
    const n = (s: string) => (s.trim() ? parseFloat(s.replace(',', '.')) : undefined);
    const partial: Parameters<typeof setRingSnapshot>[0] = {
      source: 'Da Rings',
      deviceName: 'VR11',
    };
    const steps = n(form.steps); if (steps != null) partial.steps = steps;
    const hr = n(form.hr); if (hr != null) partial.heartRate = hr;
    const spo2 = n(form.spo2); if (spo2 != null) partial.spo2 = spo2;
    const hrv = n(form.hrv); if (hrv != null) partial.hrv = hrv;
    const stress = n(form.stress); if (stress != null) partial.stress = stress;
    const cal = n(form.calories); if (cal != null) partial.calories = cal;
    const dur = n(form.duration); if (dur != null) partial.durationMin = dur;
    const sleep = n(form.sleep); if (sleep != null) partial.sleepHours = sleep;
    const bat = n(form.battery); if (bat != null) partial.battery = bat;
    const sys = n(form.bpSys); const dia = n(form.bpDia);
    if (sys != null) partial.bpSys = sys;
    if (dia != null) partial.bpDia = dia;

    const next = await setRingSnapshot(partial);
    setSnap(next);
    window.dispatchEvent(new Event('axe-ring-updated'));
    setEditing(false);
  };

  const stepsGoal = snap?.stepsGoal ?? 10000;
  const calGoal = snap?.caloriesGoal ?? 300;
  const durGoal = snap?.durationGoal ?? 30;

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--accent-cyan)' }}>
              CORE
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {snap?.deviceName || 'VR11'} · Da Rings
            </span>
          </div>
          {snap?.updatedAt && (
            <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
              synced {ageLabel(snap.updatedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {snap?.battery != null && (
            <span className="flex items-center gap-0.5 text-[9px] font-mono" style={{ color: snap.battery > 20 ? '#10B981' : 'var(--warning)' }}>
              <Battery size={10} /> {snap.battery}%
            </span>
          )}
          <button onClick={() => void reload()} className="p-0.5" title="Refresh" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setEditing(e => !e)}
            className="text-[9px] px-1.5 py-0.5 rounded font-medium"
            style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.3)' }}
          >
            {editing ? '×' : 'Log'}
          </button>
        </div>
      </div>

      <HeartbeatLine bpm={snap?.heartRate} />

      {editing && (
        <div className="space-y-1.5 p-2 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[8px] leading-snug" style={{ color: 'var(--text-muted)' }}>
            Kopieer uit Da Rings → Save. Of chat: “log ring 1441 stappen 65 kcal SpO2 98 HRV 57 stress 25”.
            Of zet de Apple Health → Shortcuts-automatisering aan voor automatische updates (ververst zelf).
          </p>
          <div className="grid grid-cols-3 gap-1">
            {([
              ['steps', 'Steps'],
              ['calories', 'kcal'],
              ['duration', 'Min'],
              ['hr', 'HR'],
              ['spo2', 'SpO₂'],
              ['hrv', 'HRV'],
              ['stress', 'Stress'],
              ['bpSys', 'BP sys'],
              ['bpDia', 'BP dia'],
              ['sleep', 'Sleep h'],
              ['battery', 'Bat %'],
            ] as const).map(([k, label]) => (
              <input
                key={k}
                value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                placeholder={label}
                className="px-1 py-1 rounded text-[9px] font-mono outline-none"
                style={{ background: '#0A0A0A', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
            ))}
          </div>
          <button
            onClick={() => void saveQuick()}
            className="w-full text-[10px] py-1 rounded font-semibold"
            style={{ background: 'rgba(34,211,238,0.22)', color: 'var(--accent-cyan)' }}
          >
            Save to CORE
          </button>
        </div>
      )}

      {!snap && !editing && (
        <p className="text-[9px] py-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Geen ring-data — open Da Rings, tik <strong style={{ color: 'var(--accent-cyan)' }}>Log</strong>, zeg het in chat,
          of zet de Apple Health → Shortcuts-automatisering aan.
        </p>
      )}

      {snap && (
        <>
          {/* Activity goals */}
          {(snap.steps != null || snap.calories != null || snap.durationMin != null) && (
            <div className="space-y-1.5">
              <div className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Activity</div>
              {snap.steps != null && (
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <Footprints size={10} style={{ color: '#22D3EE' }} /> Steps
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {snap.steps.toLocaleString('nl-NL')}<span style={{ color: 'var(--text-muted)' }}>/{stepsGoal.toLocaleString('nl-NL')}</span>
                    </span>
                  </div>
                  <ProgressBar value={snap.steps} max={stepsGoal} color="#22D3EE" />
                </div>
              )}
              {snap.calories != null && (
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <Flame size={10} style={{ color: '#F97316' }} /> Calories
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {snap.calories}<span style={{ color: 'var(--text-muted)' }}>/{calGoal} kcal</span>
                    </span>
                  </div>
                  <ProgressBar value={snap.calories} max={calGoal} color="#F97316" />
                </div>
              )}
              {snap.durationMin != null && (
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <Clock size={10} style={{ color: '#3B82F6' }} /> Active
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {snap.durationMin}<span style={{ color: 'var(--text-muted)' }}>/{durGoal} min</span>
                    </span>
                  </div>
                  <ProgressBar value={snap.durationMin} max={durGoal} color="#3B82F6" />
                </div>
              )}
            </div>
          )}

          {/* Vitals grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {snap.heartRate != null && (
              <MetricTile icon={Heart} label="Heart rate" value={`${snap.heartRate}`} unit="bpm" color="#F43F5E" />
            )}
            {snap.spo2 != null && (
              <MetricTile icon={Droplets} label="Blood O₂" value={`${snap.spo2}`} unit="%" color="#3B82F6" />
            )}
            {snap.hrv != null && (
              <MetricTile icon={Activity} label="HRV" value={`${snap.hrv}`} unit="ms" color="#F97316" />
            )}
            {snap.stress != null && (
              <MetricTile
                icon={Gauge}
                label="Stress"
                value={`${snap.stress}`}
                unit={stressLabel(snap.stress)}
                color={snap.stress < 30 ? '#10B981' : snap.stress < 60 ? '#84CC16' : '#F59E0B'}
              />
            )}
            {snap.bpSys != null && snap.bpDia != null && (
              <MetricTile icon={Activity} label="BP" value={`${snap.bpSys}/${snap.bpDia}`} unit="mmHg" color="#38BDF8" />
            )}
            {snap.sleepHours != null && (
              <MetricTile icon={Moon} label="Sleep" value={`${snap.sleepHours}`} unit="h" color="#A78BFA" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  color,
}: {
  icon: typeof Heart;
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div
      className="px-2 py-1.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <Icon size={10} style={{ color }} />
        <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div className="font-mono text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
        {value}{' '}
        <span className="text-[9px] font-normal" style={{ color: 'var(--text-muted)' }}>{unit}</span>
      </div>
    </div>
  );
}
