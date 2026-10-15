# MASTER BUILD SPECIFICATION 1/5
# TRADING OS — “ONE SYSTEM. EVERY EDGE.”

## ROLE

You are the lead product engineer, trading-systems architect, data engineer, AI engineer, security engineer and implementation owner for the existing **Trading OS** product.

This is not a greenfield concept exercise.

Do not create another prototype, demo dashboard or disconnected set of components.

Your responsibility is to inspect the existing Trading OS application and turn it into the production system described below while preserving all working functionality.

Operate through:

**INSPECT → MAP → DESIGN → IMPLEMENT → CONNECT → TEST → RUN → VERIFY → FIX → DOCUMENT → AUTOMATE**

Do not stop at scaffolding.

Do not report completion until the actual application works.

---

# 1. PRODUCT DEFINITION

Trading OS is a professional desktop-first trading operating system.

Its purpose is to combine:

- charts
- broker/account data
- positions and orders
- risk
- market intelligence
- multi-timeframe analysis
- economic data
- alerts
- journaling
- AI assistance
- personal trading memory
- market monitoring
- execution context

into one coherent workspace.

Trading OS is not “a dashboard with trading widgets.”

It is the desktop command center for the trader.

Primary product line:

**Trading OS — One System. Every Edge.**

AXE Companion is the mobile extension of the same trading system.

The two applications MUST NOT become two separate implementations of charts, indicators, account state or intelligence.

---

# 2. FUNDAMENTAL ARCHITECTURE RULE

Create or consolidate a shared **AXE Trading Platform Core**.

Trading OS and AXE Companion must consume the same canonical services and shared packages.

The system must have one implementation for:

1. instrument identification
2. broker-symbol mapping
3. market-data normalization
4. live quote state
5. candles
6. chart state
7. indicators
8. drawings
9. alerts
10. accounts
11. positions
12. trade history
13. risk state
14. journal state
15. AXE trading context
16. market intelligence normalization
17. user preferences

Never independently recalculate these in Trading OS and Companion.

For the same account, symbol and timeframe:

`Trading OS XAUUSD 1H`

and

`AXE Companion XAUUSD 1H`

must resolve to the same:

- instrument
- broker symbol
- quote source
- candle source
- candle timestamps
- price
- indicator parameters
- indicator values
- drawings
- alerts
- open positions
- relevant account state

within normal network latency.

---

# 3. SINGLE SOURCE OF TRUTH

Supabase remains the durable backend/source of truth for user and application state.

Use Postgres + RLS for persistent product data.

Do NOT write every market tick to Postgres.

Separate:

### Durable state

Examples:

- users
- settings
- accounts
- broker connections
- trades
- journal
- chart layouts
- drawings
- watchlists
- alerts
- indicator presets
- risk profiles
- subscriptions
- memories/references
- audit events

### Hot realtime state

Examples:

- bid
- ask
- last
- spread
- open P/L
- rapidly updating position state
- live candle
- streaming market status

This belongs in the realtime market-data layer and should be streamed to clients.

Use the existing Cloudflare/realtime transport where appropriate rather than forcing tick data through Supabase.

---

# 4. MARKET DATA ARCHITECTURE

Implement a formal provider abstraction.

Every provider must implement normalized contracts such as:

`Instrument`

`Quote`

`Candle`

`MarketStatus`

`ProviderHealth`

`ProviderUsage`

`HistoricalSeries`

The UI must never know provider-specific response formats.

Example normalized Quote:

- canonical_symbol
- broker_symbol
- bid
- ask
- last
- mid
- spread
- timestamp
- provider
- source_type
- delayed
- stale
- account_specific

Example Candle:

- canonical_symbol
- timeframe
- open_time
- close_time
- open
- high
- low
- close
- volume
- source
- finalized

---

# 5. SOURCE PRIORITY

For users with a linked trading account:

## Priority 1 — Broker/account market data

The broker feed must be canonical for instruments the user trades.

This is especially important for:

- XAUUSD
- NAS100 CFDs
- US30 CFDs
- SP500 CFDs
- broker-specific crypto CFDs

Public spot prices can differ from broker prices.

