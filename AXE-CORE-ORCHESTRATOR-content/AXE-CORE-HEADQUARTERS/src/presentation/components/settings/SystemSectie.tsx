/**
 * Settings › System als één dashboard (27 nov, Luka t81u).
 *
 * Was: drie kolommen die elk apart schoven (Remote terminal bijna leeg, Live
 * services een lange lijst, GitHub repos een lang formulier) op een grote
 * zwarte plaat, met rechts een leeg vlak. Nu: één strip met tellingen, een
 * dicht dienstenraster met op/neer, de terminal als kleine kaart, en de repos
 * als compacte kaarten; het formulier van één repo opent in een lade.
 *
 * Zelfde bronnen als voorheen: checkAllServices + getSystemState (de
 * health-registry) en loadRepoConfigs. Tokens worden nooit getoond, alleen
 * of er een staat.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ExternalLink, Github, X } from 'lucide-react';
import { checkAllServices, getSystemState, type ServiceState } from '@/application/system/systemService';
import { loadRepoConfigs, type RepoConfig } from '@/infrastructure/persistence/repoConfigService';
import { dienstTelling } from '@/domain/settings/settingsKaartKpis';
import { dienstToon, sorteerDiensten, VPS_DIENSTEN as VPS } from '@/domain/settings/dienstRaster';
import { SettingsKaartKpis } from './SettingsKaartKpis';
import './settingsDashboard.css';

export function SystemSectie({ repoFormulier }: { repoFormulier: (id: string) => ReactNode }) {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [laden, setLaden] = useState(true);
  const [verversen, setVerversen] = useState(false);
  const [repos, setRepos] = useState<RepoConfig[]>(() => { try { return loadRepoConfigs(); } catch { return []; } });
  const [lade, setLade] = useState<string | null>(null);

  const meet = () => checkAllServices().then(() => getSystemState());
  const ververs = () => {
    setVerversen(true);
    void meet()
      .then(setServices)
      .finally(() => { setVerversen(false); setLaden(false); });
  };
  useEffect(() => {
    let levend = true;
    void meet()
      .then((r) => { if (levend) setServices(r); })
      .finally(() => { if (levend) setLaden(false); });
    return () => { levend = false; };
  }, []);

  const sluitLade = () => {
    setLade(null);
    try { setRepos(loadRepoConfigs()); } catch { /* lijst blijft staan */ }
  };

  const t = dienstTelling(services);
  const terminal = services.find((s) => s.service === 'terminal') ?? null;
  const metToken = repos.filter((r) => !!r.token).length;
  const geen = !laden && services.length === 0;

  return (
    <div className="axe-sys" data-axe-system="">
      <div className="axe-sys-strip">
        <SettingsKaartKpis kpis={[
          { label: 'Up', waarde: laden ? '…' : geen ? '—' : `${t.op}/${t.totaal}`, regel: geen ? 'Not connected' : 'services online', toon: geen ? 'uit' : t.neer ? 'let-op' : 'ok' },
          { label: 'Down', waarde: laden ? '…' : geen ? '—' : String(t.neer), regel: 'offline now', toon: t.neer ? 'fout' : geen ? 'uit' : 'ok' },
          { label: 'Degraded / not set', waarde: laden ? '…' : geen ? '—' : `${t.traag} / ${t.overig}`, regel: 'slow · unverified', toon: t.traag ? 'let-op' : 'uit' },
          { label: 'Terminal', waarde: terminal ? (terminal.status === 'online' ? 'Online' : terminal.status) : '—', regel: terminal?.latency_ms ? `${terminal.latency_ms} ms · VPS` : 'remote shell', toon: terminal ? dienstToon(terminal.status) : 'uit' },
          { label: 'Repos', waarde: String(repos.length), regel: `${metToken} with token`, toon: metToken ? 'ok' : 'let-op' },
        ]} />
      </div>

      <div className="axe-sys-rij">
        <section className="axe-kaart axe-sys-kaart" data-axe-sys="services">
          <header className="axe-sys-kaart-kop">
            <h3>Live services</h3>
            <span>
              {t.op} up · {t.neer} down
              <button type="button" className="axe-sys-knop" style={{ marginLeft: 10 }} onClick={ververs} disabled={verversen}>
                <Activity size={11} className={verversen ? 'animate-spin' : ''} /> Refresh
              </button>
            </span>
          </header>
          {laden ? <p className="axe-dash-leeg">Checking services…</p> : geen ? <p className="axe-dash-leeg">Not connected: the health registry returned nothing.</p> : (
            <div className="axe-sys-diensten">
              {sorteerDiensten(services).map((s) => (
                <div key={s.service} className="axe-sys-dienst" data-toon={dienstToon(s.status)} title={`${s.display || s.service} · ${s.status}`}>
                  <i className="axe-skpi-stip" aria-hidden="true" />
                  <b>{s.service === 'n8n' ? 'n8n' : s.display || s.service}{VPS.has(s.service) ? ' · VPS' : ''}</b>
                  <small>{s.status === 'online' ? (s.latency_ms ? `${s.latency_ms} ms` : 'up') : s.status === 'unknown' ? 'not set' : s.status}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="axe-kaart axe-sys-kaart" data-axe-sys="terminal">
          <header className="axe-sys-kaart-kop">
            <h3>Remote terminal</h3>
            <a className="axe-sys-knop" href="/terminal">Open</a>
          </header>
          <div className="axe-sys-dienst" data-toon={terminal ? dienstToon(terminal.status) : 'uit'}>
            <i className="axe-skpi-stip" aria-hidden="true" />
            <b>AXE Terminal · VPS</b>
            <small>{terminal ? `${terminal.status}${terminal.latency_ms ? ` · ${terminal.latency_ms} ms` : ''}` : laden ? 'checking' : 'not in registry'}</small>
          </div>
          <p className="axe-dash-leeg" style={{ marginTop: 8, fontSize: 10.5 }}>Secure shell via wss://api.axecompanion.com/terminal.</p>
        </section>
      </div>

      <section className="axe-kaart axe-sys-kaart" data-axe-sys="repos">
        <header className="axe-sys-kaart-kop">
          <h3>GitHub repos</h3>
          <span>{repos.length} repos · {metToken} with token · click a repo for details</span>
        </header>
        {repos.length === 0 ? <p className="axe-dash-leeg">No repos configured.</p> : (
          <div className="axe-sys-repos">
            {repos.map((r) => (
              <button key={r.id} type="button" className="axe-sys-repo" onClick={() => setLade(r.id)} data-axe-repo={r.id}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Github size={12} style={{ color: 'var(--accent-cyan)' }} /><b>{r.label}</b>
                </span>
                <span>{r.owner}/{r.repo} · {r.branch}</span>
                <em style={{ color: r.token ? 'var(--success)' : 'var(--warning)' }}>{r.token ? 'Token set' : 'No token'}</em>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Portal: buiten het venster, anders rekent `fixed` vanaf de
          vervaagde laag en valt de lade buiten beeld. */}
      {lade && createPortal(
        <div className="axe-sys-lade-laag" onClick={sluitLade} role="presentation">
          <aside className="axe-sys-lade" role="dialog" aria-modal="true" aria-label="Repo details" onClick={(e) => e.stopPropagation()}>
            <header className="axe-sys-kaart-kop">
              <h3>{repos.find((r) => r.id === lade)?.label ?? 'Repo'}</h3>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {(() => { const r = repos.find((x) => x.id === lade); return r ? <a className="axe-sys-knop" href={`https://github.com/${r.owner}/${r.repo}`} target="_blank" rel="noreferrer">GitHub <ExternalLink size={10} /></a> : null; })()}
                <button type="button" className="axe-dash-sluit" onClick={sluitLade} aria-label="Close"><X size={14} /></button>
              </span>
            </header>
            {repoFormulier(lade)}
          </aside>
        </div>,
        document.body,
      )}
    </div>
  );
}
