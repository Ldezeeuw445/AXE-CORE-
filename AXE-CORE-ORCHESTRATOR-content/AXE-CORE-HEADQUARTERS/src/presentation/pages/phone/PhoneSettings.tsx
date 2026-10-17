import { Moon, Sun } from 'lucide-react';
import { useLook } from '@/presentation/hooks/useLook';
import { useGlassTuning, setGlassTuning } from '@/presentation/hooks/useWallpaper';
import { MAX_DIM } from '@/domain/wallpaper';
import { PhoneKaart, PhoneKop } from '@/presentation/pages/phone/phoneUi';

export default function PhoneSettings() {
  const [look, setLook] = useLook();
  const tuning = useGlassTuning();
  const stand = look === 'glass' ? 'glass' : 'black';

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-auto px-1" data-axe-phone-app="settings">
      <PhoneKop title="Settings" />
      <PhoneKaart kicker="Look">
        <div className="grid grid-cols-2 gap-2">
          {([['black', 'Dark', Moon], ['glass', 'Light', Sun]] as const).map(([id, name, Icon]) => (
            <button
              key={id}
              type="button"
              data-axe-look={id}
              onClick={() => setLook(id)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] text-[13px] font-medium"
              style={{
                border: `1px solid ${look === id ? '#22D3EE' : 'var(--axe-kaart-lijn, rgba(255,255,255,.08))'}`,
                color: look === id ? '#67E8F9' : 'var(--text-primary)',
              }}
            >
              <Icon size={15} /> {name}
            </button>
          ))}
        </div>
      </PhoneKaart>
      <PhoneKaart kicker={`Transparency · ${stand === 'glass' ? 'light' : 'dark'}`}>
        <label className="block">
          <div className="mb-1 flex justify-between text-[12px]">
            <span>Dim</span>
            <span style={{ color: 'var(--text-muted)' }}>{Math.round(tuning.dim * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={MAX_DIM}
            step={0.01}
            value={tuning.dim}
            data-axe-dim
            onChange={(e) => setGlassTuning(stand, { dim: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: '#22D3EE' }}
          />
        </label>
        <label className="mt-3 block">
          <div className="mb-1 flex justify-between text-[12px]">
            <span>Blur</span>
            <span style={{ color: 'var(--text-muted)' }}>{Math.round(tuning.blur)}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={tuning.blur}
            data-axe-blur
            onChange={(e) => setGlassTuning(stand, { blur: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: '#22D3EE' }}
          />
        </label>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Saved per mode (`axe_wp_dim_black` / `axe_wp_dim_glass`). Mic never auto-starts.
        </p>
      </PhoneKaart>
    </div>
  );
}