Never silently display a public XAU quote next to a broker XAUUSD position as though they are identical.

The application must display the source.

Example:

`XAUUSD · Broker Feed · Live`

or:

`BTCUSD · Binance · Live`

or:

`XAUUSD · Fallback · Delayed`

---

# 6. MT5 / BROKER CONNECTIVITY

Create a broker adapter architecture.

Initial primary target:

**MetaTrader 5**

Support two integration methods behind the same normalized interface:

### Managed connector

Use MetaAPI or another managed MetaTrader provider when configured.

### Self-hosted Broker Bridge

Support an AXE Broker Bridge that runs close to the MT5 terminal and can publish:

- account status
- balance
- equity
- free margin
- margin level
- broker/server
- symbols
- bid/ask
- candles
- positions
- pending orders
- history
- deal updates

to the secure AXE backend.

The product must not depend permanently on one commercial MetaTrader middleware vendor.

Provider switching must not require frontend rewrites.

Store broker credentials securely.

Never expose MT5 credentials or provider secrets to frontend JavaScript.

---

# 7. FREE / BOOTSTRAP DATA LAYER

Use free data intelligently during development and early operation.

Do not pretend a free provider can legally and technically replace licensed commercial market data at scale.

Current useful bootstrap sources include:

### TradingView Lightweight Charts

Use as the common chart rendering foundation unless inspection proves an existing engine is materially better.

