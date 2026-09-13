/**
 * LockScreen — het AXE-glansscherm: klok, wat er wacht, algo, en de composer.
 *
 * Dit is de inhoud die je op de Samsung als eerste ziet: één rustig scherm dat
 * de vraag "waar moet ik nu naar kijken?" beantwoordt zonder de hele app te
 * openen. De native widget (later, in de Android-shell) toont straks precies
 * deze inhoud via een WebView — daarom leeft hij hier, als web-surface, en niet
 * als tweede werkelijkheid.
 *
 * ## Alles op tokens, dus licht én donker
 *
 * Geen enkele kleur staat hier hard: achtergrond, tekst en kaarten lezen uit
 * `--bg-base`, `--text-*` en `--surface-bg`. De look-laag (applyStoredLookEarly)
 * zet die op :root, dus dit scherm volgt de licht/donker-stand van de Tauri-app
 * zonder eigen schakelaar — precies wat gevraagd is.
 *
 * ## Eén inhoud, twee maten
 *
 * `LockScreenContent` draagt de secties; de volledige `/lock`-route rendert hem
 * groot, de Device Manager rendert hem `compact` als preview. Zo kan er niet
 * één versie mooi zijn en de andere achterlopen.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Clock, ListChecks, TrendingUp, MessageSquare, Smartphone, LineChart,
  ArrowUpRight, CheckCircle2, Send,
} from 'lucide-react';
import { getAwarenessSnapshot, type AwarenessSnapshot } from '@/application/awareness/axeAwareness';
import { useAxeAlgoAccountSnapshot } from '@/presentation/hooks/useAxeAlgoAccountSnapshot';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { MobileGlass, LookToggle } from '@/presentation/components/layout/MobileGlass';
import { usePlaatInk } from '@/presentation/hooks/usePlaatInk';

/** Tikkende klok. Eén interval, opgeruimd bij unmount. */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const TIME_FMT = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
const DATE_FMT = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

function money(n: number | null, currency: string | null): string {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n)}`;
  }
}

/**
 * Frosted matglas voor de telefoon: half-doorzichtig gerookt glas met een echte
 * backdrop-blur, zodat de gekleurde vlekken van de plaat er zacht doorheen
 * vervagen. Op de Mac doet het native glas dit; hier benaderen we het. Donker
 * in beide standen (gerookt glas), lichte inkt erop — de AXE-regel.
 */
const FROSTED = {
  background: 'rgba(14,17,23,0.74)',
  backdropFilter: 'blur(26px) saturate(160%)',
  WebkitBackdropFilter: 'blur(26px) saturate(160%)',
  border: '1px solid rgba(255,255,255,0.10)',
} as const;

/** Eén kaart — frosted matglas op de plaat. */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[var(--radius,18px)] p-4 ${className}`}
      style={{ ...FROSTED, boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
    >
      {children}
    </div>
  );
}

