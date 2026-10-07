/**
 * The two panels behind the menu: Appearance (how the glass looks) and Phone (what the
 * lock screen shows). Both are bottom sheets over a *transparent* backdrop on purpose:
 * you are changing how the app looks, so the app has to stay visible behind the sheet
 * and change while your thumb is still on the slider.
 */
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Sun, Moon, X, ImagePlus, RotateCcw, Smartphone, ShieldCheck, Home } from 'lucide-react';
import { useLook } from '@/presentation/hooks/useLook';
import {
  useWallpaper, useGlassTuning, setWallpaperPreset, clearWallpaper, setGlassTuning,
  setWallpaperFromFile,
} from '@/presentation/hooks/useWallpaper';
import { WALLPAPER_PRESETS, DEFAULT_TUNING } from '@/domain/wallpaper';
import {
  readLockCards, writeLockCard, readDeviceOwner, openPhoneHome,
  type LockCardSetting,
} from '@/infrastructure/gateways/androidPhoneBridge';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[95]" style={{ pointerEvents: 'none' }}>
      {/* Tap outside closes; no dimming, so the effect of a change stays visible. */}
      <div className="absolute inset-0" style={{ pointerEvents: 'auto' }} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex max-h-[68%] flex-col"
        style={{
          pointerEvents: 'auto',
          background: 'linear-gradient(180deg, rgba(24,24,29,.97), rgba(12,12,15,.99))',
          borderTop: '1px solid rgba(255,255,255,.12)',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -18px 50px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)',
          paddingBottom: 'max(14px, var(--axe-sab))',
        }}
      >
        <div className="flex flex-none items-center justify-between px-5 pb-1 pt-4">
          <span className="text-[15px] font-semibold" style={{ color: '#EEF3FA' }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-full" style={{ color: '#9CA3AF', background: 'rgba(255,255,255,.06)' }}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#6B7280' }}>{children}</div>;
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 flex justify-between text-[12px]" style={{ color: '#C7CEDA' }}>
        <span>{label}</span><span style={{ color: '#6B7280' }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: '#22D3EE' }}
      />
    </label>
  );
}

export function AppearanceSheet({ onClose }: { onClose: () => void }) {
  const [look, setLook] = useLook();
  const wallpaper = useWallpaper();
  const tuning = useGlassTuning();
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setError(null);
    try { await setWallpaperFromFile(f); } catch (err) { setError(err instanceof Error ? err.message : 'Could not use that photo.'); }
    setBusy(false);
  };

  const activeId = wallpaper.kind === 'preset' ? wallpaper.preset.id : wallpaper.kind === 'photo' ? 'photo' : 'none';

  return (
    <Sheet title="Appearance" onClose={onClose}>
      <Label>Mode</Label>
      <div className="grid grid-cols-2 gap-2">
        {([['black', 'Dark', Moon], ['glass', 'Light', Sun]] as const).map(([id, name, Icon]) => (
          <button
            key={id} type="button" onClick={() => setLook(id)}
            className="flex items-center justify-center gap-2 rounded-[14px] py-3 text-[13px] font-medium"
            style={{
              // Selection is colour AND weight, never a coloured box (law 10).
              background: look === id ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)',
              border: `1px solid ${look === id ? '#22D3EE' : 'rgba(255,255,255,.08)'}`,
              color: look === id ? '#67E8F9' : '#C7CEDA',
              fontWeight: look === id ? 650 : 500,
            }}
          >
            <Icon size={15} /> {name}
          </button>
        ))}
      </div>

      <Label>Wallpaper</Label>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button" onClick={clearWallpaper} aria-label="No wallpaper"
          className="flex aspect-[3/4] flex-col items-center justify-end rounded-[12px] pb-1.5 text-[10px]"
          style={{
            background: look === 'glass' ? 'linear-gradient(180deg,#98bcdd,#2c4160 70%,#000)' : '#000',
            border: `1.5px solid ${activeId === 'none' ? '#22D3EE' : 'rgba(255,255,255,.1)'}`,
            color: '#E5E7EB',
          }}
        >Plain</button>
        {WALLPAPER_PRESETS.map(p => (
          <button
            key={p.id} type="button" onClick={() => setWallpaperPreset(p.id)} aria-label={p.label}
            className="flex aspect-[3/4] flex-col items-center justify-end rounded-[12px] pb-1.5 text-[10px] font-medium"
            style={{ background: p.css, border: `1.5px solid ${activeId === p.id ? '#22D3EE' : 'rgba(255,255,255,.1)'}`, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.7)' }}
          >{p.label}</button>
        ))}
        <button
          type="button" onClick={() => file.current?.click()} disabled={busy} aria-label="Choose a photo"
          className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-[12px] text-[10px]"
          style={{
            background: wallpaper.kind === 'photo' ? `url("${wallpaper.dataUrl}") center / cover` : 'rgba(255,255,255,.05)',
            border: `1.5px solid ${activeId === 'photo' ? '#22D3EE' : 'rgba(255,255,255,.14)'}`,
            borderStyle: wallpaper.kind === 'photo' ? 'solid' : 'dashed',
            color: '#E5E7EB', textShadow: wallpaper.kind === 'photo' ? '0 1px 4px rgba(0,0,0,.8)' : undefined,
          }}
        >
          <ImagePlus size={16} />{busy ? 'Working…' : 'Photo'}
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
      {error && <div className="mt-2 text-[12px]" style={{ color: '#F59E0B' }}>{error}</div>}

      <Label>Glass</Label>
      <Slider
        label="Frosting" value={tuning.blur} min={0} max={80} step={1} format={v => `${v}`}
        onChange={v => setGlassTuning({ blur: v })}
      />
      <Slider
        label="Dimming" value={tuning.dim} min={0} max={0.85} step={0.01} format={v => `${Math.round(v * 100)}%`}
        onChange={v => setGlassTuning({ dim: v })}
      />
      <button
        type="button" onClick={() => { clearWallpaper(); setGlassTuning(DEFAULT_TUNING); }}
        className="mb-2 mt-1 flex items-center gap-2 text-[12px]" style={{ color: '#9CA3AF' }}
      >
        <RotateCcw size={13} /> Reset appearance
      </button>
      <div className="pb-2 text-[11px] leading-snug" style={{ color: '#6B7280' }}>
        Dark and Light are the same glass as the desktop app. The wallpaper stays on this phone.
      </div>
    </Sheet>
  );
}

