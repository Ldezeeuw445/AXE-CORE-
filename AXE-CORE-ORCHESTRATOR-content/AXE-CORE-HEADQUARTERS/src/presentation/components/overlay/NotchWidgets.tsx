/**
 * Notch ronde 3 (Luka 20 nov): de widgets uit zijn foto's onder het eiland.
 *   - Join-kaart: de volgende afspraak van vandaag; 4 min vooraf groot met Join.
 *   - Focus-timer (15/25/50), weer, muziek, Mac-knoppen, taakjes en een notitie.
 * Taken, notitie en timer staan in user_settings: iMac en Mac mini zien hetzelfde.
 * Muziek en Mac-knoppen bestaan alleen in de echte app (Tauri), niet in de browser.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloudSun, ListChecks, Timer } from 'lucide-react';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { AFSPRAKEN_EVENT, laadAfspraken } from '@/infrastructure/persistence/afsprakenService';
import {
  FOCUS_DUREN, FOCUS_SLEUTEL, NOTITIE_SLEUTEL, TAKEN_SLEUTEL,
  aankomend, focusStand, geordend, hervat, leesTaken, nieuweFocus, overTekst, pauzeer, voegToe, weerWoord,
  type Aankomend, type Focus, type Taakje,
} from '@/domain/overlay/notchWidgets';

async function roep<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const PLEK_SLEUTEL = 'axe_notch_plek_v1';
interface Plek { naam: string; lat: number; lon: number }
const STANDAARD_PLEK: Plek = { naam: 'Amsterdam', lat: 52.37, lon: 4.9 };

interface Muziek { app: string; titel: string; artiest: string; speelt: boolean }
interface Geluid { volume: number; stil: boolean }
interface Schakelaars { donker: boolean; iconen: boolean; wakker: boolean }

/**
 * pagina "werk" (Home): Join als er iets aankomt, dan één rij -- Vandaag, Taken,
 * Focus, Weer. pagina "mac" (rastericoon): Muziek, Geluid, Schakelaars, Weer.
 * Zoals Luka's foto's (20 nov): gelijke kaarten naast elkaar, geen lange pagina.
 */
