# MASTER BUILD SPECIFICATION 3/5
# AXON MEMORY — UNIVERSAL MEMORY FOR AI

## ROLE

You are the senior product engineer, AI-memory architect, database engineer, privacy/security engineer and implementation owner for **AXON Memory**.

AXON Memory already exists.

Do not replace it with another generic AI chat application.

Do not throw away the existing Operating Manual, product canon, terminology, Supabase implementation, MCP implementation, domains or deployed product.

The existing canon is authoritative unless the product owner explicitly changes it.

The required process is:

**UNDERSTAND → INSPECT → MAP → CREATE → AUDIT → VERIFY → SHIP**

---

# 1. PRODUCT DEFINITION

AXON Memory is a persistent universal memory layer for AI.

It solves a simple problem:

A user should not have to rebuild themselves from zero every time they change:

- model
- AI provider
- chat application
- coding agent
- device
- workspace

AXON creates one durable memory layer that multiple AI systems can use.

AXON remembers.

Other systems reason.

---

# 2. PRODUCT BOUNDARY

AXON is NOT:

- another ChatGPT clone
- a chatbot with memory
- a notes application
- a vector database UI
- a generic document manager
- an agent orchestrator

AXE Core orchestrates.

AXON remembers.

Keep those boundaries explicit.

---

# 3. CANONICAL LANGUAGE

Preserve the established AXON concepts.

Core nouns include:

- Memory
- Thread
- Core
- Facet
- Weight
- Depth

Core lifecycle verbs include:

- Capture
- Recall
- Retire
- Delete

Do not casually invent competing terminology.

Any new core concept must be justified against the AXON Operating Manual and canon.

---

# 4. MEMORY LIFECYCLE

The production lifecycle should operate as:

**CAPTURE  
→ NORMALIZE  
→ CLASSIFY  
→ LINK  
→ STORE  
→ RETRIEVE  
→ USE  
→ STRENGTHEN / UPDATE  
→ RETIRE  
→ DELETE**

Each stage must be observable.

---

# 5. MEMORY MODEL

A Memory should support structured metadata such as:

- id
- owner
- content
- normalized content
- provenance
- source type
- source id
- source application
- source timestamp
- created timestamp
- updated timestamp
- Facets
- Weight
- Depth
- Thread membership
- Core relation
- confidence where relevant
- lifecycle state
- embedding
- relationship metadata

Do not reduce memory to:

`text + embedding`.

---

# 6. PROVENANCE

Every durable Memory must answer:

“Where did this come from?”

Possible sources:

- direct user capture
- ChatGPT
- Claude
- coding agent
- connected email
- connected document
- GitHub
- AXE Core
- Trading OS
- AXE Companion
- API
- MCP

Source metadata must remain attached.

Generated conclusions must never masquerade as direct user statements.

---

# 7. MEMORY STRENGTH

Weight should reflect meaningful memory importance/use rather than arbitrary UI decoration.

Possible signals:

- explicit user importance
- repeated recall
- repeated confirmation
- recency
- relationship density
- successful use
- contradiction
- retirement

Do not automatically strengthen garbage because an automation repeatedly touched it.

---

# 8. THREADS

Thread is a central primitive.

A Thread represents continuity around an evolving subject.

Examples:

- building AXE Companion
- a long-running business deal
- a research subject
- a personal project
- an architecture decision stream

Memories can relate across Threads without destructive duplication.

---

# 9. FACETS

Facets provide alternate ways of seeing the same shared memory layer.

Do not duplicate underlying memory per app.

One memory can be exposed differently depending on context.

Examples:

- development
- trading
- business
- personal project

while remaining one underlying Memory.

---

# 10. VISUAL RAG / TERRAIN

Visual RAG is an important product differentiator.

The visual system must reflect real memory relationships.

Do not display random particle graphs pretending to represent intelligence.

Nodes/terrain should derive from real:

- Memories
- Threads
- relationships
- Facets
- Weight
- Depth
- recency/activity

Users should be able to move from a high-level terrain view toward actual provenance.

---

# 11. MOBILE-FIRST PRINCIPLE

AXON is mobile-first.

The primary mobile jobs are:

