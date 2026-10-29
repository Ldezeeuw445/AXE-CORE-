# AXE Trading Team TEST (6 bots)

Built in AXE Core (`orchestrator`). Visible in Companion via shared Supabase table `core_trading_team_runs`.

## Flow

Scout → (News ∥ Sentiment ∥ Charts) → Risk → Decision

Default **propose-only**. Optional demo fills: `AXE_TRADING_TEAM_AUTO_EXECUTE=1` (still allowlist + preTradeGate).

## Hard guard (fail closed)

Only the Companion **MT5 DEMO 500K** (MetaQuotes-Demo). Never live / personal real / Upcomers prop.

Env (recommended — set the real MetaAPI account UUID from Core Accounts / Companion `external_connection_id`):

```bash
AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS=<metaapi-uuid-of-500k-demo>
# optional Companion row id:
AXE_TRADING_TEAM_ALLOWED_BROKER_ACCOUNT_IDS=<user_broker_accounts.id>
AXE_TRADING_TEAM_AUTO_EXECUTE=0   # 1 only when you want demo orders
```

Without env IDs, the module accepts exactly one Core account whose label matches `MT5 DEMO 500K` (heuristic). Ambiguous or missing → reject.

## Switch on

1. Apply migration `supabase/migrations/20261029233000_core_trading_team.sql` (creates `core_trading_team_runs` + disabled cron `axe_core:trading-team-test-15m`).
2. Set allowlist env on the Core/desktop host that runs cycles.
3. Open Trading Intel → **Team** tab → **Run cycle** (or enable the `core_schedules` row once a webhook path exists).
4. Watch rows in Core Team tab and Companion `/trading-team`. Demo fills appear on the 500k account after MT5 sync.

## Cron

Schedule row is inserted **disabled**. Enable only after allowlist env is set. Action type `webhook` / job_key `axe_core:trading-team-test-15m`.

## Strategy: Gold ORB 1AM NY

Pluggable Scout strategy on **XAUUSD m5** (demo only via the same allowlist).

- ORB = high/low **01:00–01:15 America/New_York**
- Entry: 5m close outside range → next bar open, window **01:15–03:40**; SL = other side of range; **TP = 0.5R**
- Size: `floor(risk / stopDistance)` with risk = `AXE_GOLD_ORB_RISK_PERCENT` (default **0.35%**) of `AXE_GOLD_ORB_EQUITY` (default **500000**), capped by `AXE_GOLD_ORB_MAX_LOTS`
- Max 2 trades/day, reversal OK, flat **06:00 NY** (enforced in backtest engine)
- Filters (trend / extension / **volatility** / volume / candle / VWAP). Default: **only volatility ON**. Mode `AXE_GOLD_ORB_FILTER_MODE=all|n-of-m|weighted`. Rejected filters kill the NY day.

```bash
# optional tuning
AXE_GOLD_ORB_RISK_PERCENT=0.35
AXE_GOLD_ORB_EQUITY=500000
AXE_GOLD_ORB_FILTER_VOLATILITY=1
AXE_GOLD_ORB_FILTER_TREND=0
# …
```

Pure backtest: `backtestGoldOrb(bars, config)` in `application/tradingTeam/strategies/goldOrb1amNy.ts` (also Team tab button when m5 cache exists). Claims from the source reel are unverified — prove on history + demo first.
