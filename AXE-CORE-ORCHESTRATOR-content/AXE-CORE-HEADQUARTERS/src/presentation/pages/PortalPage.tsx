/**
 * Portal op de telefoon (Luka, 18 nov 2026): kies een foto, video, bestand of
 * je klembord, veeg het van het scherm af naar links, en het landt op de Mac
 * waar je zit -- in de notch, bestand in ~/Downloads/AXE Portal, tekst meteen
 * op het klembord. Werkt ook op de Mac zelf (dan gooi je naar de andere Mac).
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ClipboardPaste, ImagePlus, Send } from 'lucide-react';
import { grootteTekst, isWorp, PORTAL_MAX_BYTES, type PortalRij } from '@/domain/portal/portal';
import { gooiBestand, gooiTekst, recenteWorpen } from '@/infrastructure/gateways/portalService';
import { ditToestel, laadDevices } from '@/infrastructure/gateways/axeDeviceService';
import { AXE_CYAAN, AxeGezicht } from '@/presentation/components/axe-core/AxeGezicht';
import './PortalPage.css';

type Kaart = {
  key: string;
  file?: File;
  tekst?: string;
  url?: string;
  staat: 'klaar' | 'vliegt' | 'onderweg' | 'geland' | 'fout';
  rijId?: string;
  fout?: string;
  dx: number;
};

type Doel = { id: string; naam: string };
const WAAR_IK_BEN: Doel = { id: 'alle', naam: 'Waar ik ben' };

export default function PortalPage() {
  const [kaarten, setKaarten] = useState<Kaart[]>([]);
  const [doelen, setDoelen] = useState<Doel[]>([WAAR_IK_BEN]);
  const [doel, setDoel] = useState<string>(() => {
    try { return localStorage.getItem('axe_portal_doel') || 'alle'; } catch { return 'alle'; }
  });
  const [van, setVan] = useState('telefoon');
  const [melding, setMelding] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const sleep = useRef<{ key: string; x0: number; t0: number; xLaatst: number; tLaatst: number } | null>(null);

  useEffect(() => {
    void ditToestel().then((d) => setVan(d.device_name || 'telefoon')).catch(() => undefined);
    void laadDevices().then(({ devices }) => {
      const macs = devices
        .filter((d) => d.device_type === 'desktop' && !d.ditToestel && d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 7 * 86400_000)
        .map((d) => ({ id: d.device_id, naam: d.device_name }));
      setDoelen([WAAR_IK_BEN, ...macs]);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('axe_portal_doel', doel); } catch { /* */ }
  }, [doel]);

  // Zolang er iets onderweg is: kijken of een Mac het al heeft opgepakt.
  const onderweg = kaarten.filter((k) => k.staat === 'onderweg' && k.rijId);
  useEffect(() => {
    if (!onderweg.length) return;
    const id = window.setInterval(() => {
      void recenteWorpen(20).then((rijen) => {
        const per = new Map(rijen.map((r) => [r.id, r] as [string, PortalRij]));
        setKaarten((ks) => ks.map((k) => {
          const r = k.rijId ? per.get(k.rijId) : undefined;
          return r?.opgehaald_at ? { ...k, staat: 'geland', fout: r.opgehaald_door ?? undefined } : k;
        }));
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(id);
  }, [onderweg.length]);

  const zet = (key: string, deel: Partial<Kaart>) => setKaarten((ks) => ks.map((k) => (k.key === key ? { ...k, ...deel } : k)));

  const kies = (lijst: FileList | null) => {
    if (!lijst) return;
    const nieuw: Kaart[] = Array.from(lijst).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      staat: file.size > PORTAL_MAX_BYTES ? 'fout' : 'klaar',
      fout: file.size > PORTAL_MAX_BYTES ? 'Te groot: Portal neemt tot 50 MB' : undefined,
      dx: 0,
    }));
    setKaarten((ks) => [...nieuw, ...ks]);
  };

  const plakKlembord = async () => {
    try {
      const tekst = await navigator.clipboard.readText();
      if (!tekst.trim()) { setMelding('Je klembord is leeg'); return; }
      setKaarten((ks) => [{ key: `t-${Date.now()}`, tekst, staat: 'klaar', dx: 0 }, ...ks]);
    } catch {
      setMelding('Klembord lezen mocht niet — tik nog eens en kies "Plak"');
    }
  };

  const gooi = async (k: Kaart) => {
    zet(k.key, { staat: 'vliegt', dx: -window.innerWidth * 1.3 });
    try {
      const rij = k.file ? await gooiBestand(k.file, doel, van) : await gooiTekst(k.tekst ?? '', doel, van);
      zet(k.key, { staat: 'onderweg', rijId: rij.id, dx: 0 });
    } catch (e) {
      zet(k.key, { staat: 'fout', fout: (e as Error).message, dx: 0 });
    }
  };

  const neer = (k: Kaart) => (e: RPointerEvent<HTMLDivElement>) => {
    if (k.staat !== 'klaar') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const nu = performance.now();
    sleep.current = { key: k.key, x0: e.clientX, t0: nu, xLaatst: e.clientX, tLaatst: nu };
  };
  const beweeg = (k: Kaart) => (e: RPointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    if (!s || s.key !== k.key) return;
    const nu = performance.now();
    s.xLaatst = e.clientX; s.tLaatst = nu;
    zet(k.key, { dx: Math.min(40, e.clientX - s.x0) });
  };
  const los = (k: Kaart) => (e: RPointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    sleep.current = null;
    if (!s || s.key !== k.key) return;
    const dx = e.clientX - s.x0;
    const dt = Math.max(1, performance.now() - s.t0);
    if (isWorp(dx, dx / dt)) void gooi(k);
    else zet(k.key, { dx: 0 });
  };

  const doelNaam = doelen.find((d) => d.id === doel)?.naam ?? 'je Mac';

  return (
    <div className="axe-portal">
      <header className="axe-portal__kop">
        <AxeGezicht kleur={AXE_CYAAN} stemming={onderweg.length ? 'werkt' : 'rust'} size={44} label="AXE" />
        <div>
          <h1>Portal</h1>
          <p>Veeg naar links — het landt op {doel === 'alle' ? 'de Mac waar je zit' : doelNaam}.</p>
        </div>
      </header>

      <div className="axe-portal__doelen" role="radiogroup" aria-label="Naar welke Mac">
        {doelen.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={doel === d.id} onClick={() => setDoel(d.id)}>
            {d.naam}
          </button>
        ))}
      </div>

      <div className="axe-portal__knoppen">
        <button type="button" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={20} /> Foto, video of bestand
        </button>
        <button type="button" onClick={() => void plakKlembord()}>
          <ClipboardPaste size={20} /> Klembord
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { kies(e.target.files); e.target.value = ''; }} />
      </div>

      {melding && <p className="axe-portal__melding" onClick={() => setMelding('')}>{melding}</p>}

      <div className="axe-portal__stapel">
        {kaarten.length === 0 && (
          <div className="axe-portal__leeg">Kies iets hierboven. Daarna: veeg de kaart naar links van je scherm af.</div>
        )}
        {kaarten.map((k) => (
          <div
            key={k.key}
            className={`axe-portal__kaart is-${k.staat}`}
            style={{ transform: `translateX(${k.dx}px) rotate(${k.dx / 40}deg)` }}
            onPointerDown={neer(k)}
            onPointerMove={beweeg(k)}
            onPointerUp={los(k)}
            onPointerCancel={() => { sleep.current = null; zet(k.key, { dx: 0 }); }}
          >
            {k.url ? <img src={k.url} alt="" draggable={false} /> : (
              <div className="axe-portal__icoon">{k.tekst !== undefined ? '“ ”' : (k.file?.name.split('.').pop() || '?').slice(0, 4).toUpperCase()}</div>
            )}
            <div className="axe-portal__info">
              <b>{k.tekst !== undefined ? 'Klembord' : k.file?.name}</b>
              <span>
                {k.staat === 'klaar' && (k.tekst !== undefined ? `${k.tekst.slice(0, 60)}${k.tekst.length > 60 ? '…' : ''}` : grootteTekst(k.file?.size ?? 0))}
                {k.staat === 'vliegt' && 'Vliegt…'}
                {k.staat === 'onderweg' && `Onderweg naar ${doelNaam}…`}
                {k.staat === 'geland' && `Geland${k.fout ? ` op ${k.fout}` : ''} ✓`}
                {k.staat === 'fout' && (k.fout || 'Mislukt')}
              </span>
            </div>
            {k.staat === 'klaar' && (
              <button type="button" className="axe-portal__gooi" aria-label="Gooi naar Mac" onClick={() => void gooi(k)}>
                <Send size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