1. capture something immediately;
2. recall something immediately;
3. understand what AXON currently remembers;
4. inspect continuity/Threads;
5. manage connected AI/apps;
6. manage privacy.

Desktop can provide deeper exploration.

Do not design the phone as a shrunken database administration UI.

---

# 12. PRIMARY MOBILE SURFACES

Recommended product structure:

### Home / Recall

Dominant universal recall/search input.

Below it:

- recent Threads
- recently strengthened Memories
- active context
- relevant Facets

### Capture

Instant capture.

Support:

- text
- voice
- share sheet
- links
- image/document references where supported

### Threads

Continuity over time.

### Terrain

Mobile-optimized version of the real visual memory map.

### Connections

Connected AIs/apps/sources.

### Profile / Privacy

Usage, subscription, security and data controls.

---

# 13. AXON IS NOT A CHATBOT

Do not add a fake general-purpose chat interface merely because the backend can call an LLM.

Recall can use natural language.

AXON may summarize or explain retrieved context.

But the core UX remains memory.

---

# 14. RECALL ENGINE

Implement hybrid retrieval.

Use combinations of:

- semantic similarity
- exact/fuzzy text
- Thread relevance
- Facet
- recency
- Weight
- Depth
- provenance
- user context

Return ranked memories plus traceable source context.

The output must distinguish:

- memory
- inference
- source
- confidence

---

# 15. CONTRADICTIONS

Memory is not static.

When newer information conflicts with older information:

Do not blindly overwrite historical provenance.

Represent:

- current preferred truth
- previous state
- contradiction/supersession relationship

This allows the system to understand change over time.

---

# 16. DATABASE

Supabase/Postgres remains the source of truth.

Use RLS throughout.

Vector search may use pgvector or the existing equivalent.

Graph relationships can exist relationally first.

Do not introduce a separate graph database unless there is a measured technical need.

---

# 17. TENANT ISOLATION

A user must never retrieve another user's Memory.

Create explicit RLS tests for:

- direct row access
- joins
- RPC/functions
- semantic recall
- Threads
- relationships
- MCP
- API
- exports

Tenant isolation failures are release blockers.

---

# 18. MCP

AXON MCP is a first-class product surface.

Existing domain:

`mcp.axon-memory.com`

The MCP must support the canonical lifecycle.

At minimum:

- capture
- recall
- retire
- delete

where permissioned.

Additional operations can expose Threads, context and status without violating the canon.

Do not guess transports or endpoints.

Inspect the deployed implementation and preserve real authentication/configuration.

---

# 19. API / SDK

Expose AXON through a stable versioned API.

Developers should be able to:

1. authenticate;
2. capture;
3. recall;
4. attach provenance;
5. reference Threads;
6. handle deletion;
7. receive normalized results.

Create typed SDKs where useful.

Start with TypeScript.

Python can follow.

---

# 20. CONNECTORS

Connector framework should support services such as:

- ChatGPT
- Claude
- coding tools
- GitHub
- email
- documents
- AXE products

Each connector needs:

- connection status
- scope
- last successful sync
- errors
- imported object count where appropriate
- revoke action
- permission explanation

Do not imply a connector is synchronized if it has failed.

---

# 21. AXE ECOSYSTEM INTEGRATION

### AXE Core

Uses AXON for durable cross-agent/project memory.

### AXE Companion

Can persist durable trading knowledge.

### Trading OS

Can persist conclusions/playbook/user learning.

### AXE Code

Can persist:

- architecture decisions
- user preferences
- project decisions
- unresolved constraints
- implementation conclusions

Do NOT copy entire repositories into AXON Memory.

Repo search/indexing is a separate technical retrieval system.

---

# 22. PREMIUM LANDING PAGE

The public landing page must feel like a premium technology product.

Current domain:

`axon-memory.com`

App:

`app.axon-memory.com`

MCP:

`mcp.axon-memory.com`

The landing page should be built mobile-first and scale upward.

---

# 23. LANDING PAGE STORY

The page must explain the product without technical jargon first.

Recommended narrative:

### HERO

Core idea:

**One memory. Every AI.**

Explain:

Your AI tools currently forget each other.

