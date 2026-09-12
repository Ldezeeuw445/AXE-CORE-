/**
 * Wat er op het scherm van de telefoon staat: een beginscherm met tegels, of
 * een open app in een iframe. Rendert op 393x852 (de echte maat); de schaal
 * zit op de omhullende .axe-toestel.
 *
 * Het beginscherm is van AXE-materiaal, niet van Apple: kaart-tegels met de
 * merkkleur in de letters, een ruit-dok onderaan, en de home-indicator als de
 * enige weg terug -- zoals op een echte telefoon.
 */
import { useEffect, useState } from 'react';
import {
  TELEFOON_APPS, appUrl, bewaarOpenApp, laadOpenApp, type TelefoonApp,
} from './launcher';

function herkomst() {
  const { origin, pathname, search } = window.location;
  return { origin, pathname, search };
}

function useKlok(): string {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = window.setInterval(() => setT(new Date()), 30_000);
    return () => window.clearInterval(i);
  }, []);
  return t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function Tegel({ app, onOpen, inDok = false }: { app: TelefoonApp; onOpen: (a: TelefoonApp) => void; inDok?: boolean }) {
  return (
    <button type="button" className={`axe-tegel${inDok ? ' axe-tegel--dok' : ''}`} onClick={() => onOpen(app)} title={app.soort === 'url' ? app.doel : `#${app.doel}`}>
      <span className="axe-tegel__icoon" style={{ color: app.kleur }}>{app.glyph}</span>
      {!inDok && <span className="axe-tegel__naam">{app.naam}</span>}
    </button>
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
          <div className="axe-beginscherm__raster">
            {raster.map((a) => <Tegel key={a.id} app={a} onOpen={ga} />)}
          </div>
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
