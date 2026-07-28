/**
 * SmartRingWidget — top of RightPanel: latest Da Rings / smart-ring vitals.
 * Auto-refreshes from local store every 20s + on storage events.
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, Heart, Footprints, Battery, Moon, RefreshCw, Droplets } from 'lucide-react';
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

export function SmartRingWidget() {
  const [snap, setSnap] = useState<RingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ steps: '', hr: '', spo2: '', sleep: '', battery: '' });

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
    const partial: Parameters<typeof setRingSnapshot>[0] = { source: 'Da Rings' };
    if (form.steps) partial.steps = parseInt(form.steps, 10);
    if (form.hr) partial.heartRate = parseInt(form.hr, 10);
    if (form.spo2) partial.spo2 = parseInt(form.spo2, 10);
    if (form.sleep) partial.sleepHours = parseFloat(form.sleep.replace(',', '.'));
    if (form.battery) partial.battery = parseInt(form.battery, 10);
    const next = await setRingSnapshot(partial);
    setSnap(next);
    window.dispatchEvent(new Event('axe-ring-updated'));
    setEditing(false);
    setForm({ steps: '', hr: '', spo2: '', sleep: '', battery: '' });
  };

  const metrics: { icon: typeof Heart; label: string; value: string; color: string }[] = [];
  if (snap?.heartRate != null) metrics.push({ icon: Heart, label: 'HR', value: `${snap.heartRate}`, color: '#F43F5E' });
  if (snap?.steps != null) metrics.push({ icon: Footprints, label: 'Steps', value: snap.steps.toLocaleString('nl-NL'), color: '#22D3EE' });
  if (snap?.spo2 != null) metrics.push({ icon: Droplets, label: 'SpO₂', value: `${snap.spo2}%`, color: '#3B82F6' });
  if (snap?.sleepHours != null) metrics.push({ icon: Moon, label: 'Sleep', value: `${snap.sleepHours}h`, color: '#A78BFA' });
  if (snap?.calories != null) metrics.push({ icon: Activity, label: 'kcal', value: `${snap.calories}`, color: '#F59E0B' });
  if (snap?.battery != null) metrics.push({ icon: Battery, label: 'Bat', value: `${snap.battery}%`, color: '#10B981' });
  if (snap?.hrv != null) metrics.push({ icon: Activity, label: 'HRV', value: `${snap.hrv}`, color: '#EC4899' });
  if (snap?.stress != null) metrics.push({ icon: Activity, label: 'Stress', value: `${snap.stress}`, color: '#FB923C' });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--accent-cyan)' }}>
            💍 SMART RING
          </span>
          {snap?.updatedAt && (
            <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
              {ageLabel(snap.updatedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void reload()}
            className="p-0.5 rounded"
            title="Refresh"
            style={{ color: 'var(--text-muted)' }}
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setEditing(e => !e)}
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.25)' }}
          >
            {editing ? 'Cancel' : 'Update'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="space-y-1.5 p-2 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
            Vul over uit Da Rings-app (geen live API). Of zeg in chat: "log ring 8200 stappen HR 72".
          </p>
          <div className="grid grid-cols-2 gap-1">
            {([
              ['steps', 'Steps'],
              ['hr', 'HR'],
              ['spo2', 'SpO₂'],
              ['sleep', 'Sleep h'],
              ['battery', 'Battery %'],
            ] as const).map(([k, label]) => (
              <input
                key={k}
                value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                placeholder={label}
                className="px-1.5 py-1 rounded text-[10px] font-mono outline-none"
                style={{ background: '#0A0A0A', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
            ))}
          </div>
          <button
            onClick={() => void saveQuick()}
            className="w-full text-[10px] py-1 rounded font-medium"
            style={{ background: 'rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}
          >
            Save snapshot
          </button>
        </div>
      )}

      {!snap && !editing && (
        <p className="text-[9px] py-1" style={{ color: 'var(--text-muted)' }}>
          Nog geen data — open Da Rings, noteer cijfers, tik Update of log via chat.
        </p>
      )}

      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {metrics.map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <Icon size={11} style={{ color, flexShrink: 0 }} />
              <div className="min-w-0">
                <div className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
                <div className="text-[11px] font-mono font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {snap?.note && (
        <p className="text-[8px] truncate" style={{ color: 'var(--text-muted)' }}>{snap.note}</p>
      )}
    </div>
  );
}
