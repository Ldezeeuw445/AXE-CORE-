/**
 * SettingsDrawer — MetaAPI connection + risk mode, moved out of the main
 * tab flow behind the gear icon in StatusStrip. This is config you touch
 * once in a while, not activity you watch — it shouldn't compete with the
 * chart/journal/chat for room.
 */
import { X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import type { MetaApiRegion } from '@/infrastructure/gateways/metaApiService';
import type { RiskMode } from '@/domain/tradingIntel/botTypes';
import type { TradingDeskState } from './useTradingDeskState';

export function SettingsDrawer({ desk, onClose }: { desk: TradingDeskState; onClose: () => void }) {
  const {
    metaToken, setMetaToken, metaAccountId, setMetaAccountId, metaRegion, setMetaRegion,
    metaAccounts, metaAccountsLoading, refreshMetaAccounts,
    showNewMetaAccount, setShowNewMetaAccount,
    newMetaLogin, setNewMetaLogin, newMetaPassword, setNewMetaPassword,
    newMetaServer, setNewMetaServer, newMetaName, setNewMetaName,
    provisioning, setProvisioning,
    broker, risk, reload,
    saveMetaApiConfig, metaApiGetAccount, metaApiAccountId, metaApiProvisionAccount, connectBrokerKind,
    setRiskMode,
  } = desk;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="h-full w-[380px] overflow-y-auto p-3 space-y-3"
        style={{ background: '#0A0A0A', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[13px] font-semibold" style={{ color: '#F5F0E6' }}>Broker & risk settings</span>
          <button type="button" onClick={onClose} style={{ color: 'rgba(255,255,255,0.5)' }}><X size={16} /></button>
        </div>

        <WidgetCard title="MetaAPI / MT5">
          <div className="grid gap-2">
            <input
              value={metaToken}
              onChange={e => setMetaToken(e.target.value)}
              placeholder="MetaAPI token"
              className="rounded px-2 py-1.5 text-[12px]"
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
            />
            {metaAccounts.length > 0 ? (
              <select
                value={metaAccountId}
                onChange={e => setMetaAccountId(e.target.value)}
                className="rounded px-2 py-1.5 text-[12px]"
                style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
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
                className="rounded px-2 py-1.5 text-[12px]"
                style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
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
                <input value={newMetaName} onChange={e => setNewMetaName(e.target.value)} placeholder="Name (e.g. IC Markets Demo)"
                  className="rounded px-2 py-1.5 text-[12px]" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                <input value={newMetaLogin} onChange={e => setNewMetaLogin(e.target.value)} placeholder="MT5 login (numbers only)"
                  className="rounded px-2 py-1.5 text-[12px]" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                <input value={newMetaPassword} onChange={e => setNewMetaPassword(e.target.value)} type="password" placeholder="MT5 master password (trading, not investor)"
                  className="rounded px-2 py-1.5 text-[12px]" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                <input value={newMetaServer} onChange={e => setNewMetaServer(e.target.value)} placeholder="Server (e.g. ICMarketsSC-Demo)"
                  className="rounded px-2 py-1.5 text-[12px]" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
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
                className="rounded px-2 py-1.5 text-[12px] flex-1"
                style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
              >
                {['london', 'new-york', 'singapore', 'tokyo'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                type="button"
                className="px-3 py-1.5 rounded text-[12px]"
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
          <div className="flex gap-2">
            {([['personal_demo', 'personal'], ['funded_challenge', 'funded']] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => void setRiskMode(m as RiskMode)}
                className="px-3 py-1 rounded text-[11px]"
                style={{
                  color: risk?.mode === m ? '#F5F0E6' : 'rgba(255,255,255,0.4)',
                  background: risk?.mode === m ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.04)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {risk && (
            <p className="text-[11px] mt-2 font-mono-data" style={{ color: 'rgba(255,255,255,0.45)' }}>
              riskPerTrade {(risk.riskPerTradePct * 100).toFixed(1)}% · maxTrades/day {risk.maxTradesPerDay} · dailyLoss {(risk.maxDailyLossPct * 100).toFixed(1)}%
            </p>
          )}
        </WidgetCard>
      </div>
    </div>
  );
}
