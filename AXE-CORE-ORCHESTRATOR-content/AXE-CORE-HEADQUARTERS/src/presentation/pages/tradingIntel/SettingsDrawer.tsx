/**
 * SettingsDrawer — every trading-desk knob in one place behind the gear:
 * MetaAPI/MT5 connection, editable risk parameters (all of them, not just the
 * mode preset), autopilot cadence, the trading model, and autopilot scope.
 * Config you touch occasionally — kept out of the chart/journal/chat flow.
 */
import { useEffect, useState } from 'react';
import { X, RefreshCw, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import type { MetaApiRegion } from '@/infrastructure/gateways/metaApiService';
import type { RiskMode, RiskProfile } from '@/domain/tradingIntel/botTypes';
import { getAccounts, type TradingAccount } from '@/infrastructure/persistence/tradingAccountsService';
import { getRiskProfile, saveRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import { PROVIDERS } from '@/domain/providers';
import type { TradingDeskState } from './useTradingDeskState';

const INPUT_CLS = 'rounded px-2 py-1.5 text-[12px] w-full';
const INPUT_STYLE = { background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' } as const;

/** A labelled percentage field: stores a fraction (0.02), shows a percent (2). */
function PctField({ label, value, onCommit, max = 100, hint }: {
  label: string; value: number; onCommit: (fraction: number) => void; max?: number; hint?: string;
}) {
  const [draft, setDraft] = useState((value * 100).toString());
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number" step="0.1" min={0} max={max} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { const n = parseFloat(draft); if (Number.isFinite(n)) onCommit(n / 100); else setDraft((value * 100).toString()); }}
          className={INPUT_CLS} style={INPUT_STYLE}
        />
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>%</span>
      </div>
      {hint && <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{hint}</span>}
    </label>
  );
}

function NumField({ label, value, onCommit, step = 1, min = 1, max = 200, hint }: {
  label: string; value: number; onCommit: (n: number) => void; step?: number; min?: number; max?: number; hint?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <input
        type="number" step={step} min={min} max={max} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const n = parseFloat(draft); if (Number.isFinite(n)) onCommit(n); else setDraft(String(value)); }}
        className={INPUT_CLS} style={INPUT_STYLE}
      />
      {hint && <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{hint}</span>}
    </label>
  );
}

const AUTOPILOT_CADENCES = [5, 10, 15, 30, 60, 120, 240];
/** Providers the user can pick as the dedicated trading model. */
const TRADING_PROVIDER_IDS = ['anthropic', 'google', 'openai', 'xai', 'groq', 'openrouter', 'ollama'] as const;

