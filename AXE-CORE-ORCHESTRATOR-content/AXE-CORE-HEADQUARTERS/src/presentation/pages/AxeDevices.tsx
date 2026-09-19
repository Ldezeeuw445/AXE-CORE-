/**
 * Device Manager — inventory van AXE-installaties.
 *
 * Geen mock-toestellen. Online is last_seen, VPS is /health, Macs zijn
 * computer-workers of een heartbeat van deze app. Desktop-layout blijft
 * Page/Grid/Block; op een telefoon is het dezelfde lijst, smaller.
 */
import { useCallback, useEffect, useState } from 'react';
import { Page, Grid, Block } from '@/presentation/components/surface/Page';
import { laadDevices, type DeviceOverzicht } from '@/infrastructure/gateways/axeDeviceService';
import { isOnline, tijdGeleden, type AxeDevice } from '@/domain/axeDevices';

const TONE = {
  ok: 'var(--success)',
  err: 'var(--error)',
  muted: 'var(--text-muted)',
} as const;

function Dot({ online }: { online: boolean }) {
  return (
    <span
      className="inline-block flex-none rounded-full"
      style={{ width: 6, height: 6, background: online ? TONE.ok : TONE.err }}
    />
  );
}

function rol(d: AxeDevice): string {
  if (d.device_type === 'server') return 'Server · AXE API · terminal';
  if (d.device_type === 'mobile') return 'Android · remote client';
  if (d.capabilities.includes('local_runtime')) return 'Desktop runtime · local services';
  return 'Desktop client';
}

function DeviceRow({ d }: { d: AxeDevice }) {
  const online = isOnline(d.last_seen);
  return (
    <div className="flex w-full items-start gap-3 rounded-card px-2 py-2">
      <span className="mt-1.5"><Dot online={online} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <b className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {d.device_name}
          </b>
          {d.ditToestel && (
            <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--accent-cyan)' }}>
              this device
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {rol(d)}
        </span>
        <span className="mt-0.5 block font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {d.platform} · {d.device_id}
        </span>
        {d.capabilities.length > 0 && (
          <span className="mt-0.5 block font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {d.capabilities.join(' · ')}
          </span>
        )}
      </span>
      <span className="mt-0.5 flex flex-col items-end gap-1">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: online ? TONE.ok : TONE.err,
            background: `color-mix(in srgb, ${online ? TONE.ok : TONE.err} 12%, transparent)`,
          }}
        >
          {online ? 'Online' : 'Offline'}
        </span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {tijdGeleden(d.last_seen)}
        </span>
      </span>
    </div>
  );
}

export default function AxeDevicesPage() {
  const [overzicht, setOverzicht] = useState<DeviceOverzicht | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    setBezig(true);
    try {
      const o = await laadDevices();
      setOverzicht(o);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }, []);

  useEffect(() => { void laad(); }, [laad]);

  const devices = overzicht?.devices ?? [];
  const online = devices.filter(d => isOnline(d.last_seen)).length;

  return (
    <Page
      title="Devices"
      subtitle="AXE installations. Online is last seen, not a stored flag."
      actions={
        <button
          type="button"
          onClick={() => void laad()}
          disabled={bezig}
          className="text-[11px] opacity-70 hover:opacity-100 disabled:opacity-40"
        >
          {bezig ? 'Measuring…' : 'Refresh'}
        </button>
      }
    >
      <Grid>
        <Block span={4} title="Installations">
          <p className="mb-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            {devices.length === 0
              ? (bezig ? 'Measuring…' : 'No measured devices yet.')
              : `${online} online · ${devices.length} known`}
          </p>
          {overzicht?.tabelFout && (
            <p className="mb-2 text-[11px]" style={{ color: 'var(--warning)' }}>
              Installations table unavailable — {overzicht.tabelFout}. Showing this device, workers and VPS health only.
            </p>
          )}
          {fout && (
            <p className="mb-2 text-[11px]" style={{ color: TONE.err }}>{fout}</p>
          )}
          {devices.length === 0 && !bezig ? (
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing measured.</p>
          ) : (
            <div className="flex flex-col">
              {devices.map(d => <DeviceRow key={`${d.bron}:${d.device_id}`} d={d} />)}
            </div>
          )}
        </Block>
      </Grid>
    </Page>
  );
}