AXON gives them a shared memory layer.

Primary CTA:

`Start`

Secondary CTA:

`See how it works`

Use approved AXON product copy if the canonical product-language files already contain superior final wording.

---

# 24. HERO VISUAL

Use a real AXON visual system.

Possible visual:

A memory enters from one AI → enters AXON → becomes available to another AI.

Or real anonymized/demo Terrain data.

Do not render meaningless “AI particles.”

---

# 25. PROBLEM SECTION

Explain:

- AI context is fragmented
- every app has separate history
- changing tools loses continuity
- users repeatedly explain themselves
- teams/agents repeat solved work

Then show AXON as the persistent layer beneath them.

---

# 26. HOW IT WORKS

Explain in simple terms:

### Capture

AXON receives something worth remembering.

### Recall

Another AI retrieves relevant context when needed.

### Continuity

The memory remains available across sessions, tools and devices.

Technical terminology can appear later.

---

# 27. PRODUCT VISUALS

Use actual product interfaces wherever possible:

- Recall
- Thread
- Terrain
- Connections
- mobile capture
- MCP integration

Do not ship marketing screenshots containing fake claims, fake counts or fake customer data.

---

# 28. DEVELOPER SECTION

Show:

- API
- MCP
- SDK
- source-aware memory
- cross-agent use

Make integration feel easy.

---

# 29. PRIVACY SECTION

This section must be prominent.

Explain clearly:

- user ownership
- permissions
- source awareness
- deletion
- connector revocation
- tenant isolation
- security

Avoid vague “military-grade” marketing claims.

---

# 30. PRICING

Preserve the established pricing unless product owner explicitly changes it:

- Starter — €2.99
- Pro — €5.99
- Power — €9.99
- Lifetime — €199

If older code uses Ultra where canonical product language says Power, reconcile the naming against current approved canon before release.

Plan enforcement belongs server-side.

---

# 31. MOBILE ONBOARDING

Keep onboarding short.

Suggested flow:

### Step 1

What AXON does.

### Step 2

Create/sign in.

### Step 3

Connect first AI/source.

### Step 4

Capture first Memory.

### Step 5

Demonstrate Recall.

### Step 6

Explain privacy/control.

The user should experience value before being presented with extensive settings.

---

# 32. OFFLINE CAPTURE

Mobile capture should survive connectivity issues.

Queue the capture securely.

Sync when network returns.

Show status:

- queued
- syncing
- stored
- failed

Never claim stored before backend acknowledgement.

---

# 33. DATA CONTROLS

Users need controls for:

- export
- delete
- connector revoke
- Memory retirement
- account deletion
- data scope
- source inspection

Deletion semantics must propagate through:

- relational row
- vector index
- caches
- derived search indexes

according to documented retention rules.

---

# 34. BILLING

Stripe may remain the web billing system where currently implemented.

Native mobile billing must comply with distribution platform requirements where relevant.

Do not create conflicting subscription truth between Stripe/native app and AXON.

Normalize entitlement state server-side.

---

# 35. OBSERVABILITY

Monitor:

- Capture success rate
- Recall latency
- Recall failure
- MCP health
- connector health
- vector indexing
- queue depth
- database errors
- auth errors
- billing webhooks
- RLS failures
- deletion jobs

---

# 36. REQUIRED REPO DOCUMENTATION

Maintain:

`OPERATING_MANUAL`

`PRODUCT_LANGUAGE`

`LEXICON`

`ARCHITECTURE.md`

`MEMORY_MODEL.md`

`SECURITY.md`

`MCP.md`

`RUNBOOK.md`

`ACCEPTANCE.md`

`CLAUDE.md`

Do not allow implementation to silently drift away from these documents.

---

# 37. ACCEPTANCE TEST

Perform this real flow:

1. User creates AXON account.
2. User captures a new Memory.
3. Memory stores with provenance.
4. User opens another supported AI through AXON MCP.
5. AI recalls relevant Memory.
6. Recall shows the right user information.
7. Source is traceable.
8. Update/newer fact can supersede older context safely.
9. Retire works.
10. Delete removes it from future Recall.
11. A different user cannot retrieve it.
12. Mobile Recall works.
13. Terrain reflects actual relationship data.
14. Billing entitlement is correct.
15. MCP remains healthy.

