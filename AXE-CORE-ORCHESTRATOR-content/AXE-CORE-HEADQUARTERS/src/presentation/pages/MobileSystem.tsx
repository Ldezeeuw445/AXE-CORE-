/**
 * AXE Device Manager — het telefoonoppervlak (#/mobile).
 *
 * Light én dark glass (volgt data-look). Vijf dok-tabs: Device, Use, Core,
 * Tabs, Look. Use stuurt écht computer_use-taken naar de Mac en browser-use
 * naar de VPS. Tabs opent elke desktop-tab in dit frame (home-indicator
 * van de zwevende telefoon brengt je terug). In het iframe verdwijnt het
 * desktopchroom, anders is een tab op 393 px onbruikbaar.
 */
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  BookMarked, Bot, Brain, Cable, CalendarDays, Clock, Compass, Cpu,
  Database, FileCode, Globe, Home, LayoutGrid, Lightbulb, LineChart,
  ListTodo, Megaphone, Network, Settings, Settings2, Share2, Sparkles,
  Table2, TerminalSquare, Wallet, Workflow, type LucideIcon,
} from 'lucide-react';
import { useLook } from '@/presentation/hooks/useLook';
import type { Look } from '@/domain/look';
import { useTradingDeskState } from './tradingIntel/useTradingDeskState';
import { useGeheugenTotaal, teller } from '@/presentation/components/layout/zweef/geheugenTeller';
import { useTellers } from '@/presentation/components/devices/telefoonTellers';
import { dispatchComputerTask, onlineDevices, type Device } from '@/infrastructure/gateways/computerRelay';
import { sendBrowserAIMessage } from '@/application/browser/browserAIService';
import { groepeerTabs, zoekTabs } from '@/presentation/components/device-manager/tabs';
import { macKijk, macOpdracht, macVraagtToestemming } from '@/presentation/components/device-manager/gebruik';
import '@/presentation/components/device-manager/device-manager.css';

type Paneel = 'home' | 'use' | 'core' | 'tabs' | 'me';

const DOK: Array<{ id: Paneel; label: string; Icon: LucideIcon }> = [
  { id: 'home', label: 'Device', Icon: Home },
  { id: 'use', label: 'Use', Icon: Cpu },
  { id: 'core', label: 'Core', Icon: Compass },
  { id: 'tabs', label: 'Tabs', Icon: LayoutGrid },
  { id: 'me', label: 'Look', Icon: Settings2 },
];

const TAB_ICON: Record<string, LucideIcon> = {
  '/': Home,
  '/thinkthanks': Lightbulb,
  '/apps': LayoutGrid,
  '/ai-core': Brain,
  '/memory': Database,
  '/obsidian': Share2,
  '/knowledge': BookMarked,
  '/mcp': Cable,
  '/infrastructure': Network,
  '/control-plane': Workflow,
  '/table-editor': Table2,
  '/cron-manager': Clock,
  '/browser': Compass,
  '/agents': Bot,
  '/crewai': Megaphone,
  '/calendar': CalendarDays,
  '/tasks': ListTodo,
  '/finance': Wallet,
  '/trading-intel': LineChart,
  '/maps-3d': Globe,
  '/code-editor': FileCode,
  '/terminals': TerminalSquare,
  '/eve': Sparkles,
  '/settings': Settings,
};

function Kaart({ titel, rechts, children }: { titel: string; rechts?: ReactNode; children: ReactNode }) {
  return (
    <section className="axe-dm-kaart">
      <h2>{titel}{rechts ? <span className="rechts">{rechts}</span> : null}</h2>
      {children}
    </section>
  );
}

function Regel({ label, waarde, toelichting, tint }: { label: string; waarde: ReactNode; toelichting?: string; tint?: string }) {
  return (
    <div className="axe-dm-regel">
      <span>{label}</span>
      <span className="w" style={tint ? { color: tint } : undefined}>{waarde}</span>
      {toelichting ? <small>{toelichting}</small> : null}
    </div>
  );
}

