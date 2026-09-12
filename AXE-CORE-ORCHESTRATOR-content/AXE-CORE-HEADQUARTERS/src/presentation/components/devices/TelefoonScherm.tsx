/**
 * Wat er op het scherm van de telefoon staat: een beginscherm, of een open
 * app in een iframe. Rendert op 393×852; de schaal zit op .axe-toestel.
 *
 * Het beginscherm is geen iOS-raster met een bolletje erbij. Het is AXE:
 * een levende bol als aanwezigheid, glas eromheen, een vraag onderaan, en
 * chips die een zin zijn in plaats van een icoon. Tegels blijven bestaan —
 * Luka's apps horen erop — maar ze zijn de tweede laag, niet de eerste.
 * Een swipe omhoog op de home-indicator sluit de open app.
 */
import { useEffect, useRef, useState, type ComponentType, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Brain, Calendar, CandlestickChart, CheckSquare, Code2, Database, Globe, Map,
  MessageCircle, Settings, Ship, Smartphone,
} from 'lucide-react';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { useNotifications } from '@/presentation/contexts/NotificationContext';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { isBezig } from '@/presentation/components/layout/zweef/bezig';
import { teller, useGeheugenTotaal } from '@/presentation/components/layout/zweef/geheugenTeller';
import { isSwipeOmhoog } from './gebaar';
import {
  TELEFOON_APPS, TELEFOON_CHIPS, appMetId, appUrl, bewaarOpenApp, laadOpenApp,
  type AppIcoon, type TelefoonApp,
} from './launcher';
import { useTellers } from './telefoonTellers';

const ICONEN: Record<AppIcoon, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  telefoon: Smartphone, grafiek: CandlestickChart, brein: Brain, wereld: Globe, schip: Ship,
  gesprek: MessageCircle, geheugen: Database, code: Code2, taken: CheckSquare, agenda: Calendar,
  instellingen: Settings, kaart: Map,
};

function herkomst() {
  const { origin, pathname, search } = window.location;
  return { origin, pathname, search };
}

function useKlok(): string {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = window.setInterval(() => setT(new Date()), 10_000);
    return () => window.clearInterval(i);
  }, []);
  return t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function Tegel({ app, onOpen, inDok = false }: { app: TelefoonApp; onOpen: (a: TelefoonApp) => void; inDok?: boolean }) {
  const Icoon = ICONEN[app.icoon];
  return (
    <button type="button" className={`axe-tegel${inDok ? ' axe-tegel--dok' : ''}`} onClick={() => onOpen(app)} title={app.soort === 'url' ? app.doel : `#${app.doel}`}>
      <span className="axe-tegel__icoon" style={{ color: app.kleur }}><Icoon size={24} strokeWidth={1.5} /></span>
      {!inDok && <span className="axe-tegel__naam">{app.naam}</span>}
    </button>
  );
}

function Aanwezigheid({ totaal, bezig }: { totaal: number | null; bezig: boolean }) {
  const { openTaken, actieveAgents } = useTellers();
  const { unreadCount } = useNotifications();
  return (
    <section className="axe-aanwezig" aria-label="AXE Core">
      <div className="axe-aanwezig__ringen" aria-hidden>
        <i /><i /><i />
      </div>
      <div className="axe-aanwezig__bol">
        <AxeCoreSphere boost={bezig ? 1 : 0.15} />
      </div>
      <div className="axe-aanwezig__naam">
        <i className={`axe-stip ${bezig ? 'c-warn' : 'c-ok'}`} />
        AXE Core
        <span className={bezig ? 'c-warn' : 'c-ok'}>{bezig ? 'thinking' : 'live'}</span>
      </div>
      <div className="axe-aanwezig__getal">{totaal === null ? '—' : teller(totaal)}</div>
      <div className="axe-aanwezig__label">memories · always with you</div>
      <div className="axe-aanwezig__rij">
        <span><b>{openTaken ?? '—'}</b> open</span>
        <span><b>{unreadCount}</b> new</span>
        <span><b>{actieveAgents ?? '—'}</b> agents</span>
      </div>
    </section>
  );
}

function Vraag({ onChip, onAsk }: { onChip: (app: TelefoonApp) => void; onAsk: () => void }) {
  const [tekst, setTekst] = useState('');
  const stuur = (e: FormEvent) => {
    e.preventDefault();
    onAsk();
    setTekst('');
  };
  return (
    <div className="axe-vraag">
      <form className="axe-vraag__veld" onSubmit={stuur}>
        <input
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          placeholder="Ask AXE anything"
          aria-label="Ask AXE anything"
        />
        <button type="submit" className="axe-glas-knop" title="Ask">→</button>
      </form>
      <div className="axe-vraag__chips">
        {TELEFOON_CHIPS.map((c) => {
          const app = appMetId(c.appId);
          if (!app) return null;
          return (
            <button key={c.id} type="button" className="axe-chip" onClick={() => onChip(app)}>
              {c.tekst}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Beginscherm({ raster, onOpen, onAsk }: { raster: TelefoonApp[]; onOpen: (a: TelefoonApp) => void; onAsk: () => void }) {
  const totaal = useGeheugenTotaal();
  const bezig = useVoiceStore((s) => isBezig(s.voiceStatus));
  return (
    <div className="axe-beginscherm__pagina">
      <Aanwezigheid totaal={totaal} bezig={bezig} />
      <Vraag onChip={onOpen} onAsk={onAsk} />
      <div className="axe-beginscherm__raster">
        {raster.map((a) => <Tegel key={a.id} app={a} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

export function TelefoonScherm({ onApp }: { onApp?: (app: TelefoonApp | null) => void }) {
  const [open, setOpen] = useState<TelefoonApp | null>(() => laadOpenApp(window.localStorage) ?? appMetId('mobile'));
  const klok = useKlok();
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { onApp?.(open); }, [open, onApp]);

  const ga = (app: TelefoonApp | null) => {
    bewaarOpenApp(app, window.localStorage);
    setOpen(app);
  };

  const omlaag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const los = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const van = swipe.current;
    swipe.current = null;
    if (van && isSwipeOmhoog(van, { x: e.clientX, y: e.clientY })) ga(null);
  };

  const raster = TELEFOON_APPS.filter((a) => !a.dok);
  const dok = TELEFOON_APPS.filter((a) => a.dok);
  const mobile = appMetId('mobile');

  return (
    <div className="axe-mobiel" data-app={open?.id ?? 'home'}>
      {open ? (
        <iframe key={open.id} src={appUrl(open, herkomst())} title={open.naam} loading="lazy" allow="clipboard-read; clipboard-write" />
      ) : (
        <div className="axe-beginscherm">
          <div className="axe-beginscherm__status">
            <span>{klok}</span>
            <span className="axe-beginscherm__rechts"><i className="axe-stip c-ok" /> AXE</span>
          </div>
          <Beginscherm raster={raster} onOpen={ga} onAsk={() => mobile && ga(mobile)} />
          <div className="axe-beginscherm__dok axe-ruit">
            {dok.map((a) => <Tegel key={a.id} app={a} onOpen={ga} inDok />)}
          </div>
        </div>
      )}
      <button
        type="button"
        className="axe-mobiel__home"
        title="Home screen · swipe up"
        onClick={() => ga(null)}
        onPointerDown={omlaag}
        onPointerUp={los}
        onPointerCancel={() => { swipe.current = null; }}
      >
        <span className="axe-mobiel__indicator" />
      </button>
    </div>
  );
}
