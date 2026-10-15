# MASTER BUILD SPECIFICATION 2/5
# AXE COMPANION — “YOUR SECOND BRAIN FOR TRADING”

## ROLE

You are the lead mobile product engineer, trading-platform engineer and AI implementation owner for the existing **AXE Companion** application.

Do not rebuild it as a generic trading app.

AXE Companion is the mobile manifestation of the same trading intelligence and trading state used by Trading OS.

The architectural objective is:

**Trading OS on the desk.  
AXE in the pocket.  
One account state.  
One chart engine.  
One intelligence layer.  
One memory.**

---

# 1. PRODUCT IDENTITY

Primary line:

**AXE Companion — Your Second Brain For Trading.**

AXE Companion is:

- mobile-first
- fast
- personal
- context-aware
- account-aware
- chart-aware
- memory-aware
- notification-driven

The product should feel like a professional trading companion rather than a miniaturized desktop dashboard.

---

# 2. DO NOT FORK THE TRADING ENGINE

Companion MUST consume the same shared:

- instrument registry
- symbol mappings
- candles
- quotes
- indicators
- account adapters
- risk engine
- alert engine
- AXE context engine
- journal model

as Trading OS.

If equivalent code exists twice, consolidate it.

---

# 3. MOBILE PRODUCT MODEL

Mobile usage is different from desktop.

Trading OS optimizes for deep workspace operation.

Companion optimizes for:

- immediate status
- situational awareness
- quick chart inspection
- AXE conversation
- alerts
- account/risk monitoring
- journaling
- decisions on the move

Do not fill the home screen with every desktop feature.

---

# 4. PRIMARY MOBILE NAVIGATION

Recommended primary destinations:

### Home

“What matters now?”

### Markets

Watchlists, quotes, sessions and relevant market state.

### Chart

Full trading chart.

### AXE

Trading intelligence conversation/workspace.

### Account

Accounts, positions, risk, journal and settings.

Navigation may adapt to the current existing application, but these capabilities must remain clear and reachable.

---

# 5. HOME

Home should answer within seconds:

- Which account is active?
- Is it connected?
- Current equity?
- Daily P/L?
- Current risk?
- Open positions?
- Critical alerts?
- Major economic events?
- Anything AXE believes requires attention?

Recommended sections:

`Account Pulse`

`Open Positions`

`Risk Remaining`

`AXE Brief`

`Upcoming`

`Alerts`

Do not overwhelm the user.

---

# 6. CHART

The mobile chart must not be a simplified fake chart.

Use the exact shared chart/indicator data model from Trading OS.

Mobile chart requirements:

- portrait mode
- full-screen landscape
- pinch zoom
- pan
- crosshair
- price scale
- timeframe control
- symbol search
- drawings
- indicators
- broker bid/ask
- account positions
- SL/TP markers
- alert placement

The same saved drawing must be available on Trading OS.

---

# 7. MOBILE DRAWING UX

Desktop drawing toolbars do not translate directly to touch.

Use a compact expandable tool selector.

Selecting an existing drawing should expose:

- move
- edit
- visibility
- alert
- delete

Avoid accidental changes.

---

# 8. QUOTES

For an account-linked symbol, use the broker source where available.

AXE must use the same canonical quote displayed by the chart.

Never create:

- chart price A
- watchlist price B
- AXE price C

for the same active broker instrument.

---

# 9. AXE CONVERSATION

AXE on mobile should feel like a continuous trading companion.

Example quick actions:

- Analyse chart
- What changed?
- Check risk
- Set alert
- Journal trade
- Review position
- Explain news impact
- Compare timeframes

AXE must know:

- active chart
- timeframe
- account
- open positions
- relevant memory
- session
- upcoming calendar events

without asking repeatedly.

---

# 10. VOICE

Support realtime conversational voice when available.

Voice should be interruptible.

A user can say:

“AXE, what changed on gold since London open?”

and AXE should receive the same structured context as a typed request.

Voice is an input/output modality.

It must not create a second intelligence implementation.

---