function useMachines() {
  const [machines, setMachines] = useState<Device[] | null>(null);
  useEffect(() => {
    let leeft = true;
    onlineDevices()
      .then((d) => { if (leeft) setMachines(d); })
      .catch(() => { if (leeft) setMachines([]); });
    return () => { leeft = false; };
  }, []);
  return machines;
}

function HomePaneel() {
  const desk = useTradingDeskState();
  const totaal = useGeheugenTotaal();
  const { openTaken, actieveAgents } = useTellers();
  const machines = useMachines();
  const mac = machines === null ? 'looking…' : machines.length === 0 ? 'offline' : machines.map((m) => m.label).join(', ');
  const macTint = machines === null ? 'var(--dm-warn)' : machines.length === 0 ? 'var(--dm-err)' : 'var(--dm-ok)';

  return (
    <>
      <Kaart titel="This phone · AXE Core" rechts={<span style={{ color: 'var(--dm-ok)' }}><i className="axe-dm-stip" />live</span>}>
        <div className="groot">{totaal === null ? '—' : teller(totaal)}</div>
        <p className="axe-dm-log">memories on this account</p>
        <div className="axe-dm-rij" style={{ marginTop: 4 }}>
          <span><i className="axe-dm-stip" style={{ color: 'var(--dm-ok)' }} />{openTaken ?? '—'} open</span>
          <span><i className="axe-dm-stip" style={{ color: 'var(--dm-accent)' }} />{actieveAgents ?? '—'} agents</span>
        </div>
      </Kaart>
      <Kaart titel="Link">
        <Regel label="Mac worker" waarde={mac} tint={macTint} toelichting="computer use needs axe-computer-worker on the machine" />
        <Regel label="VPS" waarde="api.axecompanion.com" toelichting="every provider call goes through here — never direct" />
        <Regel label="Battery · storage" waarde="on the Samsung" toelichting="only the Android shell can read those; this frame cannot invent them" />
      </Kaart>
      <Kaart titel="Trading OS" rechts={desk.chartSymbol}>
        <div className="groot">
          {desk.snapshot?.last?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}
        </div>
        <p className="axe-dm-log">{desk.activeStrategy ?? 'no strategy'}</p>
      </Kaart>
      <Kaart titel="From this phone">
        <p className="axe-dm-log">
          Use — run the Mac (computer use) and the browser agent. Tabs — every
          desktop tab, live in this frame. Core — trading, memory, crew.
        </p>
      </Kaart>
    </>
  );
}

