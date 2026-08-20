# AXE CORE — Build Progress

Working memory across sessions. Read this first. See `AXE_ARCHITECTURE.md` for
the Phase 0 audit and the corrections to the original brief.

---

## Status board

| Phase | State | Blocking? |
|---|---|---|
| 0 — Audit | **DONE** — `AXE_ARCHITECTURE.md` written 2026-08-20 | no |
| 1 — ThinkTank | **~85% pre-existing.** 3 gaps identified | no — next up |
| 2 — AXE Algo | Built, **NOT TRADING** | **YES — hard blocker** |
| 3 — Obsidian graph | Aggregate notes exist; per-trade graph missing | depends on 2 |
| 4 — Mobile | Structurally done (shared bundle); 2 native gaps | no |

---

## THE BLOCKER — read before touching Phase 2 or 3

AXE Algo runs full cycles, selects strategies and timeframes per pair, fans out
across both accounts — and places **zero orders**. Every symbol returns:

```
<pair>: <strategy> @ <tf> · Account 1: The quota has been exceeded. | Active account: The quota has been exceeded.
```

### What has been established by testing (not inference)

- MetaAPI answers fine **from this Mac** — `account-information` OK over the same
  network path the desktop app uses. Nothing is refusing the client.
- All five endpoints the cycle uses answer OK from the VPS.
- `tradingAgentEngine.ts` contains **no `throw`** of its own.
- `fetchMarketSnapshot` cannot reject — it falls back MetaAPI → Binance → Stooq
  → synthetic bars.
- The engine's up-front reads are `Promise.allSettled`, so none escape.

### Five unmetered MetaAPI paths found and fixed (all real, none sufficient)

1. A cap is not a pace — 25/min allowed all 25 in the first second (launch burst)
2. Bucket keyed per **account**; MetaAPI meters per **subscription** (one token,
   two accounts → double the real ceiling)
3. `metaApiGetAccount()` — raw fetch to the provisioning host
4. `metaApiMarketData.ts` — **the candles module**, raw fetch, the heaviest
   caller in the app (chart 20s, agent per symbol per timeframe, cheapScreen
   across the whole broker universe)
5. Circuit breaker comparing one account's peak to another's equity (51.5%
   "drawdown" while flat) — fixed, per account now

### RESOLVED SINCE (two real causes found)

**1. Cycles were HANGING, not erroring.** `last_run` advanced while
`last_result` sat unchanged for hours. Cause: `fetch()` has no timeout, and the
in-flight dedupe I added chained every later caller for a path onto one hung
promise — so a single hang stalled all of them permanently and the entry never
left `inFlight`. Timeline is exact: cycles completed at 18:52 and 20:16, then
stopped from 20:27, and the candles path was routed through the budget at 20:17.
Fixed: 15s deadline on every budgeted request, writes included; a rejected
shared promise no longer drags its followers down.

**2. Learning was starving trading.** The ledger showed `nt:` and `vbt:` rows
being written across d1 and h4 while every decision returned quota-exceeded —
the twice-daily self-test was running. It sweeps pairs x 8 strategies x 4
timeframes, and AXE's own backtests pull MetaAPI candles as their PRIMARY
source: the same meter a live decision needs. Background fires continuously,
trading every 15 minutes. Fixed: backtests are `priority: 'background'`, yield
at 60% of the window, never queue for a slot; backtest series cache for 10
minutes instead of 20s (they are history, and 8 strategies ask the same
question about the same series).

### CURRENT BLOCKER — the app is inert after restart

No app activity of any kind since 2026-08-20 22:52 UTC, across several
restarts. `last_run` stuck at 22:49 even though `axeBootstrap` fires
`maybeRunTradingAutopilot()` immediately on boot and ticks every 60s.

The process is alive but does nothing, which is what a **login screen** looks
like from the outside. The app was hard-killed (`pkill`) roughly fifteen times
during this session; the stored Supabase session may finally have expired.

**Do this first, before any further code:** bring AXE CORE to the front, confirm
it is signed in, and leave it open. Nothing below can be observed until the
autopilot tick is actually running.

### Next step (exact)

The fan-out catch in `agentAutopilot.ts` now appends the frame the error was
raised in. **Read `axe_trading_autopilot_last_result` after the next cycle** —
it will read:

```
Account 1: The quota has been exceeded. [raised in <function> (<file>:<line>)]
```

That names the culprit. Do not attempt a sixth fix before reading it.

**Lesson worth keeping:** five confident fixes, none verified against the actual
failure, because the error never said where it came from. The one-line
instrumentation should have been first.

---

## Phase 1 — ThinkTank: the three real gaps

Everything else in the brief already exists in `thinkThanksService.ts` (2263
lines): ingestion, extraction, fit %, action plan, Build, Library, separate
integrate plan, Integrate, plus merge suggestions and scheduled re-analysis.

1. **Fit is scored across the four sibling APPS**
   (`axe-core | axe-companion | axon-memory | trading-os`), not across AXE
   CORE's internal modules. Needs a module manifest + a second scoring axis.
   *This changes existing behaviour Luka uses — confirm before replacing rather
   than adding.*
2. **No module colour registry.** `APP_COLORS` / `MODULE_COLORS` do not exist.
   Copy the pattern in `domain/tradingIntel/strategyColors.ts`, which already
   documents why a second colour table is forbidden.
3. **Integration plan is cached, not regenerated** at Library time.

---

## Phase 3 — what is missing

Exists: `Trading/<pair>-scorecard.md`, `Trading/Strategy-index.md` (aggregates).

Missing: per-trade notes with YAML frontmatter, win/loss hub notes per
pair+strategy, Extended Graph config mapping strategy tags → dots and framework
tags → triangles. **Reuse `strategyColors.ts` — do not create a second palette.**

---

## Phase 4 — what is missing

Only native-shell work: share-sheet intake and camera capture feeding the *same*
ingestion pipeline, and a mobile funnel view (or the synced vault in Obsidian
mobile). Feature parity is automatic — the APK embeds the same web bundle.

---

## Standing rules discovered the hard way

- Deploy with `python3 scripts/vps_sync.py check|deploy`. **Never**
  `infra/axe-core-api/deploy.sh` — it ships a stale directory and would drop
  `agent_loop.py`, which the running worker imports.
- Every MetaAPI call must go through `metaApiBudget.ts`. Four modules bypassed
  it; audit *all* files matching `agiliumtrade`, not the one you are in.
- Two user ids: `AXE_USER_UUID` for uuid columns (`messages`, `user_settings`),
  `AXE_USER_ID` (suffixed) only for `global_memory`'s text column.
- One timeframe vocabulary (`timeframes.ts`), MT5 naming canonical (`h1`, not
  `1h`). Engines are translated at the call boundary only.
- A status must come from an observation, never a config flag. "Configured" is
  not "answering"; "Autopilot ON" is not "trading"; "wired" is not "installed".
- The Android repo (`~/Downloads/AxeCore`) has **no git remote** — it exists on
  one Mac only.

---

## Session log

**2026-08-20** — Phase 0 audit written. Earlier the same day: deploy guard
(`vps_sync.py`), NautilusTrader + TradingAgents engines deployed, timeframe
vocabulary unified (`1h`/`h1` were two ledger keys), provider cascade widened
(ThinkTank preferred a single Gemini slot), Accounts tab + multi-account
execution, circuit breaker scoped per account, Anthropic doubled-`/v1` fixed,
`core_system_logs` RLS repaired, Hetzner's stale API decommissioned.
50 tests green; typecheck baseline 29 pre-existing errors; no CI.
