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
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, RefreshCw, X, Check } from 'lucide-react';
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

      {/* Automatisch passend: op een breed scherm staan ze naast elkaar, op een
          smal onder elkaar. Geen vast aantal kolommen -- vier panelen van 200px
          naast elkaar op een laptop is vier onleesbare terminals. */}
      <div
        className="flex-1 min-h-0 overflow-auto p-2 grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignContent: 'start' }}
      >
        {hosts.map(host => (
          <MachinePaneel
            key={host.id}
            host={host}
            opAdres={url => bewaarAdres(host.id, url)}
            opWeg={host.ingebouwd ? undefined : () => bewaarEigen(eigen.filter(h => h.id !== host.id))}
          />
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
    <div className="flex flex-col min-h-0 rounded-card overflow-hidden"
      style={{ border: '1px solid var(--border-default)', minHeight: 320 }}>

      {/* ── Wie is dit ───────────────────────────────────────────────── */}
      <div className="px-2.5 py-1.5 flex items-start gap-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold flex items-center gap-1.5"
            style={{ color: 'var(--text-primary)' }}>
            {host.naam}
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: klaar ? (verbonden ? 'var(--m-happened)' : 'var(--m-broken)') : 'var(--m-idle)',
            }} />
          </div>
          {/* Het waarvoor staat er ALTIJD bij. Vijf shells die er identiek
              uitzien zijn vijf kansen om het verkeerde commando op de verkeerde
              machine te plakken. */}
          <div className="text-[9px] leading-snug truncate" style={{ color: 'var(--text-muted)' }}>
            {host.waarvoor}
          </div>
        </div>
        {klaar && (
          <button onClick={() => termRef.current?.reconnect()} title="Nieuwe shell"
            className="opacity-60 hover:opacity-100 flex-shrink-0"><RefreshCw size={11} /></button>
        )}
        {opWeg && (
          <button onClick={opWeg} title={`${host.naam} weghalen`}
            className="opacity-60 hover:opacity-100 flex-shrink-0"><Trash2 size={11} /></button>
        )}
      </div>

      {!klaar ? (
        <AdresInvullen host={host} opAdres={opAdres} />
      ) : (
        <>
          {/* ── Wat je hier doet ───────────────────────────────────────── */}
          <div className="px-2.5 py-1.5 flex flex-col gap-1 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-default)' }}>
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

          <XtermTerminal
            // key op het adres: verandert dat, dan hoort er een verse shell te
            // komen. Het verbind-effect draait alleen bij mount.
            key={host.wsUrl}
            wsBasis={host.wsUrl}
            ref={termRef}
            onConnectionChange={setVerbonden}
            className="flex-1 min-h-0"
          />

          {!verbonden && host.id === 'deze-mac' && (
            <div className="px-2.5 py-1 text-[9px] flex-shrink-0"
              style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-default)' }}>
              Start hem met <code style={{ color: 'var(--text-secondary)' }}>npm run terminal</code> in de repo.
            </div>
          )}
          {!verbonden && host.id !== 'deze-mac' && (
            <div className="px-2.5 py-1 text-[9px] flex-shrink-0"
              style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-default)' }}>
              Geen verbinding. Draait terminal-server.cjs daar, op poort {TERMINAL_POORT}?
            </div>
          )}
        </>
      )}
    </div>
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
