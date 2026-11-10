/**
 * Headless Trading Team TEST runner (Mac exec / vite-node).
 * Never prints tokens, secrets, or full .env.
 * Fail closed: only the allowlisted MT5 DEMO 500K may proceed, and only
 * after a fresh MetaAPI tradeMode check confirms DEMO.
 */
const LOCAL = 'http://127.0.0.1:8001';
const origFetch = globalThis.fetch.bind(globalThis);
const apiKey = process.env.AXE_CORE_API_KEY || process.env.VITE_AXE_CORE_API_KEY || '';
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith('/proxy/axecore')) url = LOCAL + url.slice('/proxy/axecore'.length);
  else if (url.startsWith('/api/proxy/axecore')) url = LOCAL + url.slice('/api/proxy/axecore'.length);
  const headers = new Headers(
    init?.headers || (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined),
  );
  if (url.startsWith(LOCAL) && apiKey && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${apiKey}`);
  }
  return origFetch(url, { ...init, headers });
}) as typeof fetch;

function parseIds(raw: string | undefined): string[] {
  return (raw ?? '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

async function inspect() {
  const { getAccounts } = await import('@/infrastructure/persistence/tradingAccountsService');
  const { metaApiAccountInfoFor } = await import('@/infrastructure/gateways/metaApiService');
  const {
    candidatesFromTradingAccounts,
    resolveAllowedAccount,
    demoTradeModeGuard,
    indexCompanionBrokersByMetaApiId,
  } = await import('@/application/tradingTeam/accountAllowlist');
  const { sbGetRows } = await import('@/infrastructure/gateways/axeCoreApiService');

  const metaIds = parseIds(process.env.AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS);
  const brokerIds = parseIds(process.env.AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS);
  const auto = process.env.AXE_TRADING_TEAM_AUTO_EXECUTE === '1';
  console.log(JSON.stringify({
    allowlist: {
      meta_count: metaIds.length,
      broker_count: brokerIds.length,
      auto_execute: auto,
    },
  }));
  if (metaIds.length !== 1 || brokerIds.length !== 1) {
    throw new Error('allowlist must contain exactly one MetaAPI id and one broker id — refuse');
  }

  const state = await getAccounts();
  let brokerIndex = new Map();
  try {
    const rows = [];
    for (const id of state.accounts.map(a => a.accountId)) {
      const found = await sbGetRows('user_broker_accounts', {
        limit: 5,
        filterCol: 'external_connection_id',
        filterVal: id,
      });
      rows.push(...(found ?? []));
    }
    brokerIndex = indexCompanionBrokersByMetaApiId(rows);
  } catch {
    // candidatesFromTradingAccounts still applies the 1:1 env binding
  }

  const candidates = candidatesFromTradingAccounts(state.accounts, brokerIndex);
  const guard = resolveAllowedAccount(candidates);
  console.log(JSON.stringify({
    stored_n: state.accounts.length,
    guard: {
      status: guard.status,
      reason: guard.reason,
      accountId: guard.accountId,
      accountLabel: guard.accountLabel,
      companionBrokerAccountId: guard.companionBrokerAccountId ?? null,
      is_allowlisted_meta: guard.accountId === metaIds[0],
      is_allowlisted_broker: guard.companionBrokerAccountId === brokerIds[0],
    },
  }));
  if (
    guard.status !== 'allowed' ||
    guard.accountId !== metaIds[0] ||
    guard.companionBrokerAccountId !== brokerIds[0]
  ) {
    throw new Error('allowlist did not resolve to the configured 500k demo — refuse');
  }

  const acct = state.accounts.find(a => a.accountId === guard.accountId);
  if (!acct?.token) throw new Error('allowlisted account has no token in the Core store — refuse');

  const info = await metaApiAccountInfoFor({
    token: acct.token,
    accountId: acct.accountId,
    region: acct.region,
    enabled: true,
    updatedAt: new Date().toISOString(),
  });
  if (!info.ok) throw new Error(`MetaAPI account-information failed: ${info.error}`);
  const mode = demoTradeModeGuard(info.info.tradeMode);
  console.log(JSON.stringify({
    metaapi: {
      tradeMode: info.info.tradeMode,
      guardOk: mode.ok,
      currency: info.info.currency,
      equity: info.info.equity,
      balance: info.info.balance,
    },
  }));
  if (!mode.ok) throw new Error(mode.reason);
  return { auto };
}

async function persistRun(result: {
  cycleId: string;
  status: string;
  runRowId?: string | null;
  guard?: Record<string, unknown>;
  scout?: Record<string, unknown>;
  news?: unknown;
  sentiment?: unknown;
  charts?: unknown;
  risk?: unknown;
  decision?: { verdict?: string; confidence?: number; proposal?: { symbol?: string; side?: string } | null };
  execution?: Record<string, unknown>;
  error?: string | null;
}) {
  if (result.runRowId) return result.runRowId;
  const proposal = result.decision?.proposal ?? null;
  const res = await fetch(`${LOCAL}/supabase/table/core_trading_team_runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        cycle_id: result.cycleId,
        status: result.status,
        mode: 'test',
        account_id: result.guard?.accountId ?? null,
        account_label: result.guard?.accountLabel ?? null,
        companion_broker_account_id: result.guard?.companionBrokerAccountId ?? null,
        account_guard: result.guard?.status ?? null,
        account_guard_reason: result.guard?.reason ?? null,
        scout: result.scout ?? {},
        news: result.news ?? {},
        sentiment: result.sentiment ?? {},
        charts: result.charts ?? {},
        risk: result.risk ?? {},
        decision: result.decision ?? {},
        verdict: result.decision?.verdict ?? null,
        confidence: result.decision?.confidence ?? null,
        symbol: proposal?.symbol ?? null,
        side: proposal?.side ?? null,
        proposal: proposal ?? {},
        execution: result.execution ?? {},
        error: result.error ?? null,
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.log(JSON.stringify({ persist_run: 'fail', http: res.status, detail: txt.slice(0, 300) }));
    return null;
  }
  const rows = await res.json();
  const id = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
  console.log(JSON.stringify({ persist_run: 'ok', id }));
  return id;
}

