import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Activity } from 'lucide-react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { monitoringIsFresh, monitoringSnapshot, SERVICE_MONITOR_PATH, type ServiceMonitoringSnapshot } from '@/domain/serviceMonitoring';
import { startNotificationFeed } from '@/application/system/notificationFeed';
import { useNotifications } from '@/presentation/contexts/NotificationContext';

/** Zelfde metingen in Status, Samsung Device Manager en de slotscherm-glance. */
export function ServiceMonitoringGlance() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<ServiceMonitoringSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { notifications } = useNotifications();
  useEffect(() => {
    const sb = getSupabase();
    const feed = startNotificationFeed<ServiceMonitoringSnapshot>({
      load: async signal => {
        if (!sb) throw new Error('Supabase is not configured');
        const { data, error: failure } = await sb.from('core_obsidian_notes').select('metadata')
          .eq('path', SERVICE_MONITOR_PATH).limit(1).abortSignal(signal);
        if (failure) throw new Error(failure.message);
        const parsed = monitoringSnapshot(data?.[0]?.metadata);
        return parsed ? [parsed] : [];
      },
      changed: rows => { setSnapshot(rows[0] ?? null); setNow(Date.now()); },
      failed: setError,
    });
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => { feed.stop(); clearInterval(timer); };
  }, []);
  const fresh = !error && monitoringIsFresh(snapshot, now);
  const material = notifications.filter(n => /^AXE (service (outage|recovered)|dependency)/i.test(n.title) && !n.read).slice(0, 3);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>
          <Activity size={14} /> Service monitoring
        </h2>
        <button type="button" onClick={() => navigate('/status')} className="text-[11px]" style={{ color: 'var(--accent)' }}>Status</button>
      </div>
      <p className="mb-2 text-[12px]" style={{ color: fresh ? 'var(--text-muted)' : 'var(--warning)' }}>
        {error ? `Monitor unavailable: ${error}` : !snapshot ? 'Monitor has not reported yet'
          : !fresh ? `Monitor reading is stale · ${new Date(snapshot.checked_at).toLocaleString()}`
            : `Checked ${new Date(snapshot.checked_at).toLocaleTimeString()} · outages require two failed readings`}
      </p>
      <p className="mb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>Runtime checks measure availability, not completed agent jobs. Successful runtime probes may be cached for five minutes.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px]">
        {snapshot?.services.map(service => {
          const state = !fresh ? 'stale' : service.status === 'offline' && service.confirmed !== 'offline' ? 'confirming' : service.status;
          const color = state === 'online' ? 'var(--success)' : state === 'offline' ? 'var(--error)' : state === 'confirming' ? 'var(--warning)' : 'var(--text-muted)';
          return <span key={service.component} style={{ color }}><b>{service.label}</b> · {state}</span>;
        })}
      </div>
      {!!snapshot?.pending_notifications && <p className="mt-2 text-[12px]" style={{ color: 'var(--warning)' }}>{snapshot.pending_notifications} alerts awaiting delivery</p>}
      {snapshot?.push_transport === 'vps_sender' && <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>Phone push uses the VPS sender; independent delivery is not configured.</p>}
      {snapshot?.push_transport === 'delivery_failed' && <p className="mt-2 text-[12px]" style={{ color: 'var(--warning)' }}>Phone push delivery failed. Alerts remain in the app.</p>}
      {material.map(n => (
        <button type="button" key={n.id} onClick={() => navigate('/status')} className="mt-2 block w-full text-left text-[12px]" style={{ color: n.type === 'error' ? 'var(--error)' : 'var(--text-primary)' }}>
          <b>{n.title}</b><span className="mt-1 block" style={{ color: 'var(--text-secondary)' }}>{n.detail}</span>
        </button>
      ))}
    </div>
  );
}
