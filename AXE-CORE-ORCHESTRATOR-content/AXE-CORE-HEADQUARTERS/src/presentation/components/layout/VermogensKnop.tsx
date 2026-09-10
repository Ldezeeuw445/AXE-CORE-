/**
 * Eén knop in de composer voor wat AXE buiten het gesprek kan: deze Mac
 * besturen, een echte browser rijden, en een paar kant-en-klare opdrachten.
 *
 * ## Waarom één knop en geen drie
 *
 * De rij naast het invoerveld heeft er al vier, en op een smal scherm valt daar
 * nu al één van weg omdat het invoerveld anders tot ~150px inkrimpt. Drie
 * knoppen erbij zou dat probleem verdrievoudigen. Een knop die opengaat kost
 * één plek en heeft binnenin wél ruimte voor de reden erbij.
 *
 * ## Waarom er een stand bij staat
 *
 * Deze twee vermogens kunnen stilletjes uit staan: de computer-werker is een
 * proces op de Mac dat gestopt kan zijn, en de browser draait op de VPS. Zonder
 * die stand typ je een opdracht en krijg je pas na een halve minuut te horen
 * dat er niemand luisterde. Groen of rood, en bij rood staat erbij wat je eraan
 * doet -- dezelfde regel als bij de providerkaarten.
 *
 * De vertaling van meting naar beeld zit in `domain/vermogenStand.ts`, met een
 * test. Hier staat alleen het ophalen en het tekenen.
 *
 * ## Waarom het paneel naar body portaleert
 *
 * De composer-pil (`.axe-gemini-shell`) heeft `overflow: hidden` -- dat is wat
 * hem zijn ronde vorm geeft. Een paneel dat erboven uitsteekt werd daardoor
 * afgesneden tot een streepje van 15px: het stond er wél, je zag het niet.
 * Dezelfde reden waarom de sloten portaleren.
 *
 * Het portaleert naar `.axe-shell` en niet naar body, en dat is geen detail:
 * het materiaal van kaarten staat in css als `.axe-shell .axe-surface`. Buiten
 * de schil valt die regel niet, en dan krijg je een doorzichtig doosje waar de
 * chat dwars doorheen leest -- precies wat regel 2 in axe-look.css verbiedt.
 * Binnen de schil is `axe-surface` genoeg en is het per definitie hetzelfde
 * materiaal als elke andere kaart, ook als de look later verandert.
 *
 * Niet `.axe-paneel`: die is `width:100%; height:100%` omdat hij een slot vult,
 * en in een zwevend doosje klapt hij dus dicht.
 *
 * ## Waarom de snelle toetsen tekst invullen en niet versturen
 *
 * Ze zetten een zin in het invoerveld en laten de cursor daar staan. Een knop
 * die meteen verstuurt is een knop die je niet meer kunt bijstellen, en juist
 * bij "doe iets op mijn Mac" wil je die zin eerst afmaken.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Monitor, Zap } from 'lucide-react';
import { checkAxeApi } from '@/infrastructure/gateways/axeCoreApiService';
import { onlineDevices } from '@/infrastructure/gateways/computerRelay';
import { kiesVoorkeurMachine, voorkeurMachine } from '@/infrastructure/persistence/voorkeurMachineService';
import {
  bewaarBrowserHosts, browserHostAntwoordt, browserHostKeuze, kiesBrowserHost,
  laadBrowserHosts, __resetBrowserHostCache,
} from '@/infrastructure/persistence/browserHostService';
import { geldigeHostUrl, gekozenHost, VPS_HOST, type BrowserHost } from '@/domain/browserHosts';
import { browserBeeld, computerBeeld, type VermogenBeeld } from '@/domain/vermogenStand';

/** Zinnen die AXE zelf naar de juiste marker vertaalt -- geen ruwe markers,
 *  want die zijn niet te lezen en niet bij te stellen. */
