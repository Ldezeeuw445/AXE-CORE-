export const SERVICE_MONITOR_PATH = 'AXE/System/service-monitor.md';
export interface MonitoredService {
  component: string;
  label: string;
  status: 'online' | 'offline' | 'unknown' | 'unconfigured';
  confirmed: 'online' | 'offline' | null;
  checked_at: string;
}
export interface ServiceMonitoringSnapshot {
  checked_at: string;
  pending_notifications: number;
  services: MonitoredService[];
  push_transport?: string;
}

/** Een ontbrekende of oude meting wordt nooit stilletjes groen. */
export function monitoringIsFresh(snapshot: ServiceMonitoringSnapshot | null, now = Date.now()): boolean {
  if (!snapshot) return false;
  const age = now - Date.parse(snapshot.checked_at);
  return Number.isFinite(age) && age >= -60_000 && age < 3 * 60_000;
}

export function monitoringSnapshot(raw: unknown): ServiceMonitoringSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.checked_at !== 'string' || !Array.isArray(value.services)) return null;
  const services = value.services.filter((item): item is MonitoredService => {
    if (!item || typeof item !== 'object') return false;
    const s = item as Record<string, unknown>;
    return typeof s.component === 'string' && typeof s.label === 'string' && typeof s.checked_at === 'string'
      && ['online', 'offline', 'unknown', 'unconfigured'].includes(String(s.status))
      && (s.confirmed === null || s.confirmed === 'online' || s.confirmed === 'offline');
  });
  return { checked_at: value.checked_at, services,
    push_transport: typeof value.push_transport === 'string' ? value.push_transport : undefined,
    pending_notifications: typeof value.pending_notifications === 'number' ? value.pending_notifications : 0 };
}
