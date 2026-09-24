/**
 * DeviceManager — de Samsung A17, als iets wat je kunt zien en aanraken.
 *
 * Eén SVG met `viewBox` gelijk aan de device-pixels draagt het scherm: een
 * klik erin ís een device-coördinaat, ongeacht hoe groot het frame op de plaat
 * staat, en dat geldt even hard voor het echte toestel als voor het nep-toestel.
 * Zo tekent en bedient het paneel beide langs precies dezelfde weg — geen
 * tweede werkelijkheid die alleen in demo klopt.
 *
 * Kijken (screenshot, ui_dump) loopt vanzelf; bewegen (tap, key, launch) gebeurt
 * pas als jij een knop of het scherm aanraakt. Die aanraking ís de goedkeuring.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Smartphone, RefreshCw, Play, Pause, Home, ChevronLeft, LayoutGrid,
  ArrowUp, Search, ExternalLink, ShieldCheck, WifiOff,
} from 'lucide-react';
import {
  phoneDevices, phoneLook, phoneDo, phoneBridgeAvailable,
  isPhoneDemo, setPhoneDemo, isA17Model,
  type PhoneElement, type PhoneDevice,
} from '@/infrastructure/gateways/phoneBridgeService';
import { A17_SCREEN } from '@/domain/phone/a17';
import { LockScreenGlance } from '@/presentation/pages/LockScreen';

/** "Physical size: 1080x2340" → {w,h}. Valt terug op de A17-maat. */
function parseSize(stdout: string | undefined): { w: number; h: number } {
  const m = /(\d{3,5})\s*x\s*(\d{3,5})/.exec(stdout ?? '');
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: A17_SCREEN.width, h: A17_SCREEN.height };
}

/** Een knop waarvan de kleur in de letters zit, niet in een vlak. */
function Key({
  icon: Icon, label, onClick, disabled, tone,
}: {
  icon: typeof Home;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-[12px] px-3 py-2 text-[12px] font-medium transition-opacity disabled:opacity-40"
      style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: tone ?? 'var(--text-primary)' }}
    >
      <Icon size={15} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