async function main() {
  const mode = process.argv.includes('--run') ? 'run' : 'inspect';
  const { auto } = await inspect();
  if (mode !== 'run') {
    console.log(JSON.stringify({ inspect_ok: true, would_auto_execute: auto }));
    return;
  }
  if (!auto) {
    throw new Error('AXE_TRADING_TEAM_AUTO_EXECUTE is not 1 — not placing orders');
  }
  const { runTradingTeamCycle } = await import('@/application/tradingTeam/runTradingTeamCycle');
  const result = await runTradingTeamCycle();
  result.runRowId = (await persistRun(result)) ?? result.runRowId ?? null;
  const exec = (result.execution ?? {}) as Record<string, unknown>;
  console.log(JSON.stringify({
    cycle: {
      cycleId: result.cycleId,
      status: result.status,
      verdict: result.decision?.verdict,
      confidence: result.decision?.confidence,
      summary: result.decision?.summary,
      proposal: result.decision?.proposal
        ? {
            symbol: result.decision.proposal.symbol,
            side: result.decision.proposal.side,
            lots: result.decision.proposal.lots,
          }
        : null,
      execution: {
        attempted: exec.attempted ?? false,
        ok: exec.ok ?? null,
        tradeId: exec.tradeId ?? null,
        venue: exec.venue ?? null,
        error: exec.error ?? null,
        reason: exec.reason ?? null,
        accountId: exec.accountId ?? result.guard?.accountId ?? null,
        accountLabel: exec.accountLabel ?? result.guard?.accountLabel ?? null,
      },
      guard: {
        status: result.guard?.status,
        accountId: result.guard?.accountId,
        accountLabel: result.guard?.accountLabel,
        companionBrokerAccountId: result.guard?.companionBrokerAccountId ?? null,
      },
      runRowId: result.runRowId ?? null,
      error: result.error ?? null,
    },
  }));
}

main().catch((e) => {
  console.error('REFUSE:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
