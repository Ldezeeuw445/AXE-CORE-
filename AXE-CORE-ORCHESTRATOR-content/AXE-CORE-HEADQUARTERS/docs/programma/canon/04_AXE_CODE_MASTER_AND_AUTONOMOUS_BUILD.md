# MASTER BUILD SPECIFICATION 4/5
# AXE CODE — AI SOFTWARE CREATION ENVIRONMENT

## ROLE

You are the product architect and implementation owner for **AXE Code**.

AXE Code should evolve from the existing AXE Core coding capabilities / Code Agent foundation.

Do not discard working AXE Core infrastructure.

Do not create an unrelated second orchestration stack.

AXE Core remains the underlying internal operating/orchestration system.

AXE Code is the user-facing productized software-development environment.

---

# 1. PRODUCT VISION

AXE Code combines the strongest workflow concepts of:

- Cursor
- Replit
- visual application builders such as FlutterFlow

inside one coherent system.

The core promise:

**Describe → Build → Edit → Design → Run → Test → Deploy**

without forcing the developer to constantly leave the application.

---

# 2. PRODUCT DIFFERENTIATOR

Many tools specialize in one layer.

### Cursor-like systems

Excellent code editing and AI context.

### Replit-like systems

Excellent instant runtime/preview/environment.

### Visual builders

Excellent visual layout and low-code manipulation.

AXE Code should combine:

- professional code editor
- AI coding agent
- multi-agent workflows
- live runtime
- terminal
- visual builder
- database tools
- Git
- preview/browser
- deployment

without hiding the real source code.

---

# 3. SOURCE CODE IS AUTHORITATIVE

Visual editing must update real project code.

AI editing must update real project code.

Manual editor changes update real project code.

There must not be a secret second proprietary representation that diverges from source.

Where a visual representation is required, derive it from code/AST/project metadata.

---

# 4. PRIMARY WORKSPACE

Desktop layout should contain:

### Left

Explorer:

- files
- search
- source control
- projects

### Center

Monaco editor or existing production editor.

### Right

AXE conversation / agent state / context.

### Bottom

Switchable:

- terminal
- tests
- problems
- logs
- Git
- tasks

### Preview

Integrated browser/application preview.

### Visual Mode

Switch center workspace between:

`CODE`

and:

`DESIGN`

without creating separate project states.

---

# 5. PROJECT CREATION

Support:

### New from prompt

“Build me a SaaS dashboard for…”

### New from template

- React/Vite
- Next.js
- Tauri
- common API template
- Supabase application

Expand supported stacks later.

### Import GitHub

Clone existing repo.

### Open local workspace

Desktop application.

Never force users to start from an AXE-specific template.

---

# 6. BYOK

BYOK is a core feature.

Allow user-provided keys for supported providers such as:

- OpenAI
- Anthropic
- Google
- OpenRouter
- Groq
- compatible endpoints
- local Ollama

Provider list should be extensible.

Store secrets encrypted.

Never display full keys after save.

Never write them into prompts/logs.

Never put server keys into generated frontend code.

---

# 7. MODEL ROUTER

Users may select a model manually.

AXE can also route automatically based on task.

Examples:

### Architecture/reasoning

high-capability reasoning model.

### Quick coding

fast coding model.

### Large repo review

model/context strategy suitable for large codebases.

### Local/private

Ollama.

Log:

- selected provider
- model
- task
- latency
- token/credit use
- error

without storing hidden chain-of-thought.

---

# 8. PROJECT CONTEXT ENGINE

AXE must understand the actual repository.

Index:

- file tree
- languages
- package files
- routes
- components
- types
- schemas
- tests
- dependencies
- Git state
- known architectural docs

Use code-specific retrieval.

AXON Memory may store durable project decisions.

Do not use AXON as a replacement for repository indexing.

---

# 9. AGENT MODEL

AXE is the user-facing orchestrator.

