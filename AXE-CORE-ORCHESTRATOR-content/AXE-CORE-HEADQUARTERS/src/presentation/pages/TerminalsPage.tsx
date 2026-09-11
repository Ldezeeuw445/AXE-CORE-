/**
 * Terminals — één shell per machine, met per machine de juiste shortlist.
 *
 * ## Waarom dit een eigen tab is en niet de oude Terminal
 *
 * De oude tab had één verbinding, hardgecodeerd naar de VPS, en één rij
 * knoppen die overal hetzelfde deed. Alles wat op de Mac mini moest gebeuren
 * deed je daarnaast in Terminal.app.
 *
 * De oude blijft bestaan zolang hij ergens vandaan wordt geopend; deze staat
 * ernaast in plaats van eroverheen, zodat er niets omvalt terwijl dit nieuw is.
 *
 * ## De key op de terminal
 *
 * `key={host.id}` hangt er met opzet: het verbind-effect in XtermTerminal
 * draait bij mount en niet bij een adreswijziging, dus zonder die key zou
 * wisselen van machine niets doen. Hem afdwingen via een remount is hier ook
 * inhoudelijk juist -- een andere machine is een andere shell, met een eigen
 * geschiedenis. Eén scrollback voor twee machines is precies hoe je een
 * commando op de verkeerde plakt.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Terminal as TerminalIcon, Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { XtermTerminal, type XtermHandle } from '@/presentation/components/axe-core/XtermTerminal';
import {
  alleHosts, kiesHost, maakHost, geldigWsAdres,
  HOSTS_SLEUTEL, LAATSTE_HOST_SLEUTEL, TERMINAL_POORT,
  type TerminalHost,
} from '@/domain/terminalHosts';
import { snelactiesVoor } from '@/domain/terminalSnelacties';
import { zetJson, zetItem } from '@/infrastructure/persistence/veiligeOpslag';

function leesEigen(): TerminalHost[] {
  try {
    const rauw = localStorage.getItem(HOSTS_SLEUTEL);
    const lijst = rauw ? JSON.parse(rauw) : [];
    return Array.isArray(lijst) ? lijst : [];
  } catch {
    // Een kapotte of volle opslag hoort geen lege pagina te geven: de
    // ingebouwde hosts werken ook zonder.
    return [];
  }
}

export default function TerminalsPage() {
  const termRef = useRef<XtermHandle>(null);
  const [eigen, setEigen] = useState<TerminalHost[]>(() => leesEigen());
  const [hostId, setHostId] = useState<string>(() => {
    try { return localStorage.getItem(LAATSTE_HOST_SLEUTEL) ?? ''; } catch { return ''; }
  });
  const [verbonden, setVerbonden] = useState(false);
  const [toevoegen, setToevoegen] = useState(false);

  const hosts = useMemo(() => alleHosts(eigen), [eigen]);
  const host = kiesHost(hostId, hosts);
  const acties = useMemo(() => snelactiesVoor(host.id), [host.id]);

  useEffect(() => { zetItem(LAATSTE_HOST_SLEUTEL, host.id); }, [host.id]);

  const bewaarEigen = useCallback((lijst: TerminalHost[]) => {
    setEigen(lijst);
    zetJson(HOSTS_SLEUTEL, lijst);
  }, []);

  /* Zetten en niet versturen, behalve bij wat aantoonbaar niets verandert.
     Een knop die meteen een dienst herstart is één misklik van een onderbreking
     af; je hoort te zien wat er staat voor je enter drukt. */
  const doeActie = useCallback((cmd: string, leestAlleen?: boolean) => {
    termRef.current?.send(leestAlleen ? `${cmd}\n` : cmd);
  }, []);

  return (
    <motion.div className="axe-tabruimte flex min-h-0 flex-1 flex-col overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* ── Welke machine ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid var(--tint-line)' }}>
        {hosts.map(h => {
          const aan = h.id === host.id;
          return (
            <button
              key={h.id}
              onClick={() => setHostId(h.id)}
              title={h.wsUrl}
              className="text-left rounded-card px-3 py-2 transition-colors"
              style={{
                border: `1px solid ${aan ? 'var(--border-active)' : 'var(--border-default)'}`,
                background: aan ? 'var(--bg-active)' : 'transparent',
                minWidth: 180,
              }}
            >
              <div className="text-[12px] font-semibold flex items-center gap-1.5"
                style={{ color: aan ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                <TerminalIcon size={11} />
                {h.naam}
              </div>
              {/* Het waarvoor staat er ALTIJD bij, ook op de niet-actieve knoppen.
                  Vier shells die er identiek uitzien zijn vier kansen om het
                  verkeerde commando op de verkeerde machine te plakken. */}
              <div className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {h.waarvoor}
              </div>
            </button>
          );
        })}

        <button
          onClick={() => setToevoegen(v => !v)}
          title="Een machine toevoegen — iMac, tweede VPS, wat dan ook"
          className="rounded-card px-3 py-2 text-[11px] flex items-center gap-1.5 self-stretch"
          style={{ border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}
        >
          {toevoegen ? <X size={12} /> : <Plus size={12} />}
          {toevoegen ? 'annuleren' : 'machine'}
        </button>

        <div className="ml-auto flex items-center gap-2 self-center">
          <span className="text-[10px]" style={{ color: verbonden ? 'var(--m-happened)' : 'var(--text-muted)' }}>
            {verbonden ? 'verbonden' : 'niet verbonden'}
          </span>
          <button onClick={() => termRef.current?.reconnect()} title="Nieuwe shell openen"
            className="opacity-70 hover:opacity-100"><RefreshCw size={12} /></button>
          {!host.ingebouwd && (
            <button
              onClick={() => bewaarEigen(eigen.filter(h => h.id !== host.id))}
              title={`${host.naam} uit de lijst halen`}
              className="opacity-70 hover:opacity-100"
            ><Trash2 size={12} /></button>
          )}
        </div>
      </div>

      {toevoegen && <MachineToevoegen onKlaar={(h) => { bewaarEigen([...eigen, h]); setHostId(h.id); setToevoegen(false); }} />}

      {/* ── Wat je hier meestal doet ──────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-4 py-2 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid var(--tint-line)' }}>
        {acties.map(a => (
          <button
            key={a.label}
            onClick={() => doeActie(a.cmd, a.leestAlleen)}
            title={`${a.uitleg}${a.leestAlleen ? '' : ' — komt in de prompt te staan; jij drukt enter'}`}
            className="axe-chip !text-[10px]"
          >
            {a.label}
          </button>
        ))}
        <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)' }}>
          zet het commando klaar — jij drukt enter
        </span>
      </div>

      <XtermTerminal
        key={host.id}
        wsBasis={host.wsUrl}
        ref={termRef}
        onConnectionChange={setVerbonden}
        className="flex-1 min-h-0"
      />

      {host.id === 'deze-mac' && !verbonden && (
        /* Zonder dit is "niet verbonden" op je eigen Mac een raadsel: er draait
           daar niets tot je het start, en dat weet je alleen als iemand het
           zegt. */
        <div className="px-4 py-2 text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--tint-line)' }}>
          Geen verbinding met deze Mac. Start de terminal-server eenmalig:{' '}
          <code style={{ color: 'var(--text-secondary)' }}>
            node terminal-server.cjs
          </code>{' '}
          in de repo (luistert op poort {TERMINAL_POORT}).
        </div>
      )}
    </motion.div>
  );
}

function MachineToevoegen({ onKlaar }: { onKlaar: (h: TerminalHost) => void }) {
  const [naam, setNaam] = useState('');
  const [waarvoor, setWaarvoor] = useState('');
  const [url, setUrl] = useState(`ws://:${TERMINAL_POORT}/terminal`);
  const kanNiet = !naam.trim() || !geldigWsAdres(url);

  return (
    <div className="px-4 py-3 flex gap-2 flex-wrap items-center flex-shrink-0"
      style={{ borderBottom: '1px solid var(--tint-line)', background: 'rgba(255,255,255,0.02)' }}>
      <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="naam — bijv. iMac"
        className="bg-transparent outline-none rounded-card px-2 py-1 text-[11px]"
        style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)', width: 150 }} />
      <input value={waarvoor} onChange={e => setWaarvoor(e.target.value)} placeholder="waarvoor gebruik je hem"
        className="bg-transparent outline-none rounded-card px-2 py-1 text-[11px] flex-1"
        style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)', minWidth: 200 }} />
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="ws://host:4022/terminal"
        className="bg-transparent outline-none rounded-card px-2 py-1 text-[11px] font-mono"
        style={{ border: `1px solid ${geldigWsAdres(url) ? 'var(--border-default)' : 'var(--m-broken)'}`, color: 'var(--text-primary)', width: 260 }} />
      <button
        disabled={kanNiet}
        onClick={() => { const h = maakHost(naam, waarvoor, url); if (h) onKlaar(h); }}
        title={kanNiet ? 'Een naam en een geldig ws:// of wss:// adres zijn nodig' : 'Toevoegen'}
        className="axe-chip !text-[10px] disabled:opacity-40"
      >
        toevoegen
      </button>
    </div>
  );
}