It is an open-source financial charting library and supports extensions/plugins. Public apps must comply with TradingView attribution requirements. ([github.com](https://github.com/tradingview/lightweight-charts?utm_source=chatgpt.com))

### Twelve Data

Useful for early:

- forex
- equities
- ETFs
- crypto
- candles
- reference data

The current Free plan exposes 8 API credits/minute, 800/day and limited WebSocket trial access. The current Free usage terms shown by Twelve Data are intended for internal non-display use, so do not architect commercial public redistribution around a free key. ([twelvedata.com](https://twelvedata.com/pricing-business?utm_source=chatgpt.com))

### Binance

Use Binance public market streams for Binance crypto where appropriate.

Its official WebSocket infrastructure supports streaming market data; authenticated User Data Streams can supply realtime account changes for connected Binance accounts. ([developers.binance.com](https://developers.binance.com/en/docs/products/derivatives-trading-coin-futures/websocket-market-streams/Connect?utm_source=chatgpt.com))

### CoinGecko

Use for:

- crypto discovery
- metadata
- broader market overview
- market cap/rank
- snapshot fallback

Current Demo API allowance is 100 calls/minute and 10,000 calls/month. ([support.coingecko.com](https://support.coingecko.com/articles/9471335603-user-guide-how-to-sign-up-for-coingecko-demo-api-and-generate-an-api-key?utm_source=chatgpt.com))

### FRED

Use for economic and macro series.

FRED supports programmatic economic-data access through its API and a free account can obtain API access. ([fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html?utm_source=chatgpt.com))

### Alpha Vantage

Treat as low-frequency fallback/reference/historical provider rather than a realtime backbone.

The current free standard allowance is 25 API requests/day and regulated realtime US market data is premium. ([alphavantage.co](https://www.alphavantage.co/premium/?utm_source=chatgpt.com))

### GDELT

May be used as one discovery layer for global news/event monitoring.

It is not the sole trusted source of market-moving information.

Results must carry their original publisher/source metadata. ([blog.gdeltproject.org](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts//?utm_source=chatgpt.com))

---

# 8. PROVIDER ROUTER

Create automatic provider routing.

For each capability calculate:

`preferred_provider`

`fallback_provider`

`health`

`quota_remaining`

`latency`

`freshness`

`licensing_mode`

Provider failure must not create fake success.

Possible UI states:

- LIVE
- DELAYED
- FALLBACK
- STALE
- DISCONNECTED
- UNAVAILABLE

Never label data LIVE unless it actually is.

Cache aggressively where correctness allows.

Avoid wasting free API credits on identical requests.

---

# 9. CANONICAL INSTRUMENT REGISTRY

Create one instrument registry.

Canonical examples:

`XAUUSD`

`BTCUSD`

`NAS100`

`US30`

`SPX500`

`EURUSD`

Broker aliases may include:

`XAUUSD.a`

`GOLD`

`XAUUSDm`

`USTEC`

`NAS100.cash`

etc.

Maintain:

- canonical id
- asset class
- base
- quote
- exchange
- provider mappings
- broker mappings
- tick size
- contract size
- precision
- market hours
- display name
- aliases

AXE must use this registry too.

Never let AI invent symbol mappings.

---

# 10. SHARED CHART ENGINE

Trading OS and AXE Companion must share the exact chart implementation.

Create a shared chart package if one does not already exist.

Responsibilities:

- candlestick rendering
- line/area modes
- volume
- bid/ask lines
- last price
- crosshair
- scale
- sessions
- timezone
- timeframe
- drawings
- indicator overlays
- markers
- positions
- orders
- SL/TP
- alerts
- snapshots
- theme
- gesture/state normalization

State must be serializable.

A chart session should be reproducible from persisted configuration.

Example:

```text id="mhobok"
symbol = XAUUSD
timeframe = 1H
account = account_abc
indicators = preset_4
drawings = layout_238
visible_range = ...
```

---

# 11. TIMEFRAMES

Support at minimum:

- 1m
- 5m
- 15m
- 30m
- 1H
- 4H
- D
- W

Architecture must allow more.

The user commonly uses:

- 15m
- 1H
- 4H
- Daily

and primarily works from 1H levels.

---

# 12. INDICATOR ENGINE

Indicators must not just draw approximate graphics in the browser.

Create one deterministic indicator engine used by both products.

Required AXE trading structure indicators:

### Market Structure

Detect configurable:

- swing highs
- swing lows
- BOS
- CHoCH
- trend context

### Order Blocks

Detect:

- bullish OB
- bearish OB
- invalidation
- mitigation state
- originating timeframe

### Fair Value Gaps / Voids

Detect:

- bullish imbalance
- bearish imbalance
- fill %
- mitigation
- origin timeframe

### Liquidity

Support:

- equal highs
- equal lows
- swing liquidity
- prior highs/lows
- sweep events

### Previous Day Levels

- PDH
- PDL
- previous close

### Equilibrium

- range midpoint
- premium/discount zones where applicable

### Fibonacci

Support manual anchors and stored Fibonacci layouts.

### Standard indicators

Architecture should additionally support:

- EMA
- SMA
- RSI
- MACD
- ATR
- VWAP
- Bollinger Bands

without coupling the application to these exact indicators.

---

# 13. INDICATOR PARITY

Given identical candle input and settings:

Trading OS and Companion must produce identical indicator JSON.

Create parity tests.

Do not duplicate algorithms in two frontend repositories.

---

# 14. DRAWINGS

Support:

- horizontal line
- vertical line
- trend line
- ray
- rectangle
- risk/reward box
- Fibonacci
- text/note
- arrow/marker

Persist drawings per:

- user
- instrument
- timeframe
- workspace/layout

Changes should sync across devices.

---

# 15. ACCOUNT OVERLAYS

Chart must be account-aware.

Show:

- entries
- exits
- open position average
- pending orders
- stop loss
- take profit
- realized trades
- optional P/L labels

Selecting a position should focus the corresponding chart.

Selecting a chart symbol should filter relevant account information.

---

# 16. DESKTOP WORKSPACE

Trading OS is desktop-first.

Recommended primary structure:

## Global top bar

Show:

- active account
- broker connection
- equity
- daily P/L
- risk state
- market session
- provider health
- AXE status

## Left workspace

- watchlist
- symbols
- saved lists
- account selector

## Center

Primary chart / multi-chart layout.

## Right workspace

Switchable:

- AXE
- position details
- analysis
- alerts

## Lower workspace

Switchable:

- positions
- orders
- history
- journal
- logs where appropriate

Avoid excessive dashboard cards.

The chart remains the operational center.

---

# 17. REQUIRED PRODUCT AREAS

Preserve and complete the Trading OS areas previously planned/built:

### Chart / Trading

The operational chart workspace.

### Intel

Pair-aware intelligence.

### Analyses

Stored and live multi-timeframe analysis.

### Heatmaps

Relevant:

- market
- sector
- crypto
- FX strength
- volatility

depending on data availability.

### Macro Index

Macro conditions relevant to current instruments.

### Economic Calendar

High-impact events.

### News

Deduplicated, source-aware, symbol-aware.

### Polymarket / prediction intelligence

Use as contextual information, not ground truth.

### Flight / vessel intelligence

Keep only where genuinely useful to macro/commodity analysis.

Do not display fake movement or synthetic “live” data.

### Journal

Complete trade history + manual notes + AXE-assisted review.

### Accounts

All connected trading accounts.

### Risk

Current risk profile and live risk state.

---

# 18. RISK ENGINE

Support risk templates:

- Personal
- Funded Challenge
- Funded Live
- Custom

Potential fields:

- max daily drawdown
- max total drawdown
- max risk/trade
- daily trade count
- daily profit target
- consistency rule
- long-only toggle
- news restrictions
- minimum trade duration
- account rules

Rules must be account-specific.

The engine must calculate current status from real broker/account data.

Example:

`Daily DD remaining: €1,482`

not merely a static configured percentage.

---

# 19. JOURNAL

Automatically ingest completed trades.

Journal entry may contain:

- trade
- screenshots
- chart state
- pre-trade reasoning
- post-trade reasoning
- session
- setup
- mistake tags
- emotion tags
- rule adherence
- MFE
- MAE
- R multiple
- result
- AXE review
- linked alerts
- linked memory

Allow manual editing.

Never let AXE silently rewrite the user's original journal note.

Store AI analysis separately with provenance.

---

# 20. AXE — TRADING INTELLIGENCE

AXE is not a generic chatbot embedded in a sidebar.

AXE is the trading intelligence layer.

Create one shared trading context builder:

`getAxeContext()`

It should collect, depending on permission and current screen:

- user preferences
- selected account
- account rules
- balance/equity
- current positions
- symbol
- timeframe
- visible chart range
- recent candles
- indicator results
- drawings
- current session
- relevant economic calendar
- relevant news
- recent journal
- trading memories
- current alerts
- risk state

AXE must know what the user is looking at.

---

# 21. AXE CAPABILITIES

Examples:

“Analyse this chart.”

“What is different versus 4H?”

“What risk do I have left today?”

“Why did this trade fail?”

“Set an alert if XAUUSD returns to this 1H order block.”

“Show all trades where I broke this rule.”

“What are the major risks for gold before New York?”

“Journal this trade.”

“Compare my last 20 XAUUSD trades.”

“Explain my open position.”

---

# 22. EXECUTION PERMISSIONS

Do not casually turn an AI response into a live trade.

Implement explicit permission states.

Example:

### Read Only

AXE can inspect.

### Prepare

AXE can prepare an order ticket but not send it.

### Confirmed Execution

The user must confirm before a live order is transmitted.

Any later autonomous-trading mode must be a separate explicit product/permission model with risk controls.

---

# 23. AXON MEMORY INTEGRATION

AXON Memory should hold durable personal trading knowledge such as:

- preferences
- repeated mistakes
- setup definitions
- learned playbook rules
- recurring observations
- journal conclusions
- account-specific behavior

Do not dump raw tick data into AXON.

AXON should remember meaning, not replace the market-data database.

---

# 24. ALERT ENGINE

Alerts can originate from:

- price
- drawing
- indicator
- structure event
- position
- risk
- economic event
- news
- AXE condition

Alerts must execute server-side where possible.

Do not depend on the user's browser tab being open.

Alert event flow:

condition → detection → deduplication → event → notification → audit.

---

# 25. SYNC

Trading OS and Companion share:

- account selection
- watchlists
- alerts
- drawings
- chart layouts
- indicator presets
- journal
- AXE context references
- risk configuration

A user should be able to analyse XAUUSD on desktop, leave the house and continue the same workspace on Companion.

---

# 26. PRICING

Preserve the previously defined product structure unless explicitly changed by the product owner:

- Free
- Pro — €49
- Founder — €79
- AXE Founder discount — €69 where applicable
- Elite — €89

Feature entitlements must be server-side authoritative.

Do not enforce plans only by hiding frontend buttons.

---

# 27. OBSERVABILITY

Create a health surface for:

- broker connector
- market providers
- quote latency
- WebSockets
- Supabase
- AXE
- alerts
- push delivery
- APIs
- quotas
- scheduled jobs

Persist incidents.

Example:

`Twelve Data degraded — broker source unaffected.`

---

# 28. BUILD ORDER

Execute in this order:

### Phase 0 — Reality audit

Inspect existing application, repo, schema, deployment and current functionality.

Document:

- working
- partially working
- broken
- mocked
- dead
- duplicated

### Phase 1 — Shared contracts

Normalize:

- instruments
- candles
- quotes
- broker state
- account state

### Phase 2 — Chart core

Create shared chart engine and indicator parity.

### Phase 3 — Broker synchronization

Make connected account state authoritative.

### Phase 4 — Trading workflow

Positions, risk, journal, alerts.

### Phase 5 — AXE

Wire real context and tools.

### Phase 6 — Intelligence

News/macro/calendar/heatmaps/etc.

### Phase 7 — Cross-device synchronization

Complete Companion parity.

### Phase 8 — Billing/entitlements

Validate all tiers.

### Phase 9 — Production hardening

Load, security, reconnects, stale data, failures, monitoring.

---

# 29. DEFINITION OF DONE

Trading OS is not complete until:

1. a real account can be connected;
2. account balance/positions/history are real;
3. selecting a broker instrument resolves correctly;
4. chart candles load;
5. live price updates;
6. price source is identifiable;
7. indicators render from deterministic calculations;
8. drawings persist;
9. positions render on charts;
10. alerts execute server-side;
11. trade history enters the journal;
12. AXE understands the active chart/account;
13. AXE never fabricates unavailable data;
14. Companion receives matching state;
15. provider failures display honestly;
16. typecheck passes;
17. tests pass;
18. production build passes;
19. application has been manually run;
20. critical flows have been visually verified.

---

# 30. AUTONOMOUS MAINTENANCE

After implementation, AXE Core becomes the operational maintainer.

Create machine-readable health checks and tasks so AXE Core can continuously inspect:

- failed CI
- provider outages
- quota exhaustion
- broken symbols
- broker disconnects
- stuck jobs
- alert failures
- Supabase errors
- frontend errors
- stale dependencies
- security warnings
- release regressions

AXE Core may autonomously fix low-risk issues when:

- tests pass
- typecheck passes
- migrations are safe
- no permissions/security boundary changes
- rollback exists

Require approval for:

- destructive migrations
- auth changes
- payment/billing logic
- secret handling
- account execution permission changes
- security-policy relaxation

Maintain:

`PRODUCT.md`

`ARCHITECTURE.md`

`DATA_CONTRACTS.md`

`RUNBOOK.md`

`ACCEPTANCE.md`

`AGENTS.md`

and repo-specific Claude/agent instructions.

Trading OS must become a maintained product, not a project that slowly decays.


---


# PART B — AUTONOMOUS BUILD ORDER

The master specification above is authoritative and must not be rewritten, abbreviated, reinterpreted into a weaker version, or replaced by a new product concept.

This section defines HOW to execute it.

## EXECUTION CONTRACT

You are not being asked for a plan-only response.

You are being asked to operate on the existing real product until the current phase is complete.

For every phase:

1. inspect reality before editing;
2. write down the current-state findings;
3. create or update machine-readable tasks;
4. implement the smallest coherent production slice;
5. typecheck;
6. run focused tests;
7. run the broader relevant test suite;
8. build the production target;
9. run the actual application/service;
10. visually or functionally verify the changed flow;
11. fix discovered defects;
12. commit with a meaningful message;
13. push to the canonical branch when allowed;
14. update the project runbook/status;
15. schedule or register the health checks that AXE Core will own afterward.

Never stop because one subtask succeeded.

Continue until the phase acceptance criteria are satisfied or a real external blocker exists.

If a real blocker exists:
- record it explicitly;
- preserve all completed work;
- create the exact next task;
- continue on every other unblocked task.

Do not ask the owner to manually coordinate work that can be coordinated by the system.

## CANONICAL TASK STATE

Every autonomous build task should have at minimum:

- id
- product
- objective
- phase
- priority
- status
- owner_agent
- dependencies
- acceptance_criteria
- files_or_services_touched
- started_at
- last_progress_at
- attempts
- tests_run
- build_result
- deployment_result
- verification_result
- blocker
- next_action
- rollback_reference

Recommended task states:

`queued`
`running`
`waiting_external`
`waiting_approval`
`failed_retryable`
`failed_blocked`
`verifying`
`done`

A task is not `done` because code was written. It is `done` only when its acceptance criteria are verified.

## AUTONOMY LEVELS

### LEVEL A — Fully autonomous

Allowed without asking:
- repository inspection
- code search
- documentation updates
- non-destructive refactors
- test creation
- test execution
- lint/type fixes
- safe dependency patching
- observability additions
- retry/reconnect fixes
- UI implementation inside approved product specification
- provider adapters using already approved credentials/integrations
- non-destructive database reads
- safe idempotent data backfills when explicitly covered by tests and rollback

### LEVEL B — Autonomous with audit trail

Allowed when rollback exists and automated checks pass:
- non-destructive migrations
- deployment to already approved environment
- cron/task creation
- feature flag activation
- worker restart
- cache invalidation
- safe queue replay
- updating low-risk configuration

### LEVEL C — Approval required

Require owner approval for:
- destructive migrations
- irreversible deletion
- authentication/security policy weakening
- billing changes
- secret rotation that can interrupt production
- financial execution permissions
- legally binding actions
- publication of sensitive/private data
- live trade execution permission changes
- bank/payment instruction changes

## NO-IDLE RULE

As long as an unblocked task exists, the orchestrator must select and execute the highest-priority task.

A worker may not become “idle” merely because one requested action finished.

When a phase finishes, automatically open the next phase.

When a production issue appears, automatically create a maintenance task and rank it against build work by severity.

## SELF-HEALING LOOP

Every deployed component needs:
- health check;
- failure threshold;
- retry policy;
- incident creation;
- owner notification threshold;
- recovery verification.

Use:
`detect → classify → retry safely → verify → escalate → record`.

Never loop forever on a dangerous or non-idempotent operation.

## AXE CORE HANDOFF

Before declaring the product build complete, register in AXE Core:

- product identity
- canonical repository
- canonical branch
- build command
- test commands
- typecheck command
- run command
- deployment command/process
- health endpoints
- critical background jobs
- log locations
- provider dependencies
- secret names only, never secret values
- escalation policy
- rollback method
- acceptance smoke tests
- daily/weekly maintenance tasks

Create a product heartbeat.

AXE Core must be able to answer at any moment:

- Is the product healthy?
- What broke?
- What changed?
- What is being built?
- What is blocked?
- What needs owner approval?
- What is the next autonomous action?

## CONTINUOUS MAINTENANCE CADENCE

Event-driven:
- build/test failure
- production error
- provider disconnect
- auth failure
- webhook failure
- background job failure

Hourly where appropriate:
- critical worker health
- queue lag
- stale realtime connections
- retryable incidents

Daily:
- failed tasks
- dependency health
- provider quotas
- error trends
- stale feature flags
- data-integrity checks
- critical UX smoke tests

Weekly:
- deeper regression suite
- security/dependency review
- dead code / abandoned task review
- documentation drift check
- product KPI/quality review

## COMPLETION REPORT FORMAT

When a phase completes, report:

### Completed
Concrete implementation.

### Verified
Tests/build/runtime/manual or browser verification.

### Production state
What is currently live.

### Autonomous maintenance
What AXE Core now monitors/runs.

### Remaining
Only real unfinished items.

### Owner action
Only if genuinely required.

Do not report “done” with hidden mocked, disconnected or unverified functionality.


# PRODUCT-SPECIFIC EXECUTION ORDER — TRADING OS

## PHASE T0 — REPOSITORY AND RUNTIME REALITY AUDIT

Inspect:
- canonical repo/branch;
- current desktop app runtime;
- backend services;
- Supabase schema/RLS;
- chart libraries;
- current market-data sources;
- account/broker integration;
- provider keys by name/presence only;
- existing indicators;
- current journal/risk/alerts;
- current AXE integration;
- current CI/deploy flow.

Produce `CURRENT_STATE.md` with each feature marked:
`real`, `partial`, `mocked`, `broken`, `duplicated`, `missing`.

Acceptance:
- every major screen and service mapped;
- no architectural change begins from assumption.

## PHASE T1 — EXTRACT AXE TRADING PLATFORM CORE

Create shared packages/services for:
- canonical instruments;
- provider contracts;
- quote/candle models;
- broker account models;
- chart state;
- indicator calculations;
- drawing state;
- risk models;
- journal contracts;
- alert contracts;
- AXE context contracts.

Acceptance:
- Trading OS imports shared contracts;
- Companion can import the same contracts;
- no duplicated canonical symbol logic.

## PHASE T2 — MARKET DATA ROUTER

Implement:
- provider registry;
- provider health;
- capability matrix;
- source priority;
- caching;
- quota tracking;
- stale/delayed flags;
- fallback behavior;
- observability.

Acceptance:
- provider outage is visible;
- no fake LIVE state;
- canonical quote includes provenance.

## PHASE T3 — BROKER BRIDGE / MT5

Complete the broker adapter contract.

Implement managed connector and/or self-hosted bridge according to current infrastructure.

Acceptance with a real account:
- balance;
- equity;
- positions;
- orders;
- history;
- broker symbols;
- bid/ask;
- candles
are visible and normalized.

## PHASE T4 — CHART CORE

Consolidate the chart engine.

Implement:
- candle loading;
- realtime candle mutation/finalization;
- visible-range state;
- bid/ask;
- position/order overlays;
- saved layouts;
- drawings;
- mobile-compatible serialized state.

Acceptance:
- same saved chart state can be restored deterministically.

## PHASE T5 — INDICATOR ENGINE

Implement shared deterministic calculations for all required structure/standard indicators.

Create golden-fixture tests from fixed candle datasets.

Acceptance:
- same input => byte-equivalent normalized indicator output across desktop/mobile test harnesses.

## PHASE T6 — RISK + JOURNAL + ALERTS

Complete:
- live risk computation;
- funded/personal/custom rule profiles;
- trade ingestion;
- journal enrichment;
- server-side alerts;
- notification events.

Acceptance:
- closing a real trade creates the expected journal state;
- alert fires when clients are closed;
- risk values reconcile with account data.

## PHASE T7 — AXE CONTEXT AND TOOLS

Implement `getAxeContext()`.

Provide tools for:
- inspect chart;
- inspect account;
- inspect risk;
- set alert;
- create journal note;
- retrieve relevant history/memory.

Acceptance:
- AXE correctly answers “what am I looking at?” from live context;
- unavailable data is stated as unavailable.

## PHASE T8 — INTELLIGENCE SURFACES

Wire real sources for:
- Intel;
- analyses;
- macro;
- economic calendar;
- heatmaps;
- news;
- prediction context;
- flight/vessel context where useful.

Remove fake-live placeholders.

## PHASE T9 — TRADING OS ↔ COMPANION PARITY

Run the full XAUUSD 1H parity acceptance test.

Block release on:
- quote mismatch without explicit source reason;
- candle mismatch;
- indicator mismatch;
- drawing sync failure;
- account mismatch.

## PHASE T10 — BILLING, HARDENING AND RELEASE

Verify:
- entitlements;
- reconnect behavior;
- stale-data handling;
- provider exhaustion;
- security;
- crash recovery;
- production build;
- deployment/install.

## TRADING OS AUTONOMOUS OPERATIONS AFTER BUILD

AXE Core continually:
- checks broker connectivity;
- detects stale quotes;
- checks market-data providers;
- checks quotas;
- runs daily symbol-mapping integrity tests;
- runs chart/indicator golden tests after relevant code changes;
- checks alert-delivery backlog;
- checks journal ingestion;
- checks production desktop version;
- opens repair tasks automatically;
- deploys only after required quality gates.