Internally it can delegate.

Useful specialist roles:

### Planner

Maps task → impacted systems.

### Implementer

Changes code.

### UI Engineer

Handles visual/design changes.

### Backend Engineer

APIs/schema/server.

### Reviewer

Reviews diff.

### Test Agent

Creates/runs tests.

### Security Reviewer

Checks dangerous changes.

### Deployment Agent

Builds/deploys/verifies.

Do not expose eight chatbots to the user.

The user speaks to AXE.

---

# 10. MULTI-AGENT EXECUTION

Independent tasks may run in isolated worktrees/workspaces.

Example:

Agent A → frontend.

Agent B → Supabase migration.

Agent C → tests.

Merge only after conflict/review gates.

Each agent run must expose:

- objective
- state
- files changed
- commands
- tests
- result
- errors

No invisible uncontrolled coding.

---

# 11. EDITING EXPERIENCE

Support:

- syntax highlighting
- IntelliSense/LSP where available
- file search
- symbol search
- diff
- inline AI edit
- multi-file edit
- undo
- revert
- Git history
- diagnostics

AI changes should be shown as diffs before or immediately after application depending on configured permission mode.

---

# 12. PERMISSION MODES

### Suggest

AI proposes changes.

### Edit

AI may modify workspace.

### Execute

AI may run approved shell commands.

### Autonomous Task

AI may complete a bounded task end-to-end.

Destructive/system-level operations require escalation.

---

# 13. TERMINAL

Terminal must be real.

Support:

- project cwd
- multiple terminals
- logs
- command status
- process management

AXE may execute commands through a controlled tool layer.

Record relevant actions for task audit.

---

# 14. SANDBOXING

Do not allow arbitrary cloud jobs to compromise AXE infrastructure.

Remote execution environments should be isolated.

Use project-scoped:

- container/workspace
- environment variables
- filesystem
- processes
- network controls
- resource limits

Never mount global infrastructure secrets into user code sandboxes.

---

# 15. REPLIT-LIKE RUN EXPERIENCE

User clicks:

`RUN`

AXE Code should:

1. detect project;
2. install/verify dependencies;
3. start relevant process;
4. detect exposed port;
5. route preview;
6. stream logs;
7. surface compile/runtime errors.

Preview updates as code changes.

---

# 16. PREVIEW BROWSER

Provide integrated preview.

Useful controls:

- desktop
- tablet
- phone widths
- refresh
- open externally
- inspect
- console
- network where possible

AXE should be able to visually inspect the preview through browser/computer capabilities.

---

# 17. DESIGN MODE

This is the FlutterFlow-style capability.

Visual mode should support:

- component tree
- selection
- drag/reorder
- spacing
- sizing
- typography
- flex/grid
- responsive breakpoints
- properties
- design tokens
- component variants

Edits modify source code.

Do not build a no-code dead end.

---

# 18. AI + DESIGN

User should be able to select a component and say:

“Make this card smaller on mobile.”

AXE receives:

- selected component
- source location
- computed layout
- screenshot/visual context
- project design system

and produces the actual code diff.

---

# 19. DATABASE MODE

Initial first-class target:

Supabase.

Provide:

- project connection
- schema explorer
- tables
- columns
- indexes
- relationships
- RLS
- functions
- migrations
- SQL editor
- logs

AI may propose schema changes.

Destructive migrations require approval.

---

# 20. AUTH BUILDER

Provide guided support for common authentication systems.

For Supabase:

- sign-up
- sign-in
- reset password
- OAuth
- session
- protected routes
- RLS linkage

Generate actual code.

Do not only draw auth screens.

---

# 21. GIT

GitHub should be first-class.

Support:

- repository connection
- branch
- diff
- commit
- push
- pull
- PR
- review

AXE task result should end with clear Git state.

Example:

`Changed 7 files. 23 tests pass. Commit prepared.`

---

# 22. DEPLOYMENTS