export default function DeviceManager() {
  const [demo, setDemo] = useState(isPhoneDemo());
  const [available, setAvailable] = useState(phoneBridgeAvailable());
  const [device, setDevice] = useState<PhoneDevice | null>(null);
  const [ignored, setIgnored] = useState<PhoneDevice[]>([]);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: A17_SCREEN.width, h: A17_SCREEN.height });
  const [elements, setElements] = useState<PhoneElement[]>([]);
  const [png, setPng] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [pkg, setPkg] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const pinned = isA17Model(device?.model);

  /** Vraag adb (of de demo) welke toestellen er zijn, en welke de A17 is. */
  const loadDevice = useCallback(async () => {
    try {
      const { devices } = await phoneDevices();
      const usable = devices.filter(d => d.state === 'device');
      const a17 = usable.find(d => isA17Model(d.model)) ?? null;
      setDevice(a17);
      setIgnored(usable.filter(d => !isA17Model(d.model)));
      if (a17) {
        const size = await phoneLook('screen_size', a17.serial).catch(() => null);
        if (size?.stdout) setDims(parseSize(size.stdout));
      }
      return a17;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  /** Lees het scherm: de tikbare elementen, en (op een echt toestel) de foto. */
  const refreshScreen = useCallback(async (serial?: string) => {
    try {
      const dump = await phoneLook('ui_dump', serial);
      setElements(dump.elements ?? []);
      if (!isPhoneDemo()) {
        const shot = await phoneLook('screenshot', serial).catch(() => null);
        if (shot?.png) setPng(shot.png);
      } else {
        setPng(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Bij openen en bij het omzetten van de demo-schakelaar: opnieuw verbinden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a17 = await loadDevice();
      if (!cancelled && a17) await refreshScreen(a17.serial);
    })();
    return () => { cancelled = true; };
  }, [demo, loadDevice, refreshScreen]);

  // Kijken loopt vanzelf. Elke 1,5 s verversen zolang "Live" aanstaat.
  useEffect(() => {
    if (!live || !device) return;
    const id = setInterval(() => { void refreshScreen(device.serial); }, 1500);
    return () => clearInterval(id);
  }, [live, device, refreshScreen]);

  /** Een tik/veeg/toets, en meteen daarna het scherm opnieuw lezen. */
  const act = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    if (!device) return;
    setBusy(true);
    try {
      await phoneDo(action as never, params, device.serial);
      await refreshScreen(device.serial);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [device, refreshScreen]);

  /** Klik in het scherm → device-coördinaat → tik daar. */
  const onScreenClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !device) return;
    const r = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * dims.w);
    const y = Math.round(((e.clientY - r.top) / r.height) * dims.h);
    void act('tap', { x, y });
  }, [act, device, dims]);

  const toggleDemo = () => {
    const next = !demo;
    setPhoneDemo(next);
    setDemo(next);
    setAvailable(phoneBridgeAvailable());
    setDevice(null);
    setElements([]);
    setPng(null);
    setError(null);
  };

  return (
    <div className="axe-tabruimte flex min-h-0 flex-1 flex-col pt-4 sm:pt-5">
      {/* Kop — op smalle schermen wrappen de knoppen onder de titel. */}
      <header className="flex flex-none flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            <Smartphone size={18} />
            Device Manager
          </h1>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {device
              ? `${device.model ?? device.serial} · ${device.serial}`
              : available ? 'Looking for the Samsung A17…' : 'No bridge, no demo — nothing to drive'}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() => setLive(v => !v)}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-[12px] font-medium"
            style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: live ? 'var(--success)' : 'var(--text-muted)' }}
          >
            {live ? <Pause size={14} /> : <Play size={14} />}
            {live ? 'Live' : 'Paused'}
          </button>
          <button
            type="button"
            onClick={() => { void loadDevice().then(a => a && refreshScreen(a.serial)); }}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-[12px] font-medium"
            style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={toggleDemo}
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-[12px] font-medium"
            style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: demo ? 'var(--accent, #7dd3fc)' : 'var(--text-muted)' }}
          >
            Demo A17
          </button>
        </div>
      </header>

      {/* Lijf: op de telefoon stapelt het toestel boven de bediening (gewoon
          blok dat scrollt — een flex-kolom zou de kinderen krimpen en het
          scherm over de bediening trekken); vanaf lg staan ze naast elkaar.
          Dezelfde UI, alleen slim herschikt. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6 lg:grid lg:space-y-0 lg:gap-3 lg:[grid-template-columns:minmax(280px,360px)_1fr]">
        {/* Toestelframe */}
        <div className="flex min-h-0 flex-col items-center">
          <div
            className="relative w-full"
            style={{ maxWidth: 340, borderRadius: 34, padding: 10, background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--axe-lift, none)' }}
          >
            {/* De SVG bepaalt zijn eigen hoogte uit de viewBox (width:100%,
                height:auto). aspect-ratio op de container reserveert in een
                flex-kolom geen hoogte, waardoor het scherm over de bediening
                heen viel — dit niet. */}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              onClick={device ? onScreenClick : undefined}
              style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 26, background: '#05070a', cursor: device ? 'crosshair' : 'default' }}
            >
              {/* Echte foto als achtergrond; in demo blijft het scherm het draadbeeld. */}
              {png && !demo && <image href={`data:image/png;base64,${png}`} x={0} y={0} width={dims.w} height={dims.h} preserveAspectRatio="xMidYMid slice" />}
              {(demo || showBoxes) && elements.map((el, i) => {
                const w = el.w ?? 220;
                const h = el.h ?? 120;
                const x = el.x - w / 2;
                const y = el.y - h / 2;
                const isField = el.editable;
                const stroke = isField ? '#7dd3fc' : el.tap ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={w} height={h} rx={16} fill={demo ? 'rgba(255,255,255,0.03)' : 'transparent'} stroke={stroke} strokeWidth={3} />
                    {demo && el.label && (
                      <text
                        x={el.x} y={el.y + 12} textAnchor="middle"
                        fontSize={34} fill={isField ? '#7dd3fc' : 'rgba(255,255,255,0.82)'}
                        style={{ pointerEvents: 'none' }}
                      >
                        {el.label.length > 22 ? `${el.label.slice(0, 21)}…` : el.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {!device && (
                <text x={dims.w / 2} y={dims.h / 2} textAnchor="middle" fontSize={40} fill="rgba(255,255,255,0.4)">
                  {available ? 'connecting…' : 'no device'}
                </text>
              )}
            </svg>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={showBoxes} onChange={e => setShowBoxes(e.target.checked)} />
            Show tappable elements
          </label>
        </div>

        {/* Bediening + info */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* Toestand */}
          <section className="rounded-[var(--radius,16px)] p-4" style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
              <span className="flex items-center gap-1.5" style={{ color: pinned ? 'var(--success)' : 'var(--warning)' }}>
                <ShieldCheck size={14} />
                {pinned ? 'Pinned to A17' : 'A17 not connected'}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>Model <b style={{ color: 'var(--text-primary)' }}>{device?.model ?? '—'}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>Serial <b style={{ color: 'var(--text-primary)' }}>{device?.serial ?? '—'}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>{dims.w}×{dims.h}</span>
              <span style={{ color: 'var(--text-muted)' }}>{demo ? 'demo device' : 'live bridge'}</span>
            </div>
            {ignored.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--warning)' }}>
                <WifiOff size={12} />
                Ignored (not an A17): {ignored.map(d => d.model ?? d.serial).join(', ')}
              </p>
            )}
            {error && <p className="mt-2 text-[11px]" style={{ color: 'var(--danger, #f87171)' }}>{error}</p>}
          </section>

          {/* Toetsen */}
          <section className="rounded-[var(--radius,16px)] p-4" style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>Controls</h2>
            <div className="flex flex-wrap gap-2">
              <Key icon={Home} label="Home" onClick={() => act('key', { key: 'HOME' })} disabled={!device || busy} />
              <Key icon={ChevronLeft} label="Back" onClick={() => act('key', { key: 'BACK' })} disabled={!device || busy} />
              <Key icon={LayoutGrid} label="Recent" onClick={() => act('key', { key: 'APP_SWITCH' })} disabled={!device || busy} />
              <Key icon={ArrowUp} label="Swipe up" onClick={() => act('swipe', { x1: dims.w / 2, y1: dims.h * 0.8, x2: dims.w / 2, y2: dims.h * 0.25 })} disabled={!device || busy} />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={text} onChange={e => setText(e.target.value)}
                  placeholder="Type into the focused field"
                  className="min-w-0 flex-1 rounded-[12px] px-3 py-2 text-[12px]"
                  style={{ background: 'var(--bg-base, #05070a)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <Key icon={Search} label="Send" onClick={() => { void act('text', { text }); }} disabled={!device || busy || !text} />
              </div>
              <div className="flex gap-2">
                <input
                  value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="min-w-0 flex-1 rounded-[12px] px-3 py-2 text-[12px]"
                  style={{ background: 'var(--bg-base, #05070a)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <Key icon={ExternalLink} label="Open" onClick={() => { void act('open_url', { url }); }} disabled={!device || busy || !url} />
              </div>
              <div className="flex gap-2">
                <input
                  value={pkg} onChange={e => setPkg(e.target.value)}
                  placeholder="com.whatsapp"
                  className="min-w-0 flex-1 rounded-[12px] px-3 py-2 text-[12px]"
                  style={{ background: 'var(--bg-base, #05070a)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <Key icon={Play} label="Launch" onClick={() => { void act('launch', { package: pkg }); }} disabled={!device || busy || !pkg} />
              </div>
            </div>
          </section>

          {/* Wat er op het scherm staat */}
          <section className="flex min-h-0 flex-1 flex-col rounded-[var(--radius,16px)] p-4" style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>
              On screen · {elements.length}
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {elements.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing readable — connect a device or turn on Demo A17.</p>}
              {elements.map((el, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!device || busy}
                  onClick={() => act('tap', el.label ? { label: el.label } : { x: el.x, y: el.y })}
                  className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[12px] disabled:opacity-50"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span
                    className="w-11 flex-none text-[10px] font-semibold uppercase"
                    style={{ color: el.editable ? '#7dd3fc' : el.tap ? 'var(--success)' : 'var(--text-muted)' }}
                  >
                    {el.editable ? 'field' : el.tap ? 'tap' : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{el.label || '(no label)'}</span>
                  <span className="flex-none text-[10px]" style={{ color: 'var(--text-muted)' }}>{el.x},{el.y}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Lock Screen — dezelfde glance als /lock, hier als preview + snelkoppeling. */}
          <section className="rounded-[var(--radius,16px)] p-4" style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)' }}>
            <LockScreenGlance />
          </section>
        </div>
      </div>
    </div>
  );
}
