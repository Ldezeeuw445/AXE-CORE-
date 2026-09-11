import { useMemo, useState } from 'react';
import { IPhoneFrame } from '@/presentation/components/apps/IPhoneFrame';
import { IPhoneAppHost, type IPhoneAppSource } from '@/presentation/components/apps/IPhoneAppHost';
import { AxeButton } from '@/presentation/components/ui/AxeUI';

const DEMO_APPS: { id: string; name: string; color: string; source: IPhoneAppSource }[] = [
  {
    id: 'home',
    name: 'Home',
    color: '#22D3EE',
    source: { kind: 'blank', title: 'AXE', message: 'Kies een app hieronder.' },
  },
  {
    id: 'example',
    name: 'Example',
    color: '#3B82F6',
    source: { kind: 'url', url: 'https://example.com', title: 'Example' },
  },
  {
    id: 'wikipedia',
    name: 'Wiki',
    color: '#F5F0E6',
    source: { kind: 'url', url: 'https://en.m.wikipedia.org/wiki/IPhone', title: 'Wikipedia' },
  },
  {
    id: 'status',
    name: 'Status',
    color: '#10B981',
    source: { kind: 'route', path: 'status', title: 'Status' },
  },
];

/**
 * Auth-free preview of the iPhone host — open via /#/dev-iphone-preview
 * or iphone-demo.html.
 */
export default function IPhoneDemoPage() {
  const [activeId, setActiveId] = useState('example');
  const active = useMemo(
    () => DEMO_APPS.find((a) => a.id === activeId) ?? DEMO_APPS[1],
    [activeId],
  );

  return (
    <div className="min-h-[100dvh] w-full bg-black text-white flex flex-col items-center gap-5 py-6 px-4 overflow-auto">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-400/80 mb-1">AXE Core</p>
        <h1 className="text-[18px] font-semibold text-[#F5F0E6]">iPhone app host — demo</h1>
        <p className="text-[12px] text-white/45 mt-1 max-w-md">
          Klik een app hieronder. Example werkt in de frame; sommige sites blokkeren iframes — dan zie je Open outside.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {DEMO_APPS.filter((a) => a.id !== 'home').map((app) => (
          <AxeButton
            key={app.id}
            size="sm"
            variant={activeId === app.id ? 'primary' : 'secondary'}
            onClick={() => setActiveId(app.id)}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: app.color }}
            />
            {app.name}
          </AxeButton>
        ))}
      </div>

      <IPhoneAppHost size="md" source={active.source} />

      <div className="w-full max-w-[420px]">
        <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 mb-2">Homescreen preview</p>
        <IPhoneFrame size="sm" title="AXE">
          <div
            className="h-full w-full p-4 pt-2"
            style={{
              background:
                'radial-gradient(120% 80% at 50% 0%, rgba(34,211,238,0.18), transparent 55%), #0a0a0c',
            }}
          >
            <p className="text-[12px] text-white/50 mb-3">Apps</p>
            <div className="grid grid-cols-4 gap-3">
              {DEMO_APPS.filter((a) => a.id !== 'home').map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setActiveId(app.id)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className="w-12 h-12 rounded-[14px] flex items-center justify-center text-[13px] font-bold text-black"
                    style={{ background: app.color }}
                  >
                    {app.name[0]}
                  </div>
                  <span className="text-[10px] text-white/70 truncate w-full text-center">{app.name}</span>
                </button>
              ))}
            </div>
          </div>
        </IPhoneFrame>
      </div>
    </div>
  );
}
