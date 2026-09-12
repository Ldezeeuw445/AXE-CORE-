/**
 * Wat er op het scherm van de telefoon staat: een beginscherm, of een open
 * app in een iframe. Rendert op 393x852 (de echte maat); de schaal zit op de
 * omhullende .axe-toestel.
 *
 * Het beginscherm heeft het ritme van iOS -- vier kolommen, tegels van 60 met
 * hoek 14 en de naam eronder, widgets in tegelmaten, het dok onderaan -- maar
 * het materiaal van AXE: kaart voor de tegels en widgets, ruit voor het dok,
 * kleur alleen in iconen, stippen en letters. Bovenin een statuswidget van
 * 2x4 met de kleine bol en de tellers die de schil ook toont (herinneringen,
 * open taken, meldingen, agents); onder de apps een 1x4 "Now running" met de
 * drie diensten uit de kopregel van Home. De klok is de echte klok.
 */
import { useEffect, useState, type ComponentType } from 'react';
import {
  Brain, Calendar, CandlestickChart, CheckSquare, Code2, Database, Globe, Map,
  MessageCircle, Settings, Ship, Smartphone,
} from 'lucide-react';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { useNotifications } from '@/presentation/contexts/NotificationContext';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { isBezig } from '@/presentation/components/layout/zweef/bezig';
import { teller, useGeheugenTotaal } from '@/presentation/components/layout/zweef/geheugenTeller';
import {
  TELEFOON_APPS, appUrl, bewaarOpenApp, laadOpenApp, type AppIcoon, type TelefoonApp,
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

/* Elke tien seconden, zodat de minuut nooit meer dan tien seconden achterloopt
   op de klok in de kopbalk. */
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
      <span className="axe-tegel__icoon" style={{ color: app.kleur }}><Icoon size={26} strokeWidth={1.6} /></span>
      {!inDok && <span className="axe-tegel__naam">{app.naam}</span>}
    </button>
  );
}

function Getal({ n }: { n: number | null }) {
  return <b>{n === null ? '—' : n}</b>;
}

function StatusWidget({ totaal, bezig }: { totaal: number | null; bezig: boolean }) {
  const { openTaken, actieveAgents } = useTellers();
  const { unreadCount } = useNotifications();
  return (
    <section className="axe-widget axe-widget--status" aria-label="AXE Core status">
      <div className="axe-widget__bol"><AxeCoreSphere boost={bezig ? 1 : 0} /></div>
      <div className="axe-widget__tekst">
        <div className="axe-widget__kop">
          <i className={`axe-stip ${bezig ? 'c-warn' : 'c-ok'}`} />
          AXE Core <span className="axe-widget__sep">·</span>
          <span className={bezig ? 'c-warn' : 'c-ok'}>{bezig ? 'thinking' : 'live'}</span>
        </div>
        <div className="axe-widget__getal">{totaal === null ? '—' : teller(totaal)}</div>
        <div className="axe-widget__label">memories</div>
        <div className="axe-widget__rij">
          <span><Getal n={openTaken} /> open</span>
          <span><Getal n={unreadCount} /> new</span>
          <span><Getal n={actieveAgents} /> agents</span>
        </div>
      </div>
    </section>
  );
}

function NowRunning({ totaal, bezig }: { totaal: number | null; bezig: boolean }) {
  /* Dezelfde vraag als de kopregel: is er íets dat kan antwoorden? */
  const provider = useVoiceStore((s) =>
    !!s.primarySlot || !!s.fallback1Slot || !!s.fallback2Slot || !!s.fallback3Slot || s.routingLog.length > 0);
  const diensten: Array<{ naam: string; stand: string; ok: boolean }> = [
    { naam: 'Core', stand: bezig ? 'thinking' : provider ? 'active' : 'no AI', ok: provider && !bezig },
    { naam: 'Memory', stand: totaal === null ? '—' : `${teller(totaal)} nodes`, ok: totaal !== null },
    { naam: 'VPS API', stand: isAxeApiConfigured ? 'configured' : 'not set', ok: isAxeApiConfigured },
  ];
  return (
    <section className="axe-widget axe-widget--running" aria-label="Now running">
      <span className="axe-widget__titel">Now running</span>
      <div className="axe-widget__diensten">
        {diensten.map((d) => (
          <span key={d.naam} className="axe-widget__dienst">
            <i className={`axe-stip ${d.ok ? 'c-ok' : 'c-warn'}`} />
            {d.naam} <em className={d.ok ? 'c-ok' : 'c-warn'}>{d.stand}</em>
          </span>
        ))}
      </div>
    </section>
  );
}

function Beginscherm({ raster, onOpen }: { raster: TelefoonApp[]; onOpen: (a: TelefoonApp) => void }) {
  const totaal = useGeheugenTotaal();
  const bezig = useVoiceStore((s) => isBezig(s.voiceStatus));
  return (
    <div className="axe-beginscherm__pagina">
      <StatusWidget totaal={totaal} bezig={bezig} />
      <div className="axe-beginscherm__raster">
        {raster.map((a) => <Tegel key={a.id} app={a} onOpen={onOpen} />)}
      </div>
      <NowRunning totaal={totaal} bezig={bezig} />
    </div>
  );
}

export function TelefoonScherm({ onApp }: { onApp?: (app: TelefoonApp | null) => void }) {
  const [open, setOpen] = useState<TelefoonApp | null>(() => laadOpenApp(window.localStorage));
  const klok = useKlok();

  useEffect(() => { onApp?.(open); }, [open, onApp]);

  const ga = (app: TelefoonApp | null) => {
    bewaarOpenApp(app, window.localStorage);
    setOpen(app);
  };

  const raster = TELEFOON_APPS.filter((a) => !a.dok);
  const dok = TELEFOON_APPS.filter((a) => a.dok);

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
          <Beginscherm raster={raster} onOpen={ga} />
          <div className="axe-beginscherm__dok axe-ruit">
            {dok.map((a) => <Tegel key={a.id} app={a} onOpen={ga} inDok />)}
          </div>
        </div>
      )}
      {open && (
        <button type="button" className="axe-mobiel__home" title="Home screen" onClick={() => ga(null)}>
          <span className="axe-mobiel__indicator" />
        </button>
      )}
    </div>
  );
}