export function NotchWidgets({ open, pagina = 'werk', vandaag }: { open: boolean; pagina?: 'werk' | 'mac'; vandaag?: ReactNode }) {
  const echt = isTauriRuntime();
  const [duurIdx, setDuurIdx] = useState(1); // 25 min
  const duurKeuze = FOCUS_DUREN[duurIdx];
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNu(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  /* ── Agenda ── */
  const [volgende, setVolgende] = useState<Aankomend | null>(null);
  useEffect(() => {
    if (!open) return;
    let weg = false;
    const laad = () => void laadAfspraken().then((l) => { if (!weg) setVolgende(aankomend(l, new Date())); }).catch(() => undefined);
    laad();
    const id = window.setInterval(laad, 30_000);
    window.addEventListener(AFSPRAKEN_EVENT, laad);
    return () => { weg = true; window.clearInterval(id); window.removeEventListener(AFSPRAKEN_EVENT, laad); };
  }, [open]);

  /* ── Focus ── */
  const [focus, setFocus] = useState<Focus | null>(null);
  useEffect(() => {
    if (!open) return;
    void loadSetting<Focus | null>(FOCUS_SLEUTEL, null).then((f) => setFocus(f && typeof f === 'object' ? f : null)).catch(() => undefined);
  }, [open]);
  const zetFocus = (f: Focus | null) => { setFocus(f); void saveSetting(FOCUS_SLEUTEL, f).catch(() => undefined); };
  const fs = focusStand(focus, nu);

  /* ── Weer ── */
  const [plek, setPlek] = useState<Plek>(STANDAARD_PLEK);
  const [weer, setWeer] = useState<{ temp: number; code: number; max: number; min: number } | null>(null);
  const [plekKiezen, setPlekKiezen] = useState(false);
  const [plekTekst, setPlekTekst] = useState('');
  useEffect(() => {
    void loadSetting<Plek | null>(PLEK_SLEUTEL, null).then((p) => { if (p && typeof p.lat === 'number') setPlek(p); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!open) return;
    let weg = false;
    const laad = async () => {
      try {
        const q = new URLSearchParams({
          latitude: String(plek.lat), longitude: String(plek.lon),
          current: 'temperature_2m,weather_code', daily: 'temperature_2m_max,temperature_2m_min',
          timezone: 'auto', forecast_days: '1',
        });
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
        const j = await r.json();
        if (!weg) setWeer({ temp: j.current.temperature_2m, code: j.current.weather_code, max: j.daily.temperature_2m_max[0], min: j.daily.temperature_2m_min[0] });
      } catch { /* geen weer: kaart toont een streepje */ }
    };
    void laad();
    const id = window.setInterval(() => void laad(), 20 * 60_000);
    return () => { weg = true; window.clearInterval(id); };
  }, [open, plek]);
  const kiesPlek = async (naam: string) => {
    setPlekKiezen(false);
    if (!naam.trim()) return;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(naam.trim())}`);
      const hit = (await r.json()).results?.[0];
      if (!hit) return;
      const p = { naam: hit.name, lat: hit.latitude, lon: hit.longitude };
      setPlek(p);
      void saveSetting(PLEK_SLEUTEL, p).catch(() => undefined);
    } catch { /* */ }
  };

  /* ── Muziek en geluid (alleen echte app) ── */
  const [muziek, setMuziek] = useState<Muziek | null>(null);
  const [geluid, setGeluid] = useState<Geluid | null>(null);
  const [schak, setSchak] = useState<Schakelaars | null>(null);
  const schakel = (woord: string) => void roep<Schakelaars>('mac_schakelaars', { woord }).then(setSchak).catch(() => undefined);
  useEffect(() => {
    if (!open || !echt) return;
    let weg = false;
    const laad = () => {
      void roep<Muziek | null>('muziek_stand').then((m) => { if (!weg) setMuziek(m); }).catch(() => undefined);
      void roep<Geluid>('mac_geluid', { volume: null }).then((g) => { if (!weg) setGeluid(g); }).catch(() => undefined);
      void roep<Schakelaars>('mac_schakelaars', { woord: null }).then((x) => { if (!weg) setSchak(x); }).catch(() => undefined);
    };
    laad();
    const id = window.setInterval(laad, 5000);
    return () => { weg = true; window.clearInterval(id); };
  }, [open, echt]);
  const muziekKnop = (actie: string) => {
    if (!muziek) return;
    if (actie === 'playpause') setMuziek({ ...muziek, speelt: !muziek.speelt });
    void roep('muziek_knop', { app: muziek.app, actie }).then(() => window.setTimeout(() => void roep<Muziek | null>('muziek_stand').then(setMuziek), 400)).catch(() => undefined);
  };
  const volumeTimer = useRef<number | undefined>(undefined);
  const zetVolume = (v: number) => {
    setGeluid((g) => ({ volume: v, stil: g?.stil ?? false }));
    window.clearTimeout(volumeTimer.current);
    volumeTimer.current = window.setTimeout(() => void roep<Geluid>('mac_geluid', { volume: v }).then(setGeluid).catch(() => undefined), 120);
  };

  /* ── Taken en notitie ── */
  const [blad, setBlad] = useState<'taken' | 'notitie'>('taken');
  const [taken, setTaken] = useState<Taakje[]>([]);
  const [nieuw, setNieuw] = useState('');
  const [notitie, setNotitie] = useState('');
  const notitieTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    void loadSetting<unknown>(TAKEN_SLEUTEL, []).then((x) => setTaken(leesTaken(x))).catch(() => undefined);
    void loadSetting<string>(NOTITIE_SLEUTEL, '').then((x) => setNotitie(typeof x === 'string' ? x : '')).catch(() => undefined);
  }, [open]);
  const bewaarTaken = (l: Taakje[]) => { setTaken(l); void saveSetting(TAKEN_SLEUTEL, l).catch(() => undefined); };
  const schrijfNotitie = (t: string) => {
    setNotitie(t);
    window.clearTimeout(notitieTimer.current);
    notitieTimer.current = window.setTimeout(() => void saveSetting(NOTITIE_SLEUTEL, t).catch(() => undefined), 600);
  };

  const w = weer ? weerWoord(weer.code) : null;
  const openTaken = taken.filter((t) => !t.af).length;

  const weerKaart = (
    <>
      <div className="axe-ov__vlak axe-ov__w axe-ov__weer">
        <div className="axe-ov__w-kop">
          <span className="axe-ov__w-label"><CloudSun size={13} strokeWidth={1.8} />{plek.naam}</span>
          <span className="axe-ov__w-meta">now</span>
        </div>
        {plekKiezen ? (
          <form onSubmit={(e) => { e.preventDefault(); void kiesPlek(plekTekst); }}>
            <input autoFocus value={plekTekst} onChange={(e) => setPlekTekst(e.target.value)} onBlur={() => setPlekKiezen(false)} placeholder="City" maxLength={60} />
          </form>
        ) : (
          <button type="button" className="axe-ov__weer-nu" title="Change city" onClick={() => { setPlekTekst(''); setPlekKiezen(true); }}>
            <span>{w?.teken ?? '·'}</span>
            <b>{weer ? `${Math.round(weer.temp)}°` : '–'}</b>
          </button>
        )}
        <span className="axe-ov__w-sub">{weer && w ? `${w.woord} · ${Math.round(weer.max)}° / ${Math.round(weer.min)}°` : 'No weather right now'}</span>
      </div>

    </>
  );

  if (pagina === 'mac') {
    return (
      <div className="axe-ov__widgets">
      {echt && muziek && (
        <div className="axe-ov__vlak axe-ov__w axe-ov__muziek">
          <div className="axe-ov__muziek-tekst">
            <span className="axe-ov__w-label">{muziek.app === 'Music' ? 'Apple Music' : muziek.app}</span>
            <b>{muziek.titel}</b>
            <span className="axe-ov__w-sub">{muziek.artiest}</span>
          </div>
          <div className="axe-ov__muziek-knoppen">
            <button type="button" aria-label="Previous" onClick={() => muziekKnop('previous')}>⏮</button>
            <button type="button" aria-label={muziek.speelt ? 'Pause' : 'Play'} className="is-groot" onClick={() => muziekKnop('playpause')}>{muziek.speelt ? '⏸' : '▶'}</button>
            <button type="button" aria-label="Next" onClick={() => muziekKnop('next')}>⏭</button>
          </div>
        </div>
      )}

      {echt && geluid && (
        <div className="axe-ov__vlak axe-ov__w axe-ov__mac">
          <button type="button" aria-label={geluid.stil ? 'Unmute' : 'Mute'} onClick={() => void roep('mac_knop', { actie: 'mute' }).then(() => setGeluid({ ...geluid, stil: !geluid.stil }))}>
            {geluid.stil || geluid.volume === 0 ? '🔇' : '🔊'}
          </button>
          <input type="range" min={0} max={100} value={geluid.stil ? 0 : geluid.volume} aria-label="Volume" onChange={(e) => zetVolume(Number(e.target.value))} />
          <button type="button" title="Screen off" aria-label="Screen off" onClick={() => void roep('mac_knop', { actie: 'scherm-uit' })}>🌙</button>
        </div>
      )}

      {echt && schak && (
        <div className="axe-ov__vlak axe-ov__w axe-ov__schak">
          <button type="button" aria-pressed={schak.donker} onClick={() => schakel(schak.donker ? 'licht' : 'donker')}>🌗 Dark</button>
          <button type="button" aria-pressed={!schak.iconen} onClick={() => schakel(schak.iconen ? 'iconen-weg' : 'iconen-terug')}>🗂 Hide icons</button>
          <button type="button" aria-pressed={schak.wakker} title="Keeps this Mac awake for 8 hours" onClick={() => schakel(schak.wakker ? 'slapen-mag' : 'wakker')}>☕ Stay awake</button>
        </div>
      )}

        {!echt && (
          <div className="axe-ov__vlak axe-ov__w">
            <span className="axe-ov__w-label">Mac</span>
            <span className="axe-ov__w-sub">Music, sound and switches work in the AXE app on your Mac.</span>
          </div>
        )}
        {weerKaart}
      </div>
    );
  }

  return (
    <div className="axe-ov__widgets">
      {volgende && (
        <div className={`axe-ov__vlak axe-ov__join${volgende.nu ? ' is-nu' : ''}`}>
          <div className="axe-ov__join-tekst">
            <span>{volgende.nu ? 'Starting' : 'Next'} · {volgende.tijd} · {overTekst(volgende.over)}</span>
            <b>{volgende.titel}</b>
          </div>
          {volgende.link && (
            <button type="button" className="axe-ov__join-knop" onClick={() => {
              const link = volgende.link as string;
              if (echt) void roep('open_link', { url: link }).catch(() => undefined);
              else window.open(link, '_blank', 'noopener');
            }}>Join</button>
          )}
        </div>
      )}

      {vandaag}
      <div className="axe-ov__vlak axe-ov__w axe-ov__blok">
        <div className="axe-ov__w-kop">
        <div className="axe-ov__blok-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={blad === 'taken'} onClick={() => setBlad('taken')}><ListChecks size={13} strokeWidth={1.8} />Tasks</button>
          <button type="button" role="tab" aria-selected={blad === 'notitie'} onClick={() => setBlad('notitie')}>Note</button>
        </div>
          <span className="axe-ov__w-meta">{blad === 'taken' ? (openTaken ? `${openTaken} to do` : 'all done') : 'both Macs'}</span>
        </div>
        {blad === 'taken' ? (
          <>
            <ul className="axe-ov__taken">
              {geordend(taken).slice(0, 6).map((t) => (
                <li key={t.id} className={t.af ? 'is-af' : ''}>
                  <button type="button" className="axe-ov__taak-vink" aria-pressed={t.af} aria-label={t.af ? 'Not done' : 'Done'}
                    onClick={() => bewaarTaken(taken.map((x) => (x.id === t.id ? { ...x, af: !x.af } : x)))}>{t.af ? '✓' : ''}</button>
                  <span>{t.tekst}</span>
                  <button type="button" className="axe-ov__taak-weg" aria-label="Remove" onClick={() => bewaarTaken(taken.filter((x) => x.id !== t.id))}>×</button>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => { e.preventDefault(); bewaarTaken(voegToe(taken, nieuw)); setNieuw(''); }}>
              <input value={nieuw} onChange={(e) => setNieuw(e.target.value)} placeholder="Add a task…" maxLength={140} />
            </form>
          </>
        ) : (
          <textarea value={notitie} onChange={(e) => schrijfNotitie(e.target.value)} placeholder="Quick note… (saved on both Macs)" rows={4} maxLength={4000} />
        )}
      </div>
      <div className={`axe-ov__vlak axe-ov__w axe-ov__focus${fs?.klaar ? ' is-klaar' : ''}`}>
        <div className="axe-ov__w-kop">
          <span className="axe-ov__w-label"><Timer size={13} strokeWidth={1.8} />Focus</span>
          <span className="axe-ov__w-meta">{fs ? (fs.klaar ? 'done' : fs.loopt ? 'running' : 'paused') : 'ready'}</span>
        </div>
        {fs ? (
          <>
            <b className="axe-ov__focus-tijd">{fs.klaar ? 'Done ✓' : fs.tekst}</b>
            <div className="axe-ov__focus-balk"><i style={{ width: `${Math.round(fs.deel * 100)}%` }} /></div>
            <div className="axe-ov__w-knoppen">
              {!fs.klaar && (
                <button type="button" onClick={() => focus && zetFocus(fs.loopt ? pauzeer(focus) : hervat(focus))}>{fs.loopt ? 'Pause' : 'Resume'}</button>
              )}
              <button type="button" onClick={() => zetFocus(null)}>{fs.klaar ? 'Close' : 'Stop'}</button>
            </div>
          </>
        ) : (
          /* Zoals de foto: grote tijd, dan − Start +. */
          <>
            <b className="axe-ov__focus-tijd">{`${duurKeuze}:00`}</b>
            <div className="axe-ov__focus-balk"><i style={{ width: '0%' }} /></div>
            <div className="axe-ov__focus-start">
              <button type="button" aria-label="Shorter" disabled={duurIdx === 0} onClick={() => setDuurIdx((i) => Math.max(0, i - 1))}>−</button>
              <button type="button" className="is-start" onClick={() => zetFocus(nieuweFocus(duurKeuze))}>Start</button>
              <button type="button" aria-label="Longer" disabled={duurIdx === FOCUS_DUREN.length - 1} onClick={() => setDuurIdx((i) => Math.min(FOCUS_DUREN.length - 1, i + 1))}>+</button>
            </div>
          </>
        )}
      </div>

      {weerKaart}
    </div>
  );
}
