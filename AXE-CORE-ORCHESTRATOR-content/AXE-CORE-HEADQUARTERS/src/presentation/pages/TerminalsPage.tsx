/**
 * Terminals — elke machine naast elkaar, met zijn eigen commando's eronder.
 *
 * ## Waarom naast elkaar en niet één vlak met een schakelaar
 *
 * De eerste versie had één terminal met knoppen erboven om van machine te
 * wisselen. Luka: "beter als 1 zwart vlak". Hij heeft gelijk, en de reden is
 * concreter dan smaak: met een schakelaar zie je één machine tegelijk, dus je
 * weet nooit of de andere nog draait zonder erheen te klikken. Naast elkaar is
 * de status van je hele park één blik.
 *
 * ## Wat een machine zonder adres doet
 *
 * Die toont een invulveld in plaats van een terminal. Niet weglaten: dan bestaat
 * een machine die je hebt pas als je hem hebt ingesteld, en weet je niet dat hij
 * kan. En geen verzonnen adres, want een knop die stil faalt kost meer tijd dan
 * een veld dat om iets vraagt.
 *
 * ## Twee rijen van vier, en de commando's onder een handgreep
 *
 * Acht vensters in een vast raster van vier breed. Vast en niet auto-fit: met
 * auto-fit hing het aantal kolommen van de vensterbreedte af, en dan schuift
 * "de VPS" van rechtsboven naar linksonder zodra je het venster versleept.
 * Waar een machine staat hoort onthoudbaar te zijn.
 *
 * De commando's stonden altijd open, boven elke terminal. Dat is drie regels
 * chroom per venster maal acht -- meer dan de terminals zelf. Ze zitten nu
 * onder een handgreep aan de onderkant: dicht als je aan het werk bent, open
 * als je even niet weet hoe het commando ging.
 *
 * ## De drie stippen zijn echte knoppen
 *
 * Rood, geel, groen, zoals op een Mac -- en ze doen wat je daar verwacht:
 * sluiten (de machine weghalen), nieuwe shell, en vol beeld. Nagemaakt chroom
 * dat niets doet is precies wat deze codebase te vaak had; als je het tekent,
 * laat het dan werken.
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { XtermTerminal, type XtermHandle } from '@/presentation/components/axe-core/XtermTerminal';
import {
  alleHosts, maakHost, geldigWsAdres, metAdres, isKlaar,
  HOSTS_SLEUTEL, ADRESSEN_SLEUTEL, TERMINAL_POORT,
  type TerminalHost,
} from '@/domain/terminalHosts';
import {
  snelactiesVoor, actiesVanGroep, GROEP_LABEL,
  type Groep, type Snelactie,
} from '@/domain/terminalSnelacties';
import { zetJson } from '@/infrastructure/persistence/veiligeOpslag';

const GROEPEN: Groep[] = ['machine', 'agents', 'git'];

/** Twee rijen van vier. Zie de uitleg bovenaan waarom het een vast getal is. */
const VAKKEN = 8;

function lees<T>(sleutel: string, terugval: T): T {
  try {
    const rauw = localStorage.getItem(sleutel);
    return rauw ? (JSON.parse(rauw) as T) : terugval;
  } catch {
    // Een kapotte of volle opslag hoort geen lege pagina te geven.
    return terugval;
  }
}