# 11. LEARNING ARC

Maintain a per-user Learning Arc.

The objective is not to gamify trading.

The system should understand over time:

- preferred setups
- recurring errors
- best trading sessions
- instrument performance
- rule adherence
- overtrading patterns
- risk patterns
- execution consistency

Important conclusions may become durable AXON memories.

The original raw journal remains immutable unless edited by the user.

---

# 12. ALERTS & PUSH

Companion is the primary notification endpoint.

Support push notifications for:

- price alerts
- drawing alerts
- structure alerts
- risk warnings
- economic events
- position events
- account disconnects
- broker issues
- AXE findings
- Trading OS/AXE handoff

Notifications must deep-link to the relevant state.

Example:

Price alert → XAUUSD 1H chart.

Risk alert → active account risk screen.

Journal reminder → relevant closed trade.

---

# 13. ACCOUNT SCREEN

Provide clear access to:

- connected accounts
- balance
- equity
- P/L
- margin
- positions
- orders
- history
- risk profile
- broker health

Switching account should update the entire app context.

---

# 14. JOURNAL ON MOBILE

The mobile journal should optimize for rapid capture.

Allow:

- voice note
- typed note
- screenshot
- chart snapshot
- trade linking
- tags
- AXE review

An automatically imported trade can be completed as a journal entry in seconds.

---

# 15. OFFLINE / POOR NETWORK BEHAVIOUR

Cache non-sensitive recently used:

- watchlist
- chart configuration
- historical candles
- journal
- settings

Clearly mark live functionality unavailable during connection loss.

Never display an old quote as live.

---

# 16. DATA PROVIDERS

Use the same provider router as Trading OS.

Do not give the mobile app its own API keys or direct unrestricted access to third-party provider secrets.

Third-party calls that require secrets run server-side.

Use the broker source first for connected trading instruments.

The free/bootstrap provider strategy is defined by the Trading OS core specification and must remain centralized.

---

# 17. SECURITY

Mobile application must contain no:

- Supabase service-role key
- broker master credentials
- MetaAPI secret
- paid data-provider private keys
- unrestricted AI provider secret
- server signing secrets

Use secure server-mediated sessions.

Apply RLS to all user-scoped data.

---

# 18. PRICING

Preserve current intended structure unless explicitly changed:

- Free — €0
- Pro — €20/month
- Founder — €45/month, first 100 Founder seats
- Elite — €50/month

Do not trust the mobile client to determine its own plan.

---

# 19. CROSS-PRODUCT HANDOFF

Implement handoff actions such as:

### Desktop → Mobile

“Continue on Companion.”

The active symbol/timeframe/layout becomes available on mobile.

### Mobile → Desktop

“Open in Trading OS.”

Trading OS restores the chart/account context.

This should use shared state IDs rather than encoded screenshots.

---

# 20. PRODUCT QUALITY

The UI should remain:

- matte
- premium
- dark institutional
- highly legible
- restrained in glow
- modern
- information-dense only where useful

Avoid crypto-casino visual language.

Avoid neon overload.

---

# 21. MOBILE PERFORMANCE TARGET

Prioritize:

1. instant shell rendering;
2. cached state;
3. one active realtime connection;
4. incremental chart loading;
5. aggressive request deduplication;
6. lightweight state updates.

Do not rerender the entire application for each quote tick.

---

# 22. BUILD ORDER

### Phase 0
Audit existing app.

### Phase 1
Connect shared Trading Platform Core.

### Phase 2
Fix active account and symbol resolution.

### Phase 3
Guarantee chart/quote parity.

### Phase 4
Complete indicators and drawings.

### Phase 5
Complete account/risk/journal.

### Phase 6
Connect AXE context.

### Phase 7
Push alerts.

### Phase 8
Voice.

### Phase 9
Learning Arc / AXON memory.

### Phase 10
Production hardening.

---

# 23. ACCEPTANCE TEST — THE MOST IMPORTANT TEST

Connect one real MT5 account.

Select:

`XAUUSD`

Open:

`1H`

in Trading OS.

