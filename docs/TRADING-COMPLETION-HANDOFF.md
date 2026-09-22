# AXE CORE Trading — completion handoff

Living handoff for the Trading completion work (forensic audit → implementation).
Updated at every phase checkpoint. If a session ends mid-way, the next one starts
here.

- **Branch:** `claude/trading-completion` (pushed to `origin`)
- **Base:** canonical `orchestrator` at `3125fe0d` (PR #156). No merge to
  `orchestrator` has been done — the plan is a reviewable PR.
- **Worktree used:** `/Users/lukadezeeuw/Projects/AXE-CORE-/.claude/worktrees/vervolgwerk-ffb569`
- **App code:** `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/`
- **No real trade was placed** at any point. All order paths are tested against
  `vi.fn()` MetaAPI mocks.

---

## Status at a glance

| Phase | What | Status | Commit |
|---|---|---|---|
| 0A | Research Crew specialists reach `run_crew_kickoff` | ✅ done | `661d93e4` |
| 0B | Manual orders go through the same pre-trade gate as AXE Algo | ✅ done | `16f0dcda` |
| 1 | Risk % = money at the stop; account rules enforced | ✅ done | `7bff9cbd` |
| 2 | Paper / demo / live evidence separated; Intel & Companion scored on outcomes | ✅ done | `dfedb76f` |
| — | Fix: close a long by position id (not a market SELL on hedging accounts) | ✅ done | `3d2611de` |
| 3 | Framework live eligibility (nt:/kr:/ta:) | ✅ done | `2e6fc370` |
| 4 | Strategy Lab: trades + equity surfaced; realistic account simulation | ✅ done | `bb4f0c9b` |
| 5 | Funded account simulator (PASS / ACTIVE / BREACHED) | ✅ done | `bb4f0c9b` |
| 6 | Durable candle cache, incremental backfill, honest depth | ✅ done | `811c6947` |
| 7 | Visual replay with no-look-ahead regression tests | ✅ done | `abc8fc0b` |
| — | Runtime check in a browser + lab currency fix + DEV preview route | ✅ done | see `git log` |
| 8 | Multi-chart (2 → 1/2/4) + strategy × pair × timeframe matrix | ✅ done | see `git log` |
| 9 | Formal typed framework adapter (vbt/nt/kr/ta) in the interactive lab | ✅ done | see `git log` |
| 10 | Robustness lab (sweeps, OOS, walk-forward, Monte Carlo, regimes) | ✅ done | see `git log` |
| 11 | Live Trading Desk visibility (structured PASS/BLOCK/WAIT per decision) | ✅ done | see `git log` |
| 12 | Remote read-only cockpit backend (`/trading/*`) | ⏳ not started | |
| 24/7 | Server-side scheduler (Tauri not required), lock, watchdog | ⏳ not started | |
| Event impact | `gebeurtenisImpact` measured by the desk heartbeat → desk facts → AXE Algo context + trace | ✅ done | see `git log` |

Verification at the last checkpoint: `npx tsc --noEmit` clean · `npx vitest run`
**1578/1578** · `npm run build` ✓ · backend `pytest` 144/144 (Phase 0A) ·
no new ESLint findings in any touched file (compared file-by-file against
`3125fe0d`; the only pre-existing findings in touched files are unchanged).

---

## How to verify (exact commands)

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
npx tsc --noEmit
npx vitest run
npm run build            # needs a local .env (see Environment notes)
```

Backend (main.py cannot be imported without Supabase, so tests use a light venv):

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api
uv run --no-project --with pytest --with pytest-asyncio --with "pydantic>=2.11" \
  --with httpx --with croniter --with fastapi --with "mcp==2.2.0" --with python-dotenv \
  python -m pytest -q
```

---

## Phase by phase — what changed and where

Paths below are relative to `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/`.

### Phase 0A — Research Crew specialist bug (`661d93e4`)
- **Bug confirmed:** `CrewRunRequest` had no `specialists` field; Pydantic dropped
  it, so the Intel + Dollar-Bill + AXE-Core crew always ran as one persona.
- `backend/axe_api/crew_runner.py` — `CrewRunRequest` moved here (importable
  without Supabase) with `specialists`; `normalize_specialists()`.
- `backend/axe_api/main.py` — imports it; both `run_crew(...)` call sites pass
  specialists; audit row logs them.
- Test: `backend/axe_api/test_crew_specialists.py` follows HTTP body →
  `run_crew` → payload file → `run_crew.py` → `run_crew_kickoff(specialists)`.
  Fails 6/7 on the old code.
- ⚠ **Not deployed to the VPS.** `python3 scripts/vps_sync.py check` + deploy is
  needed before the live crew benefits (see "Needs your approval").

### Phase 0B — Manual execution risk bypass (`16f0dcda`)
- **Bug confirmed and worse than audited:** the chart could open positions via
  `brokerPlaceOrder`, then a direct `metaApiMarketOrder` fallback, then a paper
  fill — and pending orders had no gate at all.
- `src/domain/tradingIntel/preTradeGate.ts` — the ONE gate (account known +
  readable, breaker/kill switch, day limit incl. unreadable broker count,
  allowShort, confidence floor for the agent only). Issues a
  `PreTradeClearance` for exactly one order (symbol, side, account, 60 s).
- `src/infrastructure/gateways/brokerConnector.ts` — `brokerPlaceOrder` and
  `brokerPlacePendingOrder` **require** a matching clearance.
- `src/application/tradingIntel/tradingAgentEngine.ts` — uses the same gate.
- `src/application/tradingIntel/preTradeGateService.ts`, `manualOrders.ts` — the
  manual path; no MetaAPI or paper fallback after a refusal.
- UI: `CompanionChart.tsx`, `CompanionStyleChart.tsx` call `manualOrders`.
- Tests: `preTradeGate.test.ts`, `manualOrders.test.ts`,
  `src/presentation/orderPaths.test.ts` (source guard: no presentation file may
  call an order function directly; fails 6× on the old code).

### Phase 1 — Risk semantics (`7bff9cbd`)
- `src/domain/tradingIntel/positionSizing.ts` — lots = risk money / (stop
  distance / tickSize × lossTickValue); floor to volume step; refuse if the
  minimum lot exceeds the budget.
- `metaApiService.metaApiInstrumentSpecFor` — broker spec + current-price tick
  value (cached 6 h / 60 s). No spec → no size (fail closed).
- `src/domain/tradingIntel/accountRules.ts` — daily loss (day-start or initial
  balance, floating included, remaining headroom), static drawdown (breach trips
  the breaker), max open risk (position without SL = unbounded), max positions,
  daily target, profit target (+ min trading days, halt/continue), consistency,
  session windows, news (US high-impact day, FRED date granularity).
  Timezone-aware (`tradingDayKey`, `tradingDayStart`), also for the day limit.
- `src/infrastructure/gateways/accountRiskSnapshot.ts` — day-start balance
  computed from today's deals (no stored state).
- `RiskProfile` (`botTypes.ts`) got optional fields; `RiskMode` got `'custom'`
  (`applyRiskEdit` relabels an edited preset). Old profiles load unchanged.
- Static drawdown disables the trailing breaker threshold
  (`trailingBreakerThreshold`) so it can't silently override static rules.
- UI: `SettingsDrawer.tsx` + new `AccountRulesFields.tsx`.
- Tests: `positionSizing.test.ts`, `accountRules.test.ts`,
  `engineRiskSizing.test.ts` (the REAL `runTradingAgent` down to
  `metaApiMarketOrder`).

### Phase 2 — Evidence environments (`dfedb76f`)
- `src/domain/tradingIntel/evidence.ts` — `paper | demo | live | unknown`;
  `evidencePolicyFor('live')` = live/funded outcomes only.
- `tradingLedgerService.ts` — `byEnv` counters; totals unchanged; unlabeled
  history is **legacy** (never relabelled). Ranking/sizing/learned floor take a
  policy.
- Account environment: explicit (`TradingAccount.environment`, Accounts tab) or
  the broker's `account-information.type`; unknown never counts as live.
- Found & fixed: `recordTradeOutcome` never passed `run` (all rounds landed in
  run-1); AXE-closed broker positions were counted twice (paper mirror +
  reconciler); reconciler hard-coded `side: 'buy'` and no holding time.
- AXE Intel / Companion: lanes emit `STANCE:`, store their read under a key,
  open an episode; `closeDeskEpisodesForTrade` scores the stance against the
  realized market direction (never the lane's self-report). Same table and
  reinforcement as everything else.
- Tests: `ledgerEvidence.test.ts`, `learningEvidence.test.ts`,
  `laneStance.test.ts`, `deskEpisodes.test.ts`, `mirrorCloseLearning.test.ts`,
  `learningLoopWiring.test.ts` (+2), engine live-evidence test.

### Hedging close fix (`3d2611de`)
- The engine "closed" a long with a market SELL — on MT5 hedging accounts that
  opens a short beside the long. `brokerCloseLongs` closes by position id.

### Phase 3 — Framework live eligibility (`2e6fc370`)
- `src/domain/tradingIntel/frameworkEligibility.ts` — registry of all 22 names
  (19 implemented, 3 Price Action placeholders); eligibility = implemented + live
  signal + engine healthy (`/frameworks/status`) + timeframe/instrument fit
  (TradingAgents outside equities = partial, opt-in only; Kronos h1 only) +
  sample (30 backtest / 5 live) + account opt-in.
- Default per account: AXE + vectorbt (unchanged behaviour). Opt-in per account
  in the Accounts tab.
- Selection note (chosen + excluded frameworks with reasons) goes into the
  decision trace ("Strategy selection").
- Found & fixed: the self-test ran Kronos 9× and TradingAgents 10× per pair
  (they sat inside the per-strategy loop).

### Phases 4–5 — Strategy Lab + funded simulator (`bb4f0c9b`)
- Signal backtest: equity curve + trade list now shown; saved runs keep trades,
  curve, timeframe and can be reopened.
- `src/domain/tradingIntel/strategyLab/simulate.ts` — bar-by-bar account
  simulation: canonical `computeStrategySignal`, next-bar-open fills with
  spread/slippage, stop-first when SL and TP share a bar, gaps fill at the open,
  commission per lot per side, sizing via `positionSizing`, max positions /
  trades per day / shorts, From/To, equity + worst intrabar equity.
- `tradePlan.ts` — ONE SL/TP definition (1.5 ATR / 1.5R) and ONE ATR, now also
  used by the live engine (`marketDataService.atr` delegates).
- `instrumentEstimate.ts` — broker spec when connected, labelled estimate
  otherwise (crosses report P&L in quote currency).
- Funded simulator = same function with a `RiskProfile`: entry via
  `evaluateAccountRules` (same as live), per-bar daily loss / static / trailing
  DD / target + min days + consistency → **PASS / ACTIVE / BREACHED** with
  time, bar, trade, equity, balance, drawdown and rule.
- UI: `src/presentation/pages/tradingIntel/lab/*` in the Backtest tab.
- Tests: `simulate.test.ts` (18), `strategyLab.test.ts`.

### Phase 6 — Historical data (`811c6947`)
- `src/domain/tradingIntel/candleCache.ts`, `infrastructure/persistence/candleStore.ts`
  (IndexedDB), `application/tradingIntel/historyService.ts` — only missing bars
  are fetched (newer from now back to the cache, older back to From or until the
  provider is exhausted), one background-priority MetaAPI page at a time.
- Strategy Lab reads from the cache; depth is reported per
  symbol × timeframe × provider (History cache panel).
- Tests: `historyService.test.ts`.

### Phase 7 — Visual replay (this commit)
- `src/domain/tradingIntel/replay.ts` — `replayFrame(candles, cursor, trades)`:
  everything the chart draws, computed on bars 0..cursor only.
- `indicatorMath.ts` moved to `src/domain/tradingIntel/` (presentation keeps a
  re-export). Fixed a pre-existing layer violation in `backtestEngine.ts`
  (removed from the architecture known-debt list).
- `ChartCanvas.tsx` — `markers` prop (entry/exit arrows) + `replaceData` handle.
- `CompanionChart.tsx` — `replay` prop: shows exactly the frame's candles,
  positions and markers; loading, live polling and order bars are off.
- `lab/LabReplay.tsx` — start / prev / play-pause / next / end, speed
  (1–25 bars/s), scrub slider, jump to trade, readout (OHLC, indicators, the
  strategy's signal at the cursor, open/closed trades, equity at the cursor).
- Tests: `replay.test.ts` (future candles can't change the frame at N; the naive
  whole-series point-of-control demonstrably leaks; no `smcDetect` in lab/replay)
  and `signalNoLookahead.test.ts` (all 8 distinct strategies are causal).

---

## Runtime evidence (real data, no trades)

Dev server + in-app browser, route `#/dev-strategy-lab-preview` (DEV-only,
absent from the production bundle — checked with grep on `dist/`):

- Strategy Lab on real MetaAPI XAUUSD h1: first run fetched 3 pages and cached
  2 998 bars (2026-03-13 → 09-22); the rerun fetched **1** page (only new bars).
- 46 trades: stop-outs at exactly −1.00R, targets at +1.50R, one −1.84R gap
  through a stop, signal-flip exits — the simulator behaving as tested.
- `metaApiInstrumentSpecFor` against the real account: XAUUSD tick 0.01,
  contract 100, lossTickValue 0.8723 (EUR account) → sizing works live. The
  first cold call once failed (404) and the lab fell back to the labelled
  estimate; the live engine in that case refuses to open (fail closed).
- Funded mode with the real "MT5 100K DEMO" profile (5% daily, 12% trailing):
  ACTIVE, max DD 4.65%, P&L in EUR.
- Replay: jump to trade #19 → chart ends at its entry bar with #18/#19 markers
  and the open position line; three steps later the gap stop has happened
  (0 open, 19 closed), and not before.

### Phase 8 — Multi-chart + matrix
- `ChartGrid.tsx` / `useChartLayout.ts` — Chart tab layout 1/2/4 (per device);
  each cell an independent `CompanionChart`; cell 1 keeps feeding "Run agent".
- `multiChartLoads.test.ts` — 8 concurrent loads all succeed, ≤ 2 in flight.
- Runtime: 2 charts (XAUUSD + EURUSD) both "400 bars"; 4 charts: 3 loaded, the
  4th reported "Symbol BTCUSD does not exist" on the active broker → default
  changed to GBPUSD.
- `runStrategyMatrix` + `lab/StrategyMatrix.tsx` — same lab settings for every
  cell; small samples (< 30 trades) dimmed and excluded from the ranking.
- Runtime on real data (12 cells): volumetric-ob XAUUSD 1h −14.2% (119 trades),
  ifvg EURUSD 1h +18.9% (126 trades, avg R 0.14) — realistic costs = 0 there.

### Phase 9 — Framework adapter
- `src/application/tradingIntel/frameworkEngines.ts` — `FRAMEWORK_ENGINES`
  (per engine: kind, allowed timeframes, assumptions for fills/stops/costs/
  sizing/returns) and `FrameworkResult` (engine, strategy, kind, symbol,
  timeframe, bars, date range or null, sample, assumptions, metrics,
  live-eligibility, warnings). `runFrameworkEngine` calls the existing
  endpoints; `labResultToFramework` puts an AXE Lab run in the same shape.
- Kronos refuses anything but h1, TradingAgents anything but d1 (no number
  without meaning). vectorbt results carry "no costs / no stop" warnings.
- `lab/FrameworkEnginesPanel.tsx` — engine picker in the Lab, one comparison
  table with the AXE run first.
- Runtime (real VPS, XAUUSD h1, Nautilus): ema-bracket PF 3.91 on 21 trades →
  "not eligible: sample too small"; atr-breakout 30 trades PF 0.97; donchian 43.

### Phase 10 — Robustness lab
- `src/domain/tradingIntel/strategyLab/robustness.ts` — on `simulateAccount`:
  parameter sweep (stop × ATR, target R), selection by average R with ≥ 30
  trades (never by return), train/validation/test by date with the train→test
  R drop, walk-forward (re-optimise per train window, score only the next test
  window, parameter stability), seeded bootstrap of the trade sequence
  (return/drawdown percentiles, P(loss), P(DD > 10%)), regimes at entry (trend
  in ATR units, volatility vs median ATR so far), live-vs-backtest divergence
  from the ledger (judged from 5 live trades).
- `strategyLab.ts` — `prepareLab` extracted (shared by lab and robustness),
  `runRobustness`; UI `lab/RobustnessPanel.tsx` (train→test drop first).
- Tests: `robustness.test.ts` (7) — a train-only edge is flagged as gone on
  test; test results independent of training bars; low-sample cells never
  chosen; walk-forward windows never overlap; bootstrap reproducible.
- Runtime (real EURUSD h1, ifvg): train R 0.27 → test 0.12 (flagged, drop
  0.15), validation 19 trades (flagged), walk-forward 90 OOS trades R 0.15,
  4/4 folds positive; bootstrap p5 −1.5 %, P(loss) 5.9 %; regimes: the edge is
  in trending/high-vol conditions (flat/low: 46 trades, R −0.04).

### Event impact — wired into the decision context
- `deskHartslag.ts` — `draaiImpactMeting()`: every heartbeat tick (2 h), after
  the correlation, measures up to 4 (release × pair) combinations for
  high-impact US releases **due within 7 days**, on USD pairs, from the
  **MetaAPI M15 history cache** (`historyService`, background priority) — not
  the LSE quota. Last 6 publications, 60-min window. Each combo is skipped for
  20 h after a successful write (rotation). Written as desk fact
  `gebeurtenis_impact`, key `Release|SYMBOL|60`, text starting with
  `GEBEURTENISIMPACT — volgende publicatie YYYY-MM-DD`.
- `gebeurtenisImpact.ts` — `kiesImpactCombos` (pure selection, nearest first).
- `deskFeitenService.ts` — freshness per kind (correlation 6 h, impact 7 d);
  `deskFeitenBlok(feiten, nu, symbool)` gives each run only its own pair's
  impact. `agentAutopilot.ts` passes the symbol; the block already flows into
  Intel/Companion (`upstream.deskFeiten`) and the engine trace step
  "Bureau: gemeten feiten + lanes".
- **Bug fixed on the way:** `metaApiMarketData.normalizeTf` sent canonical
  `m5/m15/m30` to MetaAPI, which only accepts `5m/15m/30m` (HTTP 400). Every
  minute timeframe through `historyService` (Lab, history panel) failed.
- Runtime (real FRED calendar + MetaAPI M15, clock set to 2026-09-26 because
  nothing high-impact is due within 7 days of 2026-09-22): 4 GDP combos
  measured, M15 backfilled ~175 days per pair (~75 s cold, then from cache).
  GDP → XAUUSD median 0.37 % / excursion 0.57 %, 5 of 6 up; → EURUSD 0.08 % /
  0.16 %. The Supabase write was refused by RLS in the unauthenticated DEV
  preview (no credentials entered); in the signed-in app it uses the same
  insert as the correlation fact.
- Tests: `deskHartslag.test.ts` (+4: only upcoming releases on USD pairs, no LSE
  call, rotation/20 h, no calendar → nothing written, no history → skipped),
  `deskFeitenBlok.test.ts` (+1 per-pair filter).

### Phase 11 — Decision cards (PASS / BLOCK / WAIT)
- `src/domain/tradingIntel/decisionVerdict.ts` — `buildDecisionVerdict`: state,
  action, symbol, strategy, timeframe, confidence vs floor, Research (report
  signal/conf/thesis), AXE Intel + AXE Companion (STANCE + first line), every
  pre-trade gate check, sizing (lots, money at stop, SL/TP, spec note),
  account (id, environment, live/paper), block reason, execution
  (filled/closed/rejected/not-sent/autoexecute-off, trade id, price).
  BLOCK whenever something stopped it — including HOLD with a tripped breaker,
  the funnel, no order account, and a broker rejection. `withOutcome` attaches
  the closed P&L later.
- `tradingAgentEngine.ts` — both trace paths carry `verdict` (the early
  "account unavailable" path now also records strategy/timeframe).
- Outcome: `liveTradeReconciler` now passes `tradeId: match.localTradeId` (the
  same mirror id `brokerPlaceOrder` returned) → `recordTradeOutcome` →
  `attachOutcomeToTrace`. Trace budget 40 → 60 kB (still under the 101 kB at
  which sync stopped before).
- UI: `DecisionLog.tsx` in the Brain tab (last 20 decisions, expandable);
  pre-verdict traces are shown as "recorded before structured verdicts", not
  reconstructed. Also on the DEV preview ("decisions" button).
- Tests: `decisionVerdict.test.ts` (7).
- Runtime: one real engine cycle with `autoExecute: false` (no order possible)
  on EURUSD h1 trend-follow → WAIT, conf 35 % / floor 58 %, gates account/
  breaker/dayLimit PASS, rendered in the card.

## Behaviour changes that need your approval before production / live

1. **Position sizes change.** Risk % now means money at the stop via the broker's
   tick value; the old path capped at 1 lot. On a 100k account at 2% with a
   20-pip EURUSD stop that is ~10 lots. Review each account's `riskPerTradePct`.
2. **Previously decorative rules now block.** Default profiles already carry
   `maxDailyLossPct` and `maxOpenRiskPct`; they now stop new openings. A manual
   order without a stop-loss is refused on any account with those rules.
3. **Manual orders without a live broker are refused** (no paper fallback).
4. **Framework opt-in** (Nautilus/Kronos/TradingAgents live) is off by default;
   switching it on is a per-account decision.
5. **Account environment** — set funded challenges on demo servers to
   "live or funded" in the Accounts tab, or they count as demo evidence.
6. **Backend deploy** of the Phase 0A crew fix to the VPS (not done).
7. **Desktop build/install** (`npm run tauri:build`) — not run yet in this work.

---

## Not done yet — concrete next steps

- **Phase 12** — authenticated read-only `/trading/*` routes in
  `backend/axe_api/main.py` (accounts, risk, positions, decisions, crew, P&L,
  evidence). Never return MetaAPI tokens.
- **24/7** — the loop is `setInterval` in `axeBootstrap.ts` →
  `maybeRunTradingAutopilot()` (`agentAutopilot.ts`). Needs a VPS-side runner of
  the SAME cycle (not a second engine), a distributed lock, watchdog, idempotency,
  status (last/next cycle, failure reason).

---

## Environment notes (for the next session)

- `node_modules` in the worktree is an APFS clone of `~/AXE-CORE-/.../node_modules`
  plus `npm install` (one extra package); don't `git add` a changed
  `package-lock.json`.
- `.env` was copied from `~/AXE-CORE-/.../.env` (gitignored) so `npm run build`
  passes `check-desktop-env.mjs`.
- HawkScan hook: no `HAWK_API_KEY` and no running app → not applicable.
- Disk: ~8 GB free on `/`; avoid a second full `node_modules`.