export default function TerminalsPage() {
  const [eigen, setEigen] = useState<TerminalHost[]>(() => lees<TerminalHost[]>(HOSTS_SLEUTEL, []));
  const [adressen, setAdressen] = useState<Record<string, string>>(() => lees(ADRESSEN_SLEUTEL, {}));
  const [toevoegen, setToevoegen] = useState(false);

  const hosts = useMemo(
    () => alleHosts(eigen).map(h => metAdres(h, adressen)),
    [eigen, adressen],
  );

  const bewaarEigen = useCallback((lijst: TerminalHost[]) => {
    setEigen(lijst); zetJson(HOSTS_SLEUTEL, lijst);
  }, []);
  const bewaarAdres = useCallback((id: string, url: string) => {
    setAdressen(vorige => {
      const volgende = { ...vorige, [id]: url };
      zetJson(ADRESSEN_SLEUTEL, volgende);
      return volgende;
    });
  }, []);

  return (
    <motion.div className="axe-tabruimte flex min-h-0 flex-1 flex-col overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--tint-line)' }}>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Terminals
        </span>
        <span className="text-[9.5px]" style={{ color: 'var(--text-muted)' }}>
          {hosts.filter(isKlaar).length} van {hosts.length} ingesteld
        </span>
        <button
          onClick={() => setToevoegen(v => !v)}
          className="ml-auto text-[10px] flex items-center gap-1 opacity-70 hover:opacity-100"
          title="Nog een machine toevoegen"
        >
          {toevoegen ? <X size={11} /> : <Plus size={11} />} machine
        </button>
      </div>

      {toevoegen && (
        <MachineToevoegen onKlaar={h => { bewaarEigen([...eigen, h]); setToevoegen(false); }} />
      )}

      {/* Vier breed, twee rijen. Vast en niet auto-fit: zie de uitleg bovenaan.
          Onder de 1100px worden het er twee en onder de 700 één -- vier
          terminals van 200px naast elkaar zijn vier onleesbare terminals. */}
      <div className="axe-termraster flex-1 min-h-0 overflow-auto p-2">
        {hosts.slice(0, VAKKEN).map(host => (
          <MachinePaneel
            key={host.id}
            host={host}
            opAdres={url => bewaarAdres(host.id, url)}
            opWeg={host.ingebouwd ? undefined : () => bewaarEigen(eigen.filter(h => h.id !== host.id))}
          />
        ))}
        {/* De lege plekken blijven staan in plaats van het raster te laten
            inklappen: acht vakken is de indeling, en een leeg vak zegt "hier
            kan er nog een bij". */}
        {Array.from({ length: Math.max(0, VAKKEN - hosts.length) }, (_, i) => (
          <LeegVak key={`leeg-${i}`} onKlik={() => setToevoegen(true)} />
        ))}
      </div>
    </motion.div>
  );
}

