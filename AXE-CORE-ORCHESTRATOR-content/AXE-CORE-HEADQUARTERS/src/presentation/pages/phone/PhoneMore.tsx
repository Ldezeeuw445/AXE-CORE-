import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getAllNavItems } from '@/domain/navRegistry';
import { groupMenu, menuTarget, searchMenu } from '@/domain/mobileMenu';
import {
  DEFAULT_PHONE_PINS, MORE_APPS, leesPhonePins, pinNaarBalk, unpinVanBalk,
} from '@/domain/phone/phonePins';
import { PhoneKaart, PhoneKop } from '@/presentation/pages/phone/phoneUi';

export default function PhoneMore() {
  const navigate = useNavigate();
  const [pins, setPins] = useState(() => leesPhonePins());
  const [q, setQ] = useState('');
  const items = getAllNavItems();
  const groepen = useMemo(() => {
    const gevonden = searchMenu(items, q);
    return groupMenu(gevonden, []);
  }, [items, q]);

  const pinPad = new Set(pins.map((p) => p.path));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-1" data-axe-more>
      <PhoneKop title="Apps" />
      <p className="mb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Long-press to pin to the bar. Max 4 + More.
      </p>
      <div className="grid grid-cols-3 gap-2.5 pb-3" data-axe-appgrid>
        {MORE_APPS.map((app) => (
          <button
            key={app.id}
            type="button"
            data-axe-app={app.id}
            onClick={() => navigate(app.path)}
            onContextMenu={(e) => {
              e.preventDefault();
              const next = pinPad.has(app.path)
                ? unpinVanBalk(pins, app.path)
                : pinNaarBalk(pins, app.path);
              setPins(next);
            }}
            className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-[18px] text-[11px] font-semibold"
            style={{
              background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
              border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.1))',
              borderTopColor: 'var(--axe-kaart-lijn-boven, rgba(255,255,255,.16))',
              color: 'var(--text-primary)',
            }}
          >
            <span>{app.label}</span>
            {pinPad.has(app.path) && <span className="text-[9px]" style={{ color: '#22d3ee' }}>pinned</span>}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search every tab"
        className="mb-2 min-h-[44px] w-full rounded-[14px] px-3 text-[13px]"
        style={{
          background: 'var(--axe-kaart-vlak, rgba(14,17,23,.82))',
          border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,.1))',
          color: 'var(--text-primary)',
        }}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {groepen.groups.map((g) => (
          <PhoneKaart key={g.id} kicker={g.title}>
            {g.items.filter((it) => !DEFAULT_PHONE_PINS.some((p) => p.path === it.path)).map((it) => (
              <button
                key={it.path}
                type="button"
                onClick={() => navigate(menuTarget(it.path))}
                className="flex min-h-[44px] w-full items-center text-left text-[13px] font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {it.label}
              </button>
            ))}
          </PhoneKaart>
        ))}
      </div>
    </div>
  );
}
