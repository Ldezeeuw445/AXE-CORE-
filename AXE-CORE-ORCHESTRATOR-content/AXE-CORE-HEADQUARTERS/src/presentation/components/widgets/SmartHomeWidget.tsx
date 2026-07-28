/**
 * SmartHomeWidget — read-only glance card for SmartThings devices (right
 * panel). Actual control stays in chat via [ST_COMMAND:], which is
 * approval-gated (approvalKind 'smart_home') — this widget never sends
 * commands, only lists devices + status, same trust boundary as ST_LIST/
 * ST_STATUS in toolRegistry.smartthings.ts.
 */
import { useCallback, useEffect, useState } from 'react';
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

function extractSwitchState(status: unknown): boolean | null {
  try {
    const s = status as { components?: { main?: { switch?: { switch?: { value?: string } } } } };
    const v = s?.components?.main?.switch?.switch?.value;
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch { /* */ }
  return null;
}

export function SmartHomeWidget() {
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!smartThingsConfigured()) {
      setRows(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(t);
  }, [reload]);

  if (!smartThingsConfigured()) {
    return (
      <p className="text-[9px] py-1" style={{ color: 'var(--text-muted)' }}>
        Geen SmartThings-token — zet 'm in Settings → Provider Keys → SmartThings.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          {rows ? `${rows.length} apparaten` : loading ? 'Laden…' : '—'}
        </span>
        <button onClick={() => void reload()} className="p-0.5" title="Refresh" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <p className="text-[9px] py-1" style={{ color: 'var(--danger, #F87171)' }}>{error}</p>
      )}

      {rows && rows.length === 0 && !error && (
        <p className="text-[9px] py-1" style={{ color: 'var(--text-muted)' }}>Geen apparaten gevonden.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {rows.map(({ device, on }) => (
            <div
              key={device.deviceId}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {on === true ? (
                <Lightbulb size={11} style={{ color: '#FBBF24', flexShrink: 0 }} />
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
                  <div className="text-[8px]" style={{ color: on ? '#FBBF24' : 'var(--text-muted)' }}>
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
