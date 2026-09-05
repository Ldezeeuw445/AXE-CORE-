/**
 * SmartHomeWidget — glance card. On token expiry show last known devices
 * (stale) instead of a loud red error.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Home, RefreshCw, Lightbulb, Power } from 'lucide-react';
import {
  smartThingsConfigured,
  listSmartThingsDevices,
  getDeviceStatus,
  type StDevice,
} from '@/infrastructure/gateways/smartThingsService';

interface DeviceRow {
  device: StDevice;
  on: boolean | null;
}

const CACHE_KEY = 'axe_smartthings_cache';

function extractSwitchState(status: unknown): boolean | null {
  try {
    const s = status as { components?: { main?: { switch?: { switch?: { value?: string } } } } };
    const v = s?.components?.main?.switch?.switch?.value;
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch { /* */ }
  return null;
}

function loadCache(): { rows: DeviceRow[]; at: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { rows: DeviceRow[]; at: number };
  } catch {
    return null;
  }
}

function saveCache(rows: DeviceRow[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rows, at: Date.now() }));
  } catch { /* ignore */ }
}

function ageLabel(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return 'nu';
  if (m < 60) return `${m}m geleden`;
  return `${Math.round(m / 60)}u geleden`;
}

export function SmartHomeWidget() {
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const failCount = useRef(0);
  const timerRef = useRef<number | null>(null);

  const reload = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!smartThingsConfigured()) {
      setRows(null);
      setLoading(false);
      setHint(null);
      setStaleAt(null);
      return;
    }
    if (!opts?.quiet || rows === null) setLoading(true);
    try {
      const devices = await listSmartThingsDevices();
      const withStatus = await Promise.all(
        devices.slice(0, 12).map(async (device) => {
          try {
            const status = await getDeviceStatus(device.deviceId);
            return { device, on: extractSwitchState(status) };
          } catch {
            return { device, on: null };
          }
        }),
      );
      setRows(withStatus);
      saveCache(withStatus);
      setStaleAt(null);
      setHint(null);
      failCount.current = 0;
    } catch (err) {
      failCount.current += 1;
      const msg = err instanceof Error ? err.message : String(err);
      const cached = loadCache();
      if (cached?.rows?.length) {
        setRows(cached.rows);
        setStaleAt(cached.at);
        setHint(`Offline / token — laatste status ${ageLabel(cached.at)}. Vernieuw token in Settings.`);
      } else if (rows === null) {
        setRows([]);
        setHint(msg.includes('401') || msg.includes('403')
          ? 'Token verlopen — vernieuw in Settings → SmartThings (24u).'
          : 'Kon SmartThings niet bereiken.');
      } else {
        setHint('Kon niet verversen — toont laatste bekende status.');
      }
    } finally {
      setLoading(false);
    }
  }, [rows]);

  useEffect(() => {
    const cached = loadCache();
    if (cached?.rows?.length) {
      setRows(cached.rows);
      setStaleAt(cached.at);
      setLoading(false);
    }
    void reload();

    const schedule = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (failCount.current >= 2) return;
      timerRef.current = window.setInterval(() => {
        if (failCount.current >= 2) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          return;
        }
        void reload({ quiet: true });
      }, 5 * 60_000);
    };
    schedule();

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!smartThingsConfigured()) {
    return (
      <p className="text-[9px] py-1" style={{ color: 'var(--text-muted)' }}>
        Geen SmartThings-token — Settings → Provider Keys → SmartThings.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          {rows ? `${rows.length} apparaten` : loading ? 'Laden…' : '—'}
          {staleAt != null && (
            <span style={{ color: 'var(--warning)' }}> · stale</span>
          )}
        </span>
        <button
          onClick={() => {
            failCount.current = 0;
            void reload();
          }}
          className="p-0.5"
          title="Refresh"
          style={{ color: 'var(--text-muted)' }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {hint && (
        <p className="text-[9px] py-1 leading-snug" style={{ color: 'var(--warning)' }}>
          {hint}
        </p>
      )}

      {rows && rows.length === 0 && !hint && (
        <p className="text-[9px] py-1" style={{ color: 'var(--text-muted)' }}>No devices found.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {rows.map(({ device, on }) => (
            <div
              key={device.deviceId}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                opacity: staleAt != null ? 0.75 : 1,
              }}
            >
              {on === true ? (
                <Lightbulb size={11} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              ) : on === false ? (
                <Power size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              ) : (
                <Home size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}
              <div className="min-w-0">
                <div className="text-[9px] truncate" style={{ color: 'var(--text-primary)' }}>
                  {device.label || device.name}
                </div>
                {on != null && (
                  <div className="text-[8px]" style={{ color: on ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {on ? 'aan' : 'uit'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