function MachinePaneel({
  host, opAdres, opWeg,
}: {
  host: TerminalHost;
  opAdres: (url: string) => void;
  opWeg?: () => void;
}) {
  const termRef = useRef<XtermHandle>(null);
  const [verbonden, setVerbonden] = useState(false);
  const [groep, setGroep] = useState<Groep>('machine');
  const [getoond, setGetoond] = useState<string | null>(null);
  const [hulpOpen, setHulpOpen] = useState(false);
  const [vol, setVol] = useState(false);
  const acties = useMemo(() => snelactiesVoor(host.id), [host.id]);
  const klaar = isKlaar(host);

  // Zetten en niet versturen, behalve wat aantoonbaar niets verandert. Een knop
  // die meteen een dienst herstart is één misklik van een onderbreking af.
  const doe = useCallback((a: Snelactie) => {
    termRef.current?.send(a.leestAlleen ? `${a.cmd}\n` : a.cmd);
  }, []);

  const zichtbaar = actiesVanGroep(acties, groep);
  const uitgelicht = zichtbaar.find(a => a.label === getoond) ?? zichtbaar[0];

  return (
    <div className="axe-term" data-vol={vol ? 'ja' : undefined}>
      {/* ── De titelbalk ─────────────────────────────────────────────────
          Drie stoplichten links, de titel gecentreerd. En die stoplichten
          DOEN wat ze op een Mac doen -- zie de uitleg bovenaan. */}
      <div className="axe-term-kop">
        <div className="axe-term-lampen">
          <button
            className="axe-term-lamp axe-term-lamp--rood"
            onClick={opWeg}
            disabled={!opWeg}
            title={opWeg ? `${host.naam} weghalen` : 'Een ingebouwde machine blijft staan'}
            aria-label={opWeg ? `${host.naam} weghalen` : 'Vast'}
          />
          <button
            className="axe-term-lamp axe-term-lamp--geel"
            onClick={() => termRef.current?.reconnect()}
            disabled={!klaar}
            title="Nieuwe shell"
            aria-label="Nieuwe shell"
          />
          <button
            className="axe-term-lamp axe-term-lamp--groen"
            onClick={() => setVol(v => !v)}
            title={vol ? 'Terug in het raster' : 'Vol beeld'}
            aria-label={vol ? 'Terug in het raster' : 'Vol beeld'}
          />
        </div>

        {/* Naam ÉN waarvoor, in één titel. Acht shells die er identiek uitzien
            zijn acht kansen om het verkeerde commando op de verkeerde machine
            te plakken -- dus staat het waarvoor er altijd bij, en niet achter
            de handgreep. */}
        <div className="axe-term-titel" title={`${host.naam} — ${host.waarvoor}`}>
          <span
            className="axe-term-stip"
            data-stand={klaar ? (verbonden ? 'aan' : 'stuk') : 'leeg'}
            aria-label={klaar ? (verbonden ? 'verbonden' : 'geen verbinding') : 'nog niet ingesteld'}
          />
          {host.naam} <span className="axe-term-titel-dun">— {host.waarvoor}</span>
        </div>
      </div>

      {!klaar ? (
        <AdresInvullen host={host} opAdres={opAdres} />
      ) : (
        <>
          <XtermTerminal
            // key op het adres: verandert dat, dan hoort er een verse shell te
            // komen. Het verbind-effect draait alleen bij mount.
            key={host.wsUrl}
            wsBasis={host.wsUrl}
            ref={termRef}
            onConnectionChange={setVerbonden}
            className="flex-1 min-h-0"
          />

          {!verbonden && (
            <div className="axe-term-melding">
              {host.id === 'deze-mac'
                ? <>Start hem met <code>npm run terminal</code> in de repo.</>
                : <>Geen verbinding. Draait terminal-server.cjs daar, op poort {TERMINAL_POORT}?</>}
            </div>
          )}

          {/* ── De handgreep ───────────────────────────────────────────────
              Dicht als je aan het werk bent, open als je even niet weet hoe
              het commando ging. Het streepje is de greep; de tekst ernaast
              zegt wat eronder zit, want een greep zonder woord is een gokje. */}
          <button
            className="axe-term-greep"
            onClick={() => setHulpOpen(v => !v)}
            aria-expanded={hulpOpen}
            title={hulpOpen ? 'Commando\u2019s verbergen' : 'Commando\u2019s tonen'}
          >
            <span className="axe-term-greep-streep" aria-hidden="true" />
            <span className="axe-term-greep-tekst">
              {hulpOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
              commando&rsquo;s
            </span>
          </button>

          {hulpOpen && (
            <div className="axe-term-hulp">
              <div className="flex gap-1">
                {GROEPEN.map(g => (
                  <button key={g} onClick={() => { setGroep(g); setGetoond(null); }}
                    className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{
                      color: g === groep ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      border: `1px solid ${g === groep ? 'var(--border-active)' : 'transparent'}`,
                    }}>
                    {GROEP_LABEL[g]}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {zichtbaar.map(a => (
                  <button key={a.label} onClick={() => doe(a)}
                    onMouseEnter={() => setGetoond(a.label)} onFocus={() => setGetoond(a.label)}
                    className="axe-chip !text-[9.5px] !py-0.5"
                    // Doorgetrokken = draait meteen, streepjes = komt in de prompt.
                    // Dat verschil hoort zichtbaar te zijn vóór je klikt.
                    style={{ borderStyle: a.leestAlleen ? 'solid' : 'dashed' }}>
                    {a.label}
                  </button>
                ))}
              </div>
              {uitgelicht && (
                <div className="text-[9px] min-w-0">
                  <div style={{ color: 'var(--text-secondary)' }}>{uitgelicht.uitleg}</div>
                  <code className="block truncate" style={{ color: 'var(--text-muted)' }}>
                    {uitgelicht.cmd}
                  </code>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Een leeg vak in het raster.
 *
 * Blijft staan in plaats van het raster te laten inklappen: acht vakken is de
 * indeling, en een leeg vak zegt "hier kan er nog een bij" -- terwijl een
 * raster dat krimpt alleen zegt dat er niets is.
 */
function LeegVak({ onKlik }: { onKlik: () => void }) {
  return (
    <button className="axe-term axe-term--leeg" onClick={onKlik} title="Machine toevoegen">
      <Plus size={16} />
      <span>machine</span>
    </button>
  );
}

function AdresInvullen({ host, opAdres }: { host: TerminalHost; opAdres: (url: string) => void }) {
  const lokaal = host.id === 'imac';
  const [url, setUrl] = useState(
    lokaal ? `ws://ADRES:${TERMINAL_POORT}/terminal` : 'wss://ADRES/terminal',
  );
  const kan = geldigWsAdres(url) && !url.includes('ADRES');

  return (
    <div className="flex-1 flex flex-col items-start justify-center gap-2 p-3">
      <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
        Nog geen adres. Vervang <code>ADRES</code> door het IP of de hostnaam.
      </div>
      <div className="flex gap-1.5 w-full">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && kan) opAdres(url.trim()); }}
          className="flex-1 min-w-0 bg-transparent outline-none rounded-card px-2 py-1 text-[10px] font-mono"
          style={{
            border: `1px solid ${kan ? 'var(--border-default)' : 'var(--m-broken)'}`,
            color: 'var(--text-primary)',
          }}
        />
        <button disabled={!kan} onClick={() => opAdres(url.trim())}
          className="axe-chip !text-[9.5px] disabled:opacity-40"
          title={kan ? 'Bewaren' : 'Vul een echt adres in'}>
          <Check size={10} />
        </button>
      </div>
      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
        Op die machine moet <code>terminal-server.cjs</code> draaien.
      </div>
    </div>
  );
}

function MachineToevoegen({ onKlaar }: { onKlaar: (h: TerminalHost) => void }) {
  const [naam, setNaam] = useState('');
  const [waarvoor, setWaarvoor] = useState('');
  const [url, setUrl] = useState(`ws://ADRES:${TERMINAL_POORT}/terminal`);
  const kanNiet = !naam.trim() || !geldigWsAdres(url) || url.includes('ADRES');

  return (
    <div className="px-4 py-2 flex gap-2 flex-wrap items-center flex-shrink-0"
      style={{ borderBottom: '1px solid var(--tint-line)', background: 'rgba(255,255,255,0.02)' }}>
      <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="naam"
        className="bg-transparent outline-none rounded-card px-2 py-1 text-[10px]"
        style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)', width: 130 }} />
      <input value={waarvoor} onChange={e => setWaarvoor(e.target.value)} placeholder="waarvoor gebruik je hem"
        className="bg-transparent outline-none rounded-card px-2 py-1 text-[10px] flex-1"
        style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)', minWidth: 160 }} />
      <input value={url} onChange={e => setUrl(e.target.value)}
        className="bg-transparent outline-none rounded-card px-2 py-1 text-[10px] font-mono"
        style={{
          border: `1px solid ${geldigWsAdres(url) && !url.includes('ADRES') ? 'var(--border-default)' : 'var(--m-broken)'}`,
          color: 'var(--text-primary)', width: 250,
        }} />
      <button disabled={kanNiet}
        onClick={() => { const h = maakHost(naam, waarvoor, url); if (h) onKlaar(h); }}
        className="axe-chip !text-[9.5px] disabled:opacity-40">
        toevoegen
      </button>
    </div>
  );
}
