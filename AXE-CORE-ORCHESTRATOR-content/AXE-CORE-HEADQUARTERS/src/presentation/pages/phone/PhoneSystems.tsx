import { useEffect, useState } from 'react';
import { isOnline, type AxeDevice } from '@/domain/axeDevices';
import { laadDevices } from '@/infrastructure/gateways/axeDeviceService';
import { PhoneKaart, PhoneKop, PhoneRij } from '@/presentation/pages/phone/phoneUi';

export default function PhoneSystems() {
  const [devices, setDevices] = useState<AxeDevice[]>([]);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    void laadDevices().then((o) => {
      if (weg) return;
      setDevices(o.devices);
      setFout(o.tabelFout);
    }).catch((e) => { if (!weg) setFout(e instanceof Error ? e.message : String(e)); });
    return () => { weg = true; };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-auto px-1" data-axe-phone-app="systems">
      <PhoneKop title="Systems" />
      {fout && <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{fout}</p>}
      {devices.map((d) => (
        <PhoneKaart key={d.device_id} kicker={d.device_type}>
          <PhoneRij
            title={d.device_name}
            sub={`${d.platform} · ${isOnline(d.last_seen) ? 'online' : 'stale'} · ${d.bron}`}
            extra={<span className="text-[11px]" style={{ color: isOnline(d.last_seen) ? '#34d399' : 'var(--text-muted)' }}>{isOnline(d.last_seen) ? 'live' : 'off'}</span>}
          />
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {d.capabilities.join(' · ') || 'no capabilities recorded'}
          </p>
        </PhoneKaart>
      ))}
      {devices.length === 0 && !fout && (
        <PhoneKaart><div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No devices measured yet.</div></PhoneKaart>
      )}
      <p className="px-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Remote wake / restart stays on desktop confirmation. This phone does not load models or open SSH.
      </p>
    </div>
  );
}