Build deployment adapters.

Examples:

- Cloudflare
- Vercel
- VPS/Docker
- static hosting
- Tauri build workflows

Provider support must remain modular.

AXE can:

- build
- deploy
- inspect logs
- verify URL
- run smoke tests
- roll back

where credentials/permissions allow.

---

# 23. COMPUTER / BROWSER AGENTS

Reuse AXE Core capabilities.

Browser agent can:

- verify UI
- navigate preview
- reproduce bug
- inspect deployed app

Computer-use worker can handle workflows that require graphical software when appropriate.

Do not duplicate these workers inside AXE Code.

---

# 24. MEMORY

AXON integration should remember durable project information such as:

- preferred stack
- architecture decisions
- decisions rejected
- design preferences
- deployment rules
- project-specific conventions

Example:

“AXE Core production branch is orchestrator.”

This is useful memory.

Thousands of raw source files are not.

---

# 25. TASK SYSTEM

Every substantial user request becomes a Task.

Task has:

- objective
- plan
- status
- subtasks
- agent assignments
- changed files
- tests
- deployment
- final report

Tasks can resume after application restart.

---

# 26. AUTONOMOUS APP BUILD FLOW

Example request:

“Build a mobile-first customer dashboard with Supabase.”

AXE should:

1. inspect/create project;
2. define plan;
3. scaffold architecture;
4. create database;
5. configure auth;
6. build UI;
7. connect backend;
8. run project;
9. inspect visually;
10. fix issues;
11. write tests;
12. run tests;
13. commit;
14. deploy;
15. inspect deployment;
16. report result.

The user should not need to manually coordinate several coding agents.

---

# 27. EXISTING AXE CORE INTEGRATION

Reuse existing capabilities where available:

- Tauri
- Monaco/editor
- terminal
- Git
- browser agent
- computer worker
- task kernel
- Supabase
- AXON
- Codex bridge
- Claude bridge
- Cursor bridge
- provider router
- model health
- Docker/VPS
- deployments

Do not rewrite stable systems merely to rename them AXE Code.

Extract reusable capabilities behind clean internal interfaces.

---

# 28. PRODUCT SURFACES

Recommended:

### Projects

All projects.

### Code

IDE.

### Design

Visual builder.

### Database

Data/backend.

### Deploy

Builds/releases.

### Tasks

AXE work.

### Integrations

GitHub, Supabase, hosting, models.

### Settings

BYOK and system preferences.

---

# 29. MOBILE

AXE Code is desktop-primary because professional software development benefits from a larger workspace.

Mobile should still support:

- task creation
- AXE chat
- status
- preview
- diff review
- approvals
- deployment monitoring
- emergency rollback

Do not attempt to fit the full IDE onto a phone as the primary workflow.

---

# 30. COMMERCIAL MODEL

Keep exact pricing configurable until product owner defines it.

Recommended product mechanics can include:

### Free / BYOK

Use own AI keys and basic runtime.

### Paid

Additional:

- hosted runtime
- larger projects
- more sandboxes
- cloud agents
- advanced deployment
- collaboration
- managed models

Do not hardcode unapproved prices.

---

# 31. SECURITY

Treat this product as high-risk infrastructure.

Protect:

- GitHub tokens
- model keys
- Supabase credentials
- deployment tokens
- SSH
- terminal
- browser sessions
- user source code

Implement:

- encrypted secret storage
- scoped credentials
- audit trails
- sandboxing
- explicit destructive-action gates
- tenant isolation

---

# 32. FIRST PRODUCTION MILESTONE

AXE Code is valuable when this works:

1. Import a real GitHub repo.
2. AXE indexes it.
3. User asks for a feature.
4. AXE identifies relevant files.
5. AXE changes code.
6. User sees diff.
7. AXE starts app.
8. Preview opens.
9. AXE sees a visual problem.
10. AXE fixes it.
11. Tests pass.
12. Commit is created.
13. Deployment succeeds.
14. AXE verifies deployment.