const SNELLE_TOETSEN: ReadonlyArray<{ groep: 'computer' | 'browser'; tekst: string }> = [
  { groep: 'computer', tekst: 'Wat is de git-status van AXE Core?' },
  { groep: 'computer', tekst: 'Wat staat er nog niet gecommit in AXE Core?' },
  { groep: 'computer', tekst: 'Zoek in AXE Core naar ' },
  { groep: 'computer', tekst: 'Draai de tests in AXE Core' },
  { groep: 'browser', tekst: 'Open ' },
  { groep: 'browser', tekst: 'Zoek op nu.nl het nieuws van vandaag en vat het samen' },
];

function Stip({ kleur }: { kleur: string }) {
  return (
    <span
      className="inline-block flex-shrink-0 rounded-full"
      style={{ width: 6, height: 6, background: kleur, boxShadow: `0 0 6px ${kleur}` }}
    />
  );
}

function Vermogen({
  icoon: Icoon,
  naam,
  beeld,
  toetsen,
  onKies,
  machines,
  gekozen,
  onKiesMachine,
  onWeg,
  extra,
}: {
  icoon: typeof Monitor;
  naam: string;
  beeld: VermogenBeeld;
  toetsen: readonly string[];
  onKies: (t: string) => void;
  /** De ingecheckte machines, als er meer dan een kan zijn. */
  machines?: Array<{ id: string; label: string; verwijderbaar?: boolean }>;
  gekozen?: string | null;
  onKiesMachine?: (id: string | null) => void;
  /** Een toegevoegde host weghalen. Ontbreekt = niets is te verwijderen. */
  onWeg?: (id: string) => void;
  /** Iets onder de knoppen, voor wat alleen dit vermogen nodig heeft. */
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* De naam op zijn eigen regel met alleen de stip ernaast. Stond de stand
          er eerst achter, dan brak "Deze Mac" over twee regels zodra de
          hostnaam lang was -- en die is een tailnet-adres, dus altijd lang. */}
      <div className="flex items-center gap-2">
        <Icoon size={12} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{naam}</span>
        <Stip kleur={beeld.kleur} />
      </div>
      <div className="text-[10px] pl-5 -mt-1 truncate" style={{ color: 'var(--text-muted)' }} title={beeld.tekst}>
        {beeld.tekst}
      </div>
      {beeld.remedie ? (
        <div className="text-[10px] pl-5 -mt-1" style={{ color: 'var(--text-muted)' }}>
          ↳ {beeld.remedie}
        </div>
      ) : null}
      {/* WELKE machine. Er kunnen er meerdere ingecheckt staan -- dat is de hele
          reden om er meer dan een te hebben: staat er een uit, dan werkt de
          andere nog. Maar zonder keuze weigert de relay te kiezen, en terecht:
          dezelfde repo op twee Macs staat vroeg of laat op twee takken.
          Hier staat het antwoord, en het is te veranderen zonder iets te typen. */}
      {machines && machines.length > 1 && onKiesMachine ? (
        <div className="flex flex-wrap gap-1 pl-5">
          {machines.map(m => (
            <span
              key={m.id}
              className="inline-flex items-center rounded"
              style={{
                background: gekozen === m.id ? 'var(--tint-line)' : 'rgba(255,255,255,0.05)',
              }}
            >
              <button
                type="button"
                onClick={() => onKiesMachine(gekozen === m.id ? null : m.id)}
                title={gekozen === m.id ? 'Gekozen — klik om weer zelf te laten kiezen' : `Gebruik ${m.label}`}
                className="px-1.5 py-0.5 text-[10px] truncate max-w-[104px]"
                style={{ color: gekozen === m.id ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
              >
                {m.label}
              </button>
              {/* Weghalen wat je zelf hebt toegevoegd. Zonder dit kon een adres
                  er alleen bij, en een verkeerd getypte host bleef staan. */}
              {onWeg && m.verwijderbaar ? (
                <button
                  type="button"
                  onClick={() => onWeg(m.id)}
                  title={`${m.label} weghalen`}
                  aria-label={`${m.label} weghalen`}
                  className="pr-1 text-[10px] leading-none"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {extra ?? null}
      <div className="flex flex-col">
        {toetsen.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onKies(t)}
            className="text-left text-[11px] rounded-md px-2 py-1.5 truncate"
            style={{ color: 'var(--text-secondary, rgba(255,255,255,0.72))' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VermogensKnop({ onKies }: { onKies: (tekst: string) => void }) {
  const [open, setOpen] = useState(false);
  const [machines, setMachines] = useState<Array<{ id: string; label: string }> | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [hosts, setHosts] = useState<BrowserHost[]>([VPS_HOST]);
  const [hostKeuze, setHostKeuze] = useState<string | null>(null);
  const [nieuwAdres, setNieuwAdres] = useState('');
  const [adresOpen, setAdresOpen] = useState(false);
  const [api, setApi] = useState<boolean | null>(null);
  const doosRef = useRef<HTMLDivElement | null>(null);
  const knopRef = useRef<HTMLButtonElement | null>(null);
  const paneelRef = useRef<HTMLDivElement | null>(null);
  const [plek, setPlek] = useState<{ left: number; bottom: number } | null>(null);

  /* Het paneel hangt aan body, dus het moet zelf weten waar de knop staat.
     In een layout-effect, want tussen meten en tekenen mag geen frame zitten
     waarin hij linksboven staat. */
  useLayoutEffect(() => {
    if (!open || !knopRef.current) return;
    const meet = () => {
      const r = knopRef.current?.getBoundingClientRect();
      if (r) setPlek({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    };
    meet();
    window.addEventListener('resize', meet);
    return () => window.removeEventListener('resize', meet);
  }, [open]);

  /* Pas meten als hij opengaat. Een peiling die altijd loopt kost een
     Supabase-vraag en een VPS-vraag per paar tellen voor een paneel dat je
     misschien nooit opent. */
  useEffect(() => {
    if (!open) return;
    let levend = true;
    onlineDevices()
      .then(d => { if (levend) setMachines(d.map(x => ({ id: x.id, label: x.label }))); })
      /* Niet ingelogd of de tabel is onbereikbaar: dat is voor de gebruiker
         hetzelfde als "geen werker" -- er gaat nu niets werken. */
      .catch(() => { if (levend) setMachines([]); });
    void voorkeurMachine().then(v => { if (levend) setGekozen(v); }).catch(() => undefined);
    void laadBrowserHosts().then(h => { if (levend) setHosts(h); }).catch(() => undefined);
    void browserHostKeuze().then(k => { if (levend) setHostKeuze(k); }).catch(() => undefined);
    /* De GEKOZEN host peilen, niet altijd de VPS. Anders staat het lampje groen
       terwijl de machine waar het werk heen gaat uit staat -- en het lampje is
       er juist om dat niet te hoeven proberen. */
    void (async () => {
      try {
        const [lijst, keuze] = await Promise.all([laadBrowserHosts(), browserHostKeuze()]);
        const host = gekozenHost(lijst, keuze);
        const ok = host.url ? await browserHostAntwoordt(host.url) : await checkAxeApi().then(() => true);
        if (levend) setApi(ok);
      } catch {
        if (levend) setApi(false);
      }
    })();
    return () => { levend = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const buiten = (e: MouseEvent) => {
      const doel = e.target as Node;
      /* Het paneel staat niet meer IN de knop-doos (het portaleert), dus allebei
         nakijken -- anders sluit een klik in het paneel het paneel. */
      if (doosRef.current?.contains(doel) || paneelRef.current?.contains(doel)) return;
      setOpen(false);
    };
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', buiten);
    document.addEventListener('keydown', toets);
    return () => {
      document.removeEventListener('mousedown', buiten);
      document.removeEventListener('keydown', toets);
    };
  }, [open]);

  const kies = useCallback((t: string) => { onKies(t); setOpen(false); }, [onKies]);

  /* Het leegmaken hoort HIER en niet in het effect. Synchroon setState in een
     effect geeft een cascade van renders (react-hooks/set-state-in-effect), en
     inhoudelijk is dit ook geen synchronisatie met de buitenwereld maar een
     gevolg van de klik: je opent hem opnieuw, dus de vorige meting is oud. */
  const wissel = useCallback(() => {
    if (!open) { setMachines(null); setApi(null); }
    setOpen(v => !v);
  }, [open]);

  return (
    <div ref={doosRef} className="relative flex-shrink-0">
      <button
        ref={knopRef}
        type="button"
        onClick={wissel}
        title="Wat AXE buiten dit gesprek kan"
        aria-expanded={open}
        className="flex-shrink-0 rounded-md p-2"
        style={{
          background: open ? 'var(--tint-line)' : 'rgba(255,255,255,0.05)',
          color: open ? 'var(--accent-cyan)' : 'var(--text-muted)',
        }}
      >
        <Zap size={13} />
      </button>

      {open && plek ? createPortal(
        /* Boven de knop, want de composer ligt onderaan het scherm. */
        <div
          ref={paneelRef}
          className="axe-surface fixed z-[60] flex flex-col gap-3 p-3.5"
          style={{ left: plek.left, bottom: plek.bottom, width: 268 }}
        >
          <Vermogen
            icoon={Monitor}
            naam="Computer"
            beeld={computerBeeld(machines?.map(m => m.label) ?? null)}
            toetsen={SNELLE_TOETSEN.filter(t => t.groep === 'computer').map(t => t.tekst)}
            onKies={kies}
            machines={machines ?? undefined}
            gekozen={gekozen}
            onKiesMachine={id => { setGekozen(id); void kiesVoorkeurMachine(id).catch(() => undefined); }}
          />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />
          <Vermogen
            icoon={Globe}
            naam="Browser"
            beeld={browserBeeld(api, gekozenHost(hosts, hostKeuze).naam)}
            toetsen={SNELLE_TOETSEN.filter(t => t.groep === 'browser').map(t => t.tekst)}
            onKies={kies}
            machines={hosts.length > 1
              ? hosts.map(h => ({ id: h.id, label: h.naam, verwijderbaar: h.id !== VPS_HOST.id }))
              : undefined}
            gekozen={hostKeuze ?? VPS_HOST.id}
            onKiesMachine={id => {
              const next = id ?? VPS_HOST.id;
              setHostKeuze(next);
              __resetBrowserHostCache();
              void kiesBrowserHost(next).catch(() => undefined);
            }}
            onWeg={id => {
              /* De VPS is geen toevoeging maar de terugval; die kan niet weg. */
              if (id === VPS_HOST.id) return;
              const lijst = hosts.filter(h => h.id !== id);
              setHosts(lijst);
              void bewaarBrowserHosts(lijst).catch(() => undefined);
              if (hostKeuze === id) {
                setHostKeuze(VPS_HOST.id);
                __resetBrowserHostCache();
                void kiesBrowserHost(VPS_HOST.id).catch(() => undefined);
              }
            }}
            extra={
              adresOpen ? (
                <form
                  className="flex gap-1 pl-5"
                  onSubmit={e => {
                    e.preventDefault();
                    const url = geldigeHostUrl(nieuwAdres);
                    if (!url) return;
                    /* De naam komt uit het adres. Een apart naamveld zou een
                       tweede ding zijn om in te vullen voor iets wat de
                       hostnaam al zegt. */
                    const naam = new URL(url).hostname.split('.')[0];
                    const nieuw = { id: url, naam, url };
                    const lijst = [...hosts.filter(h => h.id !== url), nieuw];
                    setHosts(lijst);
                    setNieuwAdres('');
                    setAdresOpen(false);
                    void bewaarBrowserHosts(lijst).catch(() => undefined);
                  }}
                >
                  <input
                    autoFocus
                    value={nieuwAdres}
                    onChange={e => setNieuwAdres(e.target.value)}
                    placeholder="http://mac-mini.ts.net:8099"
                    className="flex-1 min-w-0 rounded px-1.5 py-0.5 text-[10px] outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: 'none' }}
                  />
                  <button
                    type="submit"
                    disabled={!geldigeHostUrl(nieuwAdres)}
                    className="rounded px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                    style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)' }}
                  >
                    Erbij
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdresOpen(true)}
                  className="self-start pl-5 text-[10px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  + een Mac erbij
                </button>
              )
            }
          />
        </div>,
        /* Binnen de schil, want daar hangt het kaartmateriaal aan (zie boven).
           body als terugval: liever een lelijk doosje dan geen doosje. */
        document.querySelector('.axe-shell') ?? document.body,
      ) : null}
    </div>
  );
}