Until this works end-to-end, AXON is not done.

---

# 38. AUTONOMOUS MAINTENANCE

AXE Core should continually inspect:

- MCP health
- app health
- landing health
- RLS
- connector jobs
- queues
- database migrations
- billing webhook delivery
- API latency
- broken onboarding
- failed tests
- dependency vulnerabilities

Automate safe fixes.

Never autonomously weaken privacy/security controls to recover a failing feature.


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


# PRODUCT-SPECIFIC EXECUTION ORDER — AXON MEMORY

## PHASE A0 — CANON + REALITY AUDIT

Read the existing:
- Operating Manual;
- product language;
- lexicon;
- migrations;
- Supabase schema;
- RLS;
- MCP;
- app;
- landing page;
- billing;
- connectors;
- deployment configuration.

Create a drift report.

Acceptance:
- canon vs implementation differences are explicit.

## PHASE A1 — MEMORY DOMAIN MODEL

Normalize:
- Memory;
- Thread;
- Core;
- Facet;
- Weight;
- Depth;
- provenance;
- lifecycle;
- relationships;
- contradiction/supersession.

Write typed contracts and schema tests.

## PHASE A2 — CAPTURE PIPELINE

Implement observable:
capture → normalize → classify → link → store → index.

Acceptance:
- every stored memory has owner + provenance;
- failed capture is visible and retryable;
- offline/mobile queue is idempotent.

## PHASE A3 — RECALL ENGINE

Implement hybrid retrieval using:
- semantic;
- lexical;
- thread;
- facet;
- recency;
- weight;
- depth;
- provenance/context.

Create evaluation fixtures.

Acceptance:
- relevant results rank correctly on a repeatable eval set;
- source trace is returned.

## PHASE A4 — CONTRADICTION / UPDATE / RETIRE / DELETE

Implement lifecycle correctly.

Acceptance:
- new truth can supersede prior state without falsifying history;
- retired data stops appearing where policy says it should;
- deleted data disappears from relational/vector/cache/search surfaces.

## PHASE A5 — RLS / TENANT SECURITY

Create explicit adversarial tests.

Acceptance:
- user A cannot retrieve user B data through any supported path.

This is a hard release gate.

## PHASE A6 — MCP

Verify existing deployed MCP transport/auth.

Implement canonical operations and health.

Acceptance:
- external AI can capture and recall through real MCP;
- provenance and tenant boundary remain intact.

## PHASE A7 — API / SDK

Create stable API contracts and initial TypeScript SDK.

Generate integration tests.

## PHASE A8 — CONNECTORS

Implement connector runtime contract:
- status;
- permissions;
- sync cursor;
- failures;
- revoke;
- import provenance.

Start with already-real integrations.

Do not mark unsupported integrations as connected.

## PHASE A9 — MOBILE-FIRST PRODUCT

Build/repair:
- Recall home;
- Capture;
- Threads;
- Terrain;
- Connections;
- Privacy/Profile.

Acceptance:
- primary flows are fast on a phone;
- Terrain uses real data relationships.

## PHASE A10 — PREMIUM LANDING

Implement the exact product story in the master spec using real product visuals.

Acceptance:
- responsive;
- no fake user/customer claims;
- pricing and plan names consistent with canonical backend entitlements.

## PHASE A11 — BILLING / ENTITLEMENTS

Unify Stripe/native entitlement truth server-side.

Test webhook replay/idempotency.

## PHASE A12 — RELEASE

Run:
- typecheck;
- unit/integration;
- RLS suite;
- MCP suite;
- recall eval;
- production build;
- deployment smoke tests.

## AXON AUTONOMOUS OPERATIONS AFTER BUILD

AXE Core continually:
- pings app, landing and MCP;
- checks capture failure rate;
- checks recall latency/error rate;
- checks vector-index backlog;
- checks connector jobs;
- checks billing webhooks;
- checks deletion backlog;
- runs RLS security regression tests on every backend release;
- runs recall evaluation periodically;
- detects documentation drift;
- opens repair tasks automatically.
