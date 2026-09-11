/**
 * Wat de agent veranderde, en de knop die het naar GitHub duwt.
 *
 * ## Waarom zien vóór duwen
 *
 * `git add -A` legt ALLES vast wat in de worktree staat -- ook wat jij er zelf
 * naast de agent in hebt gezet, en ook een bestand dat een mislukte run half
 * heeft achtergelaten. Een knop die commit zonder dat er iets te lezen viel, is
 * een knop die je op een dag indrukt terwijl er iets in staat dat je niet
 * bedoelde, en op dat moment staat het al op GitHub. Pushen is naar buiten gaan
 * en dat is niet terug te draaien.
 *
 * Vandaar deze volgorde: eerst de lijst, dan pas de knop. De lijst is ook de
 * reden dat de knop uit staat als er niets gewijzigd is -- een lege commit
 * "omdat er toch iets gebeurd is" maakt een geschiedenis onleesbaar.
 *
 * ## Wat hier NIET zit
 *
 * Geen force, geen rebase, geen amend, en geen keuze van branch. Die
 * bewakingen staan in agent_runner.py, aan de kant die het werk doet -- een
 * knop die ze hier zou herhalen, geeft je twee plekken die het oneens kunnen
 * worden over wat mag.
 */
import { useState, useCallback, useEffect } from 'react';
import { GitCommit, RefreshCw, Loader2 } from 'lucide-react';
import {
  agentWijzigingen, agentCommit,
  type WerkboomStatus, type AgentCommitResult,
} from '@/infrastructure/gateways/axeCoreApiService';

interface Props {
  /** Een naam van de whitelist, nooit een pad. */
  repo: string;
  /** Stijgt na elke geslaagde agent-run, zodat de lijst zichzelf ververst. */
  runTeller?: number;
}

export function AgentCommitBalk({ repo, runTeller = 0 }: Props) {
  const [stand, setStand] = useState<WerkboomStatus | null>(null);
  const [laadt, setLaadt] = useState(false);
  const [bericht, setBericht] = useState('');
  const [bezig, setBezig] = useState(false);
  const [uitslag, setUitslag] = useState<AgentCommitResult | null>(null);

  const ververs = useCallback(async () => {
    if (!repo) { setStand(null); return; }
    setLaadt(true);
    try {
      setStand(await agentWijzigingen(repo));
    } catch (e) {
      setStand({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaadt(false);
    }
  }, [repo]);

  // Ook op runTeller: na een run is de hele reden dat je hier kijkt dat er iets
  // veranderd zou moeten zijn. Handmatig moeten verversen om te zien of de
  // agent iets deed, leest als "er is niets gebeurd".
  useEffect(() => { void ververs(); }, [ververs, runTeller]);

  const commit = useCallback(async () => {
    if (!bericht.trim() || bezig) return;
    setBezig(true);
    setUitslag(null);
    try {
      const r = await agentCommit(repo, bericht.trim(), true);
      setUitslag(r);
      if (r.status === 'ok') setBericht('');
      await ververs();
    } catch (e) {
      setUitslag({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBezig(false);
    }
  }, [repo, bericht, bezig, ververs]);

  if (!repo) return null;

  const bestanden = stand?.bestanden ?? [];
  const schoon = stand?.status === 'ok' && stand.schoon;

  return (
    <div className="axe-surface--flat rounded-card p-3 text-[11px] flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Wijzigingen in {repo}
          {stand?.branch ? <span style={{ color: 'var(--text-muted)' }}> · {stand.branch}</span> : null}
        </span>
        <button
          onClick={() => void ververs()}
          disabled={laadt}
          title="Opnieuw lezen wat er in de checkout staat"
          className="opacity-70 hover:opacity-100"
        >
          {laadt ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>

      {stand?.status === 'error' && (
        <span style={{ color: 'var(--m-broken)' }}>{stand.error}</span>
      )}

      {schoon && (
        <span style={{ color: 'var(--text-muted)' }}>
          Niets gewijzigd — er valt niets vast te leggen.
        </span>
      )}

      {bestanden.length > 0 && (
        <ul className="max-h-32 overflow-auto flex flex-col gap-0.5 font-mono">
          {bestanden.map(b => (
            <li key={b.pad} className="flex gap-2">
              {/* De twee tekens van git zelf, niet vertaald. "M" en "??"
                  betekenen iets precieps; er een woord van maken zou een
                  interpretatie toevoegen die we niet hoeven te maken. */}
              <span style={{ color: 'var(--text-muted)', minWidth: 18 }}>{b.staat || '·'}</span>
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{b.pad}</span>
            </li>
          ))}
        </ul>
      )}

      {bestanden.length > 0 && (
        <div className="flex gap-2 items-center">
          <input
            value={bericht}
            onChange={e => setBericht(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void commit(); }}
            placeholder="commitbericht — wat en waarom"
            className="flex-1 bg-transparent outline-none rounded-card px-2 py-1"
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={() => void commit()}
            disabled={bezig || !bericht.trim()}
            title={bericht.trim() ? 'Vastleggen en naar origin duwen' : 'Een commitbericht is verplicht'}
            className="flex items-center gap-1 px-2 py-1 rounded-card disabled:opacity-40"
            style={{ border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
          >
            {bezig ? <Loader2 size={12} className="animate-spin" /> : <GitCommit size={12} />}
            commit &amp; push
          </button>
        </div>
      )}

      {uitslag && (
        <span style={{ color: uitslag.status === 'ok' ? 'var(--m-happened)' : 'var(--m-broken)' }}>
          {uitslag.status === 'ok'
            ? `${uitslag.sha} op ${uitslag.branch}${uitslag.gepusht ? ' — gepusht' : ' — lokaal'}`
            /* Bij een mislukte push staat de commit er WEL. Dat hoort in beeld,
               anders denk je dat er niets gebeurd is en doe je het opnieuw. */
            : `${uitslag.error}${uitslag.gecommit ? ' (de commit staat lokaal wél)' : ''}`}
        </span>
      )}
    </div>
  );
}