export function PhoneSheet({ onClose, onOpenDevice }: { onClose: () => void; onOpenDevice: () => void }) {
  // Read when the panel opens (it mounts only then), not in an effect: the bridge call
  // is a synchronous hop into the shell, so there is nothing to wait for.
  const [cards, setCards] = useState<LockCardSetting[]>(readLockCards);
  const [owner] = useState(readDeviceOwner);

  const toggle = (c: LockCardSetting) => {
    writeLockCard(c.id, !c.on);
    // Re-read rather than flip locally: if the phone refused, the switch must say so.
    setCards(readLockCards());
  };

  return (
    <Sheet title="Phone" onClose={onClose}>
      <div className="flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-[12px]" style={{ background: 'rgba(255,255,255,.05)', color: '#C7CEDA' }}>
        <ShieldCheck size={15} style={{ color: owner ? '#34D399' : '#F59E0B' }} />
        {owner
          ? 'AXE CORE is the device manager of this phone.'
          : 'AXE CORE is not the device manager here: apps ask for confirmation to install.'}
      </div>

      <Label>Lock screen shows</Label>
      {cards.length === 0 && (
        <div className="text-[12px]" style={{ color: '#6B7280' }}>The phone did not answer. Close and reopen this panel.</div>
      )}
      {cards.map(c => (
        <button
          key={c.id} type="button" onClick={() => toggle(c)} role="switch" aria-checked={c.on}
          className="mb-1.5 flex w-full items-center justify-between rounded-[14px] px-3.5 py-3 text-left text-[13px]"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', color: '#E5E7EB' }}
        >
          <span style={{ color: c.on ? '#67E8F9' : '#9CA3AF', fontWeight: c.on ? 600 : 500 }}>{c.label}</span>
          {/* A light track when on, a dark one when off: the state is carried by the
              label's colour and the knob's side, not by a coloured fill. */}
          <span
            className="relative h-[22px] w-[38px] rounded-full transition-colors"
            style={{ background: c.on ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.14)' }}
          >
            <span
              className="absolute top-[2px] size-[18px] rounded-full transition-all"
              style={{ left: c.on ? 18 : 2, background: c.on ? '#0b0d12' : '#fff' }}
            />
          </span>
        </button>
      ))}
      <div className="mt-1 text-[11px]" style={{ color: '#6B7280' }}>Changes show the next time the screen wakes.</div>

      <Label>Device</Label>
      <button
        type="button" onClick={() => { onOpenDevice(); onClose(); }}
        className="mb-1.5 flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[13px]"
        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', color: '#E5E7EB' }}
      >
        <Smartphone size={16} /> Device manager
      </button>
      <button
        type="button" onClick={() => openPhoneHome()}
        className="mb-2 flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[13px]"
        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', color: '#E5E7EB' }}
      >
        <Home size={16} /> Phone home screen
      </button>
    </Sheet>
  );
}

