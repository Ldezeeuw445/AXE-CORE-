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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Monitor, Zap } from 'lucide-react';
import { checkAxeApi } from '@/infrastructure/gateways/axeCoreApiService';
import { onlineDevices } from '@/infrastructure/gateways/computerRelay';
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
}: {
  icoon: typeof Monitor;
  naam: string;
  beeld: VermogenBeeld;
  toetsen: readonly string[];
  onKies: (t: string) => void;
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
  const [hosts, setHosts] = useState<string[] | null>(null);
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
      .then(d => { if (levend) setHosts(d.map(x => x.label)); })
      /* Niet ingelogd of de tabel is onbereikbaar: dat is voor de gebruiker
         hetzelfde als "geen werker" -- er gaat nu niets werken. */
      .catch(() => { if (levend) setHosts([]); });
    checkAxeApi()
      .then(() => { if (levend) setApi(true); })
      .catch(() => { if (levend) setApi(false); });
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
    if (!open) { setHosts(null); setApi(null); }
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
            naam="Deze Mac"
            beeld={computerBeeld(hosts)}
            toetsen={SNELLE_TOETSEN.filter(t => t.groep === 'computer').map(t => t.tekst)}
            onKies={kies}
          />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />
          <Vermogen
            icoon={Globe}
            naam="Browser"
            beeld={browserBeeld(api)}
            toetsen={SNELLE_TOETSEN.filter(t => t.groep === 'browser').map(t => t.tekst)}
            onKies={kies}
          />
        </div>,
        /* Binnen de schil, want daar hangt het kaartmateriaal aan (zie boven).
           body als terugval: liever een lelijk doosje dan geen doosje. */
        document.querySelector('.axe-shell') ?? document.body,
      ) : null}
    </div>
  );
}