export function SettingsDrawer({ desk, onClose, inline = false }: { desk: TradingDeskState; onClose: () => void; inline?: boolean }) {
  const {
    metaToken, setMetaToken, metaAccountId, setMetaAccountId, metaRegion, setMetaRegion,
    metaAccounts, metaAccountsLoading, refreshMetaAccounts,
    showNewMetaAccount, setShowNewMetaAccount,
    newMetaLogin, setNewMetaLogin, newMetaPassword, setNewMetaPassword,
    newMetaServer, setNewMetaServer, newMetaName, setNewMetaName,
    provisioning, setProvisioning,
    broker, risk, reload,
    saveMetaApiConfig, metaApiGetAccount, metaApiAccountId, metaApiProvisionAccount, connectBrokerKind,
    setRiskMode, updateRiskProfile,
    autopilot, autopilotBusy, toggleAutopilot, setAutopilotCadence, runAutopilotNow,
    tradingModel, setTradingModel,
    scanAllPairs, toggleScanAllPairs,
  } = desk;

  /* ── Risico PER ACCOUNT ────────────────────────────────────────────────
   *
   * De opslag kon dit al: `tradingRiskService.keyFor(accountId)` bewaart een
   * profiel per account en laat een account zonder eigen profiel de
   * bureau-standaard erven. De engine leest het ook al per account. Alleen dit
   * scherm kende de vraag niet, dus stond er in de praktijk één profiel voor
   * alles.
   *
   * Dat is fout in de richting die geld kost: een prop-challenge met 6% totale
   * drawdown kan niet hetzelfde risico per trade lopen als een persoonlijke
   * demo, en de strengste van de twee hoort te winnen op zijn eigen account
   * zonder de andere mee te trekken.
   *
   * `null` is met opzet de eerste keuze en de standaard: dat is de bestaande
   * bureau-brede instelling, en wie hier nooit iets kiest merkt geen verschil.
   */
  const [risicoAccount, setRisicoAccount] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [eigenRisk, setEigenRisk] = useState<RiskProfile | null>(null);
  const [risicoBezig, setRisicoBezig] = useState(false);

  useEffect(() => {
    let levend = true;
    void getAccounts()
      .then(st => { if (levend) setAccounts(st.accounts.filter(a => a.enabled)); })
      .catch(() => { /* geen accounts is een lege kiezer, geen fout */ });
    return () => { levend = false; };
  }, []);

  /* Het profiel van het gekozen account ophalen. Bij `null` doet dit niets --
     dan is `risk` uit de desk-state de bron, precies zoals het was. */
  useEffect(() => {
    if (!risicoAccount) { setEigenRisk(null); return; }
    let levend = true;
    setRisicoBezig(true);
    void getRiskProfile(risicoAccount)
      .then(p => { if (levend) setEigenRisk(p); })
      .catch(() => { if (levend) setEigenRisk(null); })
      .finally(() => { if (levend) setRisicoBezig(false); });
    return () => { levend = false; };
  }, [risicoAccount]);

  /** Wat er nu getoond en bewerkt wordt: het account, of het bureau. */
  const actiefRisk: RiskProfile | null = risicoAccount ? eigenRisk : risk;

  const commit = (patch: Partial<RiskProfile>) => {
    if (!risicoAccount) { void updateRiskProfile(patch); return; }
    if (!eigenRisk) return;
    const next = { ...eigenRisk, ...patch };
    /* Meteen tonen en dan pas bewaren: een schuifregelaar die terugspringt
       terwijl de schrijfactie loopt leest als een geweigerde invoer. */
    setEigenRisk(next);
    void saveRiskProfile(next, risicoAccount).catch(() => setEigenRisk(eigenRisk));
  };

  /* ── Twee vormen, één inhoud ──────────────────────────────────────────
   *
   * Als LADE: een schermvullende overlay met een paneel erin, zoals hij altijd
   * was. Als INLINE: alleen de inhoud, want dan hangt hij al in de rechter
   * schuifbalk en levert die het vlak. Zonder dit onderscheid krijg je een
   * lade in een lade -- twee vlakken over elkaar, met een onzichtbare
   * fixed-overlay eroverheen die de rest van het scherm afvangt. */
  const inhoud = (
    <div className={inline ? 'space-y-3' : 'h-full w-[380px] max-w-[92vw] overflow-y-auto p-3 space-y-3'}
      style={inline ? undefined : { background: 'var(--bg-surface)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
      onClick={inline ? undefined : (e => e.stopPropagation())}
    >
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[13px] font-semibold" style={{ color: '#F5F0E6' }}>Trading settings</span>
          <button type="button" onClick={onClose} style={{ color: 'rgba(255,255,255,0.5)' }}><X size={16} /></button>
        </div>

        <WidgetCard title="MetaAPI / MT5">
          <div className="grid gap-2">
            <input
              value={metaToken}
              onChange={e => setMetaToken(e.target.value)}
              placeholder="MetaAPI token"
              className={INPUT_CLS} style={INPUT_STYLE}
            />
            {metaAccounts.length > 0 ? (
              <select
                value={metaAccountId}
                onChange={e => setMetaAccountId(e.target.value)}
                className={INPUT_CLS} style={INPUT_STYLE}
              >
                <option value="">Select account…</option>
                {metaAccounts.map(a => {
                  const id = metaApiAccountId(a);
                  if (!id) return null;
                  return (
                    <option key={id} value={id}>
                      {a.name || a.login} · {a.server} · {a.type === 'cloud-g2' || a.type === 'cloud' ? 'demo/live' : a.type}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input
                value={metaAccountId}
                onChange={e => setMetaAccountId(e.target.value)}
                placeholder="Account ID"
                className={INPUT_CLS} style={INPUT_STYLE}
              />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshMetaAccounts(metaToken)}
                disabled={!metaToken || metaAccountsLoading}
                className="text-[10px] flex items-center gap-1"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <RefreshCw size={10} className={metaAccountsLoading ? 'animate-spin' : ''} />
                {metaAccounts.length ? `${metaAccounts.length} accounts on this token` : 'List accounts for this token'}
              </button>
              <div className="flex-1" />
              <button type="button" onClick={() => setShowNewMetaAccount(v => !v)} className="text-[10px]" style={{ color: '#c4b5fd' }}>
                {showNewMetaAccount ? 'Cancel' : '+ Add MT5 account'}
              </button>
            </div>

            {showNewMetaAccount && (
              <div className="grid gap-2 p-2 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Enter your broker's MT5 login/password/server (same as MetaTrader itself). MetaAPI stores these and hands back an account ID — AXE never sees them again after this.
                </p>
                <input value={newMetaName} onChange={e => setNewMetaName(e.target.value)} placeholder="Name (e.g. IC Markets Demo)" className={INPUT_CLS} style={INPUT_STYLE} />
                <input value={newMetaLogin} onChange={e => setNewMetaLogin(e.target.value)} placeholder="MT5 login (numbers only)" className={INPUT_CLS} style={INPUT_STYLE} />
                <input value={newMetaPassword} onChange={e => setNewMetaPassword(e.target.value)} type="password" placeholder="MT5 master password (trading, not investor)" className={INPUT_CLS} style={INPUT_STYLE} />
                <input value={newMetaServer} onChange={e => setNewMetaServer(e.target.value)} placeholder="Server (e.g. ICMarketsSC-Demo)" className={INPUT_CLS} style={INPUT_STYLE} />
                <button
                  type="button"
                  disabled={provisioning || !metaToken || !newMetaLogin || !newMetaPassword || !newMetaServer}
                  onClick={async () => {
                    setProvisioning(true);
                    try {
                      const res = await metaApiProvisionAccount({
                        token: metaToken, login: newMetaLogin, password: newMetaPassword,
                        name: newMetaName, server: newMetaServer, region: metaRegion,
                      });
                      if (!res.ok) { toast.error(res.error); return; }
                      toast.success('MT5 account created — connecting…');
                      setMetaAccountId(res.accountId);
                      await saveMetaApiConfig({ token: metaToken, accountId: res.accountId, region: metaRegion, enabled: true });
                      await refreshMetaAccounts(metaToken);
                      setShowNewMetaAccount(false);
                      setNewMetaLogin(''); setNewMetaPassword(''); setNewMetaServer(''); setNewMetaName('');
                      await connectBrokerKind('mt5_demo');
                      await reload();
                    } finally {
                      setProvisioning(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded text-[12px] disabled:opacity-40"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#6ee7b7' }}
                >
                  {provisioning ? 'Creating…' : 'Create & connect'}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <select
                value={metaRegion}
                onChange={e => setMetaRegion(e.target.value as MetaApiRegion)}
                className={INPUT_CLS} style={{ ...INPUT_STYLE, flex: 1 }}
              >
                {['london', 'new-york', 'singapore', 'tokyo'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                type="button"
                className="px-3 py-1.5 rounded text-[12px] whitespace-nowrap"
                style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd' }}
                onClick={async () => {
                  await saveMetaApiConfig({ token: metaToken, accountId: metaAccountId, region: metaRegion, enabled: true });
                  const probe = await metaApiGetAccount();
                  toast[probe.ok ? 'success' : 'error'](probe.ok ? 'MetaAPI connected' : probe.error);
                  await connectBrokerKind('mt5_demo');
                  await reload();
                }}
              >
                Save & probe
              </button>
            </div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Broker: {broker?.label || '—'} · {broker?.connected ? 'connected' : 'offline'}
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Risk">
          {/* WIENS risico je bewerkt, boven WAT je bewerkt. Stond deze kiezer
              er niet, dan leek dit scherm één stel regels voor alles -- terwijl
              de opslag en de engine allang per account werkten. */}
          {accounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[10px] mr-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Voor:</span>
              {[{ id: null as string | null, label: 'Bureau (standaard)' },
                ...accounts.map(a => ({ id: a.accountId as string | null, label: a.label }))].map(k => (
                <button
                  key={k.id ?? 'bureau'}
                  type="button"
                  onClick={() => setRisicoAccount(k.id)}
                  className="px-2 py-0.5 rounded text-[10px]"
                  style={{
                    color: risicoAccount === k.id ? '#F5F0E6' : 'rgba(255,255,255,0.4)',
                    background: risicoAccount === k.id ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)',
                  }}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}
          {risicoAccount && (
            <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Alleen voor dit account. Een account zonder eigen waarden erft de bureau-standaard.
            </p>
          )}
          <div className="flex gap-2 mb-3">
            {([['personal_demo', 'personal'], ['funded_challenge', 'funded'], ['funded_live_rules', 'funded live']] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (!risicoAccount) { void setRiskMode(m as RiskMode); return; }
                  /* Per account zet de modus alleen de MODUS, en laat de rest
                     staan: een preset die de zorgvuldig ingestelde drawdown van
                     een prop-account terugzet is precies wat je hier niet wilt. */
                  commit({ mode: m as RiskMode });
                }}
                className="px-2.5 py-1 rounded text-[11px]"
                style={{
                  color: actiefRisk?.mode === m ? '#F5F0E6' : 'rgba(255,255,255,0.4)',
                  background: actiefRisk?.mode === m ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
            A preset seeds these; edit any value to fine-tune. Autopilot and the risk engine read these live.
          </p>
          {actiefRisk ? (
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
              <PctField label="Risk / trade" value={actiefRisk.riskPerTradePct} max={50} onCommit={v => commit({ riskPerTradePct: v })} hint="of equity per position" />
              <PctField label="Max open risk" value={actiefRisk.maxOpenRiskPct} onCommit={v => commit({ maxOpenRiskPct: v })} hint="all positions combined" />
              <PctField label="Daily loss halt" value={actiefRisk.maxDailyLossPct} onCommit={v => commit({ maxDailyLossPct: v })} hint="stops trading for the day" />
              <PctField label="Max drawdown" value={actiefRisk.maxDrawdownPct ?? 0.12} onCommit={v => commit({ maxDrawdownPct: v })} hint="peak-to-trough breaker" />
              <NumField label="Max trades / day" value={actiefRisk.maxTradesPerDay} onCommit={v => commit({ maxTradesPerDay: v })} />
              <PctField label="Min confidence" value={actiefRisk.minConfidence} onCommit={v => commit({ minConfidence: v })} hint="floor to allow a fill" />
              {actiefRisk.mode !== 'personal_demo' && (
                <PctField label="Profit target" value={actiefRisk.profitTargetPct ?? 0.1} max={500} onCommit={v => commit({ profitTargetPct: v })} hint="challenge goal" />
              )}
              <label className="flex items-center gap-2 self-end pb-1.5">
                <input type="checkbox" checked={actiefRisk.allowShort} onChange={e => commit({ allowShort: e.target.checked })} />
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Allow short</span>
              </label>
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{risicoBezig ? 'Profiel laden…' : 'Loading risk profile…'}</p>
          )}
        </WidgetCard>

        <WidgetCard title="Autopilot">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              disabled={autopilotBusy || !autopilot}
              onClick={() => void toggleAutopilot()}
              className="px-3 py-1.5 rounded text-[12px] disabled:opacity-40"
              style={{
                background: autopilot?.enabled ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                color: autopilot?.enabled ? '#6ee7b7' : 'rgba(255,255,255,0.6)',
              }}
            >
              {autopilotBusy ? <Loader2 size={12} className="inline animate-spin" /> : null} {autopilot?.enabled ? 'Armed — stop' : 'Arm autopilot'}
            </button>
            <button
              type="button"
              onClick={() => void runAutopilotNow()}
              className="px-2.5 py-1.5 rounded text-[12px] flex items-center gap-1"
              style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd' }}
            >
              <Play size={11} /> Run now
            </button>
          </div>
          <label className="grid gap-1">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Cycle every</span>
            <select
              value={autopilot?.intervalMin ?? 30}
              onChange={e => void setAutopilotCadence(parseInt(e.target.value, 10))}
              className={INPUT_CLS} style={INPUT_STYLE}
            >
              {AUTOPILOT_CADENCES.map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
          </label>
          <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {autopilot?.lastRunAt ? `Last cycle ${new Date(autopilot.lastRunAt).toLocaleString('en-US')}` : 'No cycle run yet.'}
            {autopilot?.lastResult ? ` · ${autopilot.lastResult}` : ''}
          </p>
        </WidgetCard>

        <WidgetCard title="Trading model">
          <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
            The model AXE reasons with for trading (synthesis + the fallback when the VPS research crew is down). Auto uses the normal router.
          </p>
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Provider</span>
              <select
                value={tradingModel.provider}
                onChange={e => {
                  const provider = e.target.value as TradingDeskState['tradingModel']['provider'];
                  const def = PROVIDERS.find(p => p.id === provider)?.defaultModel ?? '';
                  void setTradingModel({ provider, model: provider ? def : '' });
                }}
                className={INPUT_CLS} style={INPUT_STYLE}
              >
                <option value="">Auto (router decides)</option>
                {TRADING_PROVIDER_IDS.map(id => {
                  const cfg = PROVIDERS.find(p => p.id === id);
                  return <option key={id} value={id}>{cfg?.name ?? id}</option>;
                })}
              </select>
            </label>
            {tradingModel.provider && (
              <label className="grid gap-1">
                <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Model</span>
                <input
                  value={tradingModel.model ?? ''}
                  onChange={e => void setTradingModel({ ...tradingModel, model: e.target.value })}
                  placeholder={PROVIDERS.find(p => p.id === tradingModel.provider)?.defaultModel ?? 'model id'}
                  className={INPUT_CLS} style={INPUT_STYLE}
                />
              </label>
            )}
          </div>
        </WidgetCard>

        <WidgetCard title="Autopilot scope">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scanAllPairs}
              onChange={e => toggleScanAllPairs(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Scan all pairs, not just the watchlist. Each cycle first runs a cheap technical-only
              screen (no CrewAI) across the full pair list, then only spends a full research +
              decision cycle on pairs the screen actually flags — capped at 6 extra pairs per run,
              on top of the watchlist.
            </span>
          </label>
        </WidgetCard>
      </div>
  );

  if (inline) return inhoud;
  return (
    <div className="fixed inset-0 z-[80] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      {inhoud}
    </div>
  );
}