Then add deeper visual builder functionality.

---

# 33. DEFINITION OF DONE

Do not declare AXE Code ready because Monaco opens.

It is ready only when code + AI + runtime + visual preview + Git + deployment form one continuous workflow.

---

# 34. AUTONOMOUS MAINTENANCE

Because AXE Core operates beneath AXE Code, use AXE Core to maintain:

- health
- runners
- browser workers
- sandboxes
- model providers
- deployments
- dependency security
- GitHub connections
- Supabase connections
- CI
- app releases

Keep the product self-observing.

Failures should become actionable tasks automatically.


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


# PRODUCT-SPECIFIC EXECUTION ORDER — AXE CODE

## PHASE X0 — CAPABILITY INVENTORY

Inspect AXE Core and AXE Code foundations for:
- Monaco/editor;
- terminal;
- Git;
- GitHub;
- task kernel;
- browser agent;
- computer use;
- Supabase tooling;
- model router;
- BYOK;
- deployment;
- sandboxes;
- local/remote runtime;
- preview;
- visual builder work.

Classify reusable vs duplicated.

## PHASE X1 — PRODUCT BOUNDARY

Extract reusable internal services without forking AXE Core.

Acceptance:
- AXE Core remains orchestrator;
- AXE Code consumes shared capabilities through clean interfaces.

## PHASE X2 — PROJECT SYSTEM

Implement:
- create;
- import GitHub;
- open local;
- metadata;
- recent projects;
- canonical project state.

## PHASE X3 — CONTEXT INDEX

Build repo index for:
- files;
- symbols;
- dependencies;
- routes;
- tests;
- schema;
- architecture docs;
- Git state.

Acceptance:
- AXE can locate relevant implementation files for benchmark tasks.

## PHASE X4 — AGENT TASK KERNEL

Implement bounded autonomous task execution:
plan → isolated work → edit → test → review → integrate.

Acceptance:
- every command/change/result is auditable;
- crashes can resume.

## PHASE X5 — IDE

Complete production editor, problems, terminal, search, diff and Git integration.

## PHASE X6 — RUN / PREVIEW

Implement project detection and one-button run.

Acceptance:
- real imported app launches;
- logs stream;
- port is detected;
- preview loads;
- runtime errors are surfaced.

## PHASE X7 — AXE VISUAL QA

Give AXE browser/computer visibility into preview.

Acceptance:
- AXE can reproduce and fix a visible UI defect then re-verify it.

## PHASE X8 — DESIGN MODE

Build AST/source-backed visual editing.

Start with robust React/Tailwind/CSS use cases before broad framework claims.

Acceptance:
- visual edit produces a clean source diff;
- code edit is reflected back into design view.

## PHASE X9 — SUPABASE MODE

Implement schema explorer, SQL/migrations, RLS and auth tooling.

Require approval for destructive changes.

## PHASE X10 — BYOK / MODEL ROUTER

Securely implement provider configuration and task-based routing.

Acceptance:
- key values are never logged or exposed to generated client code.

## PHASE X11 — DEPLOY

Implement adapters for the environments actually used first.

Acceptance:
- build → deploy → smoke test → rollback is machine-operable.

## PHASE X12 — END-TO-END BENCHMARK

Use one real repo.

Complete:
import → request → plan → change → diff → run → visual verify → test → commit → deploy → verify.

AXE Code is not releasable before this passes.

## AXE CODE AUTONOMOUS OPERATIONS AFTER BUILD

AXE Core continually:
- checks runners/sandboxes;
- checks model providers;
- checks browser workers;
- checks GitHub/Supabase/deployment connections;
- checks build queues;
- checks dependency vulnerabilities;
- retries safe failed jobs;
- quarantines unhealthy workers;
- opens incidents/tasks automatically;
- validates release smoke tests.