function UsePaneel() {
  const machines = useMachines();
  const [gekozenHand, setGekozen] = useState('');
  const gekozen = gekozenHand || machines?.[0]?.id || '';
  const [macTekst, setMacTekst] = useState('');
  const [macUit, setMacUit] = useState<{ ok: boolean; text: string } | null>(null);
  const [macBezig, setMacBezig] = useState(false);
  const [wacht, setWacht] = useState<string | null>(null);
  const [webTekst, setWebTekst] = useState('');
  const [webUit, setWebUit] = useState<{ ok: boolean; text: string } | null>(null);
  const [webBezig, setWebBezig] = useState(false);

  const stuurMac = async (kijk: boolean, e?: FormEvent) => {
    e?.preventDefault();
    if (!gekozen) {
      setMacUit({ ok: false, text: 'No Mac is answering. Start axe-computer-worker on the machine.' });
      return;
    }
    if (!kijk && !macTekst.trim()) return;
    const call = kijk ? macKijk(gekozen) : macOpdracht(gekozen, macTekst.trim());
    if (!kijk && macVraagtToestemming(call) && wacht !== call.args.command) {
      setWacht(String(call.args.command));
      return;
    }
    setWacht(null);
    setMacBezig(true);
    setMacUit(null);
    try {
      const r = await dispatchComputerTask(call);
      setMacUit(r);
    } catch (err) {
      setMacUit({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setMacBezig(false);
    }
  };

  const stuurWeb = async (e?: FormEvent, tekst = webTekst) => {
    e?.preventDefault();
    const opdracht = tekst.trim();
    if (!opdracht) return;
    setWebBezig(true);
    setWebUit(null);
    try {
      const r = await sendBrowserAIMessage('browser-use', opdracht);
      setWebUit({ ok: r.status !== 'error', text: r.message });
    } catch (err) {
      setWebUit({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setWebBezig(false);
    }
  };

  return (
    <>
      <Kaart titel="Computer use · your Mac" rechts={gekozen || 'no device'}>
        <div className="axe-dm-machines">
          {machines === null && <span className="axe-dm-log">Looking for a worker…</span>}
          {machines?.length === 0 && <span className="axe-dm-log">No Mac online</span>}
          {machines?.map((m) => (
            <button key={m.id} type="button" className={`axe-dm-chip${gekozen === m.id ? ' aan' : ''}`} onClick={() => setGekozen(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <form className="axe-dm-veld" onSubmit={(e) => void stuurMac(false, e)}>
          <input value={macTekst} onChange={(e) => { setMacTekst(e.target.value); setWacht(null); }} placeholder="Do this on the Mac…" aria-label="Computer use" />
          <button type="submit" className="axe-dm-ga" disabled={macBezig} title="Run on Mac">→</button>
        </form>
        {wacht && (
          <div className="axe-dm-vraag">
            <p>This runs on <b>{gekozen}</b> as <code>terminal.free</code>. Always ask.</p>
            <p><code>{wacht}</code></p>
            <div className="axe-dm-rij">
              <button type="button" className="axe-dm-chip aan" disabled={macBezig} onClick={() => void stuurMac(false)}>Run</button>
              <button type="button" className="axe-dm-chip" onClick={() => setWacht(null)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="axe-dm-rij">
          <button type="button" className="axe-dm-chip" disabled={macBezig} onClick={() => void stuurMac(true)}>
            Peek · system.info
          </button>
          <button type="button" className="axe-dm-chip" onClick={() => setMacTekst('ls ~/Projects')}>ls ~/Projects</button>
        </div>
        {macUit && <pre className={`axe-dm-uit ${macUit.ok ? 'ok' : 'fout'}`}>{macUit.text}</pre>}
      </Kaart>

      <Kaart titel="Browser use · the agent">
        <form className="axe-dm-veld" onSubmit={(e) => void stuurWeb(e)}>
          <input value={webTekst} onChange={(e) => setWebTekst(e.target.value)} placeholder="Browse, scrape, fill a form…" aria-label="Browser use" />
          <button type="submit" className="axe-dm-ga" disabled={webBezig} title="Run browser agent">→</button>
        </form>
        <div className="axe-dm-rij">
          <button
            type="button"
            className="axe-dm-chip"
            disabled={webBezig}
            onClick={() => {
              const t = 'Open the NorthSea desk and read the bid';
              setWebTekst(t);
              void stuurWeb(undefined, t);
            }}
          >
            NorthSea desk
          </button>
        </div>
        {webUit && <pre className={`axe-dm-uit ${webUit.ok ? 'ok' : 'fout'}`}>{webUit.text}</pre>}
      </Kaart>
    </>
  );
}

function CorePaneel() {
  const desk = useTradingDeskState();
  const totaal = useGeheugenTotaal();
  const { openTaken, actieveAgents } = useTellers();
  const nav = useNavigate();
  return (
    <>
      <Kaart titel="Trading" rechts={desk.chartSymbol}>
        <div className="groot">{desk.snapshot?.last?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'}</div>
        <p className="axe-dm-log">{desk.activeStrategy ?? 'no strategy'}</p>
        <div className="axe-dm-rij">
          <button type="button" className="axe-dm-chip" onClick={() => nav('/trading-intel')}>Open trading</button>
        </div>
      </Kaart>
      <Kaart titel="Memory">
        <div className="groot">{totaal === null ? '—' : teller(totaal)}</div>
        <div className="axe-dm-rij">
          <button type="button" className="axe-dm-chip" onClick={() => nav('/memory')}>Open memory</button>
        </div>
      </Kaart>
      <Kaart titel="Agents & tasks">
        <Regel label="Agents" waarde={actieveAgents ?? '—'} />
        <Regel label="Open tasks" waarde={openTaken ?? '—'} />
        <div className="axe-dm-rij">
          <button type="button" className="axe-dm-chip" onClick={() => nav('/agents')}>Agents</button>
          <button type="button" className="axe-dm-chip" onClick={() => nav('/tasks')}>Tasks</button>
          <button type="button" className="axe-dm-chip" onClick={() => nav('/crewai')}>Crew</button>
        </div>
      </Kaart>
    </>
  );
}

function TabsPaneel() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const groepen = useMemo(() => groepeerTabs(zoekTabs(q)), [q]);
  return (
    <>
      <form className="axe-dm-veld" onSubmit={(e) => e.preventDefault()}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tab…" aria-label="Find a tab" />
      </form>
      {groepen.length === 0 && <p className="axe-dm-log">No tab matches.</p>}
      {groepen.map((g) => (
        <div key={g.id} className="axe-dm-groep">
          <div className="axe-dm-groep__naam">{g.label}</div>
          <div className="axe-dm-tabs">
            {g.tabs.map((t) => {
              const Icon = TAB_ICON[t.path] ?? LayoutGrid;
              return (
                <button key={t.path} type="button" className="axe-dm-tab" onClick={() => nav(t.path)}>
                  <Icon strokeWidth={1.6} />
                  {t.label}
                  <small>{t.path === '/' ? 'home' : t.path.slice(1)}</small>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function MePaneel({ look, setLook }: { look: Look; setLook: (l: Look) => void }) {
  const nav = useNavigate();
  return (
    <>
      <Kaart titel="Glass">
        <p className="axe-dm-log">
          Light frost or smoked dark — same layout. Follows this phone and the Mac.
        </p>
        <div className="axe-dm-voor">
          <button type="button" className={`axe-dm-voor--licht${look === 'glass' ? ' aan' : ''}`} onClick={() => setLook('glass')}>
            Light
            <small>Frosted glass, dark ink</small>
          </button>
          <button type="button" className={`axe-dm-voor--donker${look === 'black' ? ' aan' : ''}`} onClick={() => setLook('black')}>
            Dark
            <small>Smoked glass, light ink</small>
          </button>
        </div>
      </Kaart>
      <Kaart titel="This device">
        <p className="axe-dm-log">
          Every provider call goes through the VPS. Computer use is a row in
          core_tasks; a worker on the Mac claims it. No inbound port.
        </p>
        <div className="axe-dm-rij">
          <button type="button" className="axe-dm-chip" onClick={() => nav('/settings')}>Providers</button>
          <button type="button" className="axe-dm-chip" onClick={() => nav('/infrastructure')}>Infra</button>
        </div>
      </Kaart>
    </>
  );
}

export default function MobileSystem() {
  const [look, setLook] = useLook();
  const [paneel, setPaneel] = useState<Paneel>('home');
  const titel = DOK.find((d) => d.id === paneel)?.label ?? 'Device';

  return (
    <div className="axe-dm" data-paneel={paneel}>
      <header className="axe-dm__kop">
        <div>
          <div className="axe-dm__merk">AXE Core</div>
          <div className="axe-dm__titel">{titel === 'Device' ? 'Device manager' : titel}</div>
        </div>
        <div className="axe-dm__look">
          <button type="button" className={look === 'glass' ? 'aan' : ''} onClick={() => setLook('glass')}>Light</button>
          <button type="button" className={look === 'black' ? 'aan' : ''} onClick={() => setLook('black')}>Dark</button>
        </div>
      </header>
      <main className="axe-dm__lijf">
        {paneel === 'home' && <HomePaneel />}
        {paneel === 'use' && <UsePaneel />}
        {paneel === 'core' && <CorePaneel />}
        {paneel === 'tabs' && <TabsPaneel />}
        {paneel === 'me' && <MePaneel look={look} setLook={setLook} />}
      </main>
      <nav className="axe-dm__dok" aria-label="Device manager">
        {DOK.map(({ id, label, Icon }) => (
          <button key={id} type="button" className={paneel === id ? 'aan' : ''} onClick={() => setPaneel(id)}>
            <span className="rond"><Icon strokeWidth={1.6} /></span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