Open AXE Companion.

The following must agree:

- account
- broker symbol
- current quote
- candle series
- current candle
- timeframe
- indicator state
- drawings
- position markers
- alerts

Now create a horizontal level on Companion.

It must appear in Trading OS.

Now ask AXE on Companion:

“What am I looking at?”

AXE must know the real XAUUSD 1H context.

Now set an alert.

Close both apps.

The server must still trigger that alert.

Until this complete flow works, the Trading OS ↔ Companion system is not complete.

---

# 24. AUTONOMOUS MAINTENANCE

AXE Core must continuously monitor:

- mobile build
- PWA/native installation
- push notifications
- market transport
- quote parity
- auth
- broker reconnect
- crash/error telemetry
- provider quotas
- stale data
- app version health

Create regression tests specifically for desktop/mobile parity.

AXE Companion must remain a thin, premium mobile operating surface over one shared trading platform rather than becoming another disconnected application.


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


# PRODUCT-SPECIFIC EXECUTION ORDER — AXE COMPANION

## PHASE C0 — MOBILE REALITY AUDIT

Inspect:
- canonical repo/branch;
- current PWA/native targets;
- route structure;
- mobile UI;
- auth;
- installability;
- service worker;
- notifications;
- chart implementation;
- account state;
- AXE chat/voice;
- current backend coupling.

Acceptance:
- every current capability classified as real/partial/mock/broken/missing.

## PHASE C1 — REMOVE TRADING LOGIC DUPLICATION

Connect Companion to the shared AXE Trading Platform Core.

Delete or retire duplicate:
- symbol maps;
- quote models;
- indicator calculations;
- risk math;
- alert definitions.

Acceptance:
- Companion builds against shared contracts.

## PHASE C2 — MOBILE SHELL AND STATE

Make Home, Markets, Chart, AXE and Account operate from one active-user/account state.

Implement reliable hydration so first render and later tab navigation show the same correct layout/state.

Acceptance:
- no “first-open layout then corrected layout after tab switch” behavior;
- state survives reload where appropriate.

## PHASE C3 — CHART PARITY

Use shared chart state/indicator output.

Implement:
- portrait;
- landscape;
- gestures;
- drawings;
- overlays;
- broker quote source labels.

Acceptance:
- Trading OS/Companion chart parity suite passes.

## PHASE C4 — ACCOUNT + RISK + JOURNAL

Complete mobile views and rapid journal capture.

Acceptance:
- real account state reconciles;
- closed trade can be journaled quickly;
- risk numbers equal Trading OS.

## PHASE C5 — AXE

Wire shared live trading context.

Implement quick actions and deep links.

Acceptance:
- AXE knows active symbol/timeframe/account without repeated prompting.

## PHASE C6 — PUSH NOTIFICATIONS

Implement server-triggered push with deep links.

Test:
- price alert;
- risk alert;
- account disconnect;
- economic event;
- AXE finding.

Acceptance:
- notification arrives with app closed and opens correct context.

## PHASE C7 — VOICE

Connect voice to exactly the same AXE context/tool layer.

Acceptance:
- spoken request and typed request produce equivalent context access.

## PHASE C8 — LEARNING ARC + AXON

Build durable learning signals from journal/account behavior.

Do not store noisy raw market data in AXON.

## PHASE C9 — PWA/NATIVE HARDENING

Verify:
- iOS;
- Samsung/Android;
- install manifest;
- icons;
- service worker;
- standalone mode;
- offline cache;
- first launch;
- updates.

## PHASE C10 — RELEASE

Run:
- typecheck;
- unit tests;
- mobile E2E;
- parity tests;
- production build;
- real-device visual QA.

## COMPANION AUTONOMOUS OPERATIONS AFTER BUILD

AXE Core continually:
- checks public app health;
- checks installability/manifest/service worker;
- checks push delivery;
- checks mobile crash logs;
- checks broker reconnect behavior;
- runs Trading OS parity tests;
- detects stale mobile versions;
- opens repair tasks;
- releases safe patches after quality gates.