export function LockScreenContent({ compact = false, children }: { compact?: boolean; children?: React.ReactNode }) {
  const navigate = useNavigate();
  const now = useClock();
  const [aware, setAware] = useState<AwarenessSnapshot | null>(null);
  const algo = useAxeAlgoAccountSnapshot(compact ? 60_000 : 20_000);
  const sendMessage = useVoiceStore((s) => s.sendMessage);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => { void getAwarenessSnapshot().then((s) => { if (alive) setAware(s); }).catch(() => {}); };
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const waiting = (aware?.openTasks ?? 0) + (aware?.followUps ?? 0);
  const allClear = aware != null && waiting === 0;

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    void sendMessage(text).catch(() => {});
    setDraft('');
    navigate('/'); // naar de chatplaat, waar het antwoord verschijnt
  }, [draft, sendMessage, navigate]);

  const timeSize = compact ? 'text-4xl' : 'text-7xl sm:text-8xl';
  // Klok/datum liggen direct op de plaat (niet op een kaart), dus hun inkt
  // schakelt mee met licht/donker. In compact staat de glance op een donkere
  // kaart en geldt de gewone lichte inkt.
  const plaat = usePlaatInk();
  const inkOnPlaat = compact ? 'var(--text-primary)' : plaat.ink;
  const mutedOnPlaat = compact ? 'var(--text-muted)' : plaat.muted;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'space-y-3' : 'space-y-5 px-2 pt-2'}`}>
        {/* Zon/maan rechtsboven — op mobiel is er geen topbalk om te wisselen. */}
        {!compact && (
          <div className="flex justify-end">
            <LookToggle />
          </div>
        )}
        {/* Klok + agenda */}
        <div className={compact ? '' : 'text-center'}>
          <div className={`font-semibold tabular-nums leading-none tracking-tight ${timeSize}`} style={{ color: inkOnPlaat }}>
            {TIME_FMT.format(now)}
          </div>
          <div className={`mt-1.5 ${compact ? 'text-[12px]' : 'text-sm'} capitalize`} style={{ color: mutedOnPlaat }}>
            {DATE_FMT.format(now)}
          </div>
          {!compact && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[12px]" style={{ color: mutedOnPlaat }}>
              <Clock size={13} />
              {aware?.alerts?.length ? aware.alerts[0] : 'Niets dringend gepland'}
            </div>
          )}
        </div>

        {/* Wat wacht */}
        <Card>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>
            <ListChecks size={14} /> Wat wacht
          </div>
          {allClear ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={16} /> Alles rustig
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
              <span><b className="tabular-nums">{aware?.openTasks ?? '—'}</b> <span style={{ color: 'var(--text-muted)' }}>open taken</span></span>
              <span style={{ color: (aware?.overdueTasks ?? 0) > 0 ? 'var(--warning)' : undefined }}>
                <b className="tabular-nums">{aware?.overdueTasks ?? 0}</b> <span style={{ color: (aware?.overdueTasks ?? 0) > 0 ? undefined : 'var(--text-muted)' }}>over tijd</span>
              </span>
              <span><b className="tabular-nums">{aware?.followUps ?? 0}</b> <span style={{ color: 'var(--text-muted)' }}>follow-ups</span></span>
            </div>
          )}
        </Card>

        {/* AXE Algo / trading */}
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>
              <TrendingUp size={14} /> AXE Algo
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: algo.isReal ? 'var(--success)' : 'var(--text-muted)' }}>
              {algo.loading ? '…' : algo.isReal ? 'live' : 'paper'}
            </span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {money(algo.equity, algo.currency)}
            </div>
            <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {algo.positions.length} {algo.positions.length === 1 ? 'positie' : 'posities'}
            </div>
          </div>
        </Card>

        {/* Snelacties — kleur in de letters, geen gevulde pillen */}
        <div className="grid grid-cols-3 gap-2">
          <QuickAction icon={MessageSquare} label="Chat" onClick={() => navigate('/')} />
          <QuickAction icon={LineChart} label="Trading" onClick={() => navigate('/trading-intel')} />
          <QuickAction icon={Smartphone} label="Device" onClick={() => navigate('/device')} />
        </div>

        {/* Extra secties (bv. de app-grid van de mobiele home) hangen hier,
            binnen dezelfde scroll, boven de composer. */}
        {children}
      </div>

      {/* Composer onderin — zelfde pil-stijl als de app (axe-composer). Op de
          compacte glance (in de Device Manager) laten we hem weg; die hoort op
          het volledige scherm. */}
      {!compact && (
      <div className="axe-composer flex-shrink-0 px-2.5 py-2.5">
        <div className="axe-gemini-shell">
          <div className="axe-gemini-inner flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Vraag AXE iets…"
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Verstuur"
              className="flex size-8 flex-none items-center justify-center rounded-full disabled:opacity-40"
              style={{ background: 'var(--accent, #38bdf8)', color: '#001018' }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof MessageSquare; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-[14px] py-3 text-[12px] font-medium transition-opacity active:opacity-70"
      style={{ ...FROSTED, color: 'var(--text-primary)' }}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

/** Compacte glance voor de Device Manager, met een knop naar het volledige scherm. */
export function LockScreenGlance() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>Lock Screen</h2>
        <button
          type="button"
          onClick={() => navigate('/lock')}
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: 'var(--accent, #38bdf8)' }}
        >
          Open <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <LockScreenContent compact />
      </div>
    </div>
  );
}

export default function LockScreen() {
  // Geen eigen achtergrond: de plaat eronder levert de licht/donker-look (regel
  // 1 van UI-MAATSTAF). De schil rendert /lock als command-surface, dus dit
  // vult de hele viewport zonder chrome.
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MobileGlass />
      <div className="relative z-[1] mx-auto flex h-full w-full max-w-md flex-col px-4 pb-4 pt-2">
        <LockScreenContent />
      </div>
    </div>
  );
}
