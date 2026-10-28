# AXON Memory Manager (account A) - status
Updated: 2026-10-28 09:35 CET (Europe/Amsterdam)
Scope: repo Ldezeeuw445/axon-memory (canonical, live). Never deploy from axon-memory-app.

## Routines
- AXON autonome build-loop, @every 3h (flexible ±15m). Full instruction: "Continue autonomously building AXON Memory per the MASTER BUILD SPEC 3/5 (agent attachment 01M535W8JQYQ69QMRNYRF54DND.md) using docs/tasks.json in Ldezeeuw445/axon-memory: pick the highest-priority unblocked task, implement, test, build, verify, merge and deploy non-destructive work (standing permission from Luka). Check for Claude's recent commits/PRs first and don't overlap. Also health-check app.axon-memory.com, axon-memory.com and mcp.axon-memory.com. Level C items (destructive migrations, irreversible deletion, security weakening, billing changes) need Luka's yes: ask him in short Dutch. Only message Luka when a phase completes, something breaks, or approval is needed; otherwise stay quiet."
- AXON twin-sync, twice daily 08:00 and 20:00 Amsterdam: updates this file, reads twin/axon-memory-manager-B.md.

## Current work / latest
- main at 40635f4 (A11-4 one subscription per customer, stripe-checkout v26 live). Previous: c1a3b49, c527040, cf76bf7.
- Frontend for c527040 + 40635f4 merged but NOT deployed: Cloudflare axon connector OAuth failing.
- Launch-readiness audit (docs/LAUNCH_READINESS.md, onboarding/empty states/SEO/legal/perf, recall relevance threshold for nonsense queries) started but stopped on usage limit - not done.

## Open tasks
- Launch-readiness audit + fixes (unclaimed - B may take it; claim here first).
- Recall returns hits for nonsense query (relevance threshold).
- Frontend Pages deploy (axon-app then axon-memory, per-site upload token, then deploy:smoke) once Cloudflare works.
- Auth SMTP via Resend + email templates: waiting on Luka's SUPABASE_ACCESS_TOKEN_AXON.
- Blocked on Luka: A0-2 GitHub billing lock (CI), A5-3 leaked-password protection (Supabase dashboard), A12-1 real-phone test, Stripe portal plan switching check.

## Work split proposal
A (me): deploys, billing, Supabase/edge functions, health checks, build-loop tasks in docs/tasks.json.
B: launch-readiness audit + UI/landing/copy polish PRs (no deploys; A deploys after merge). Claim tasks in this file / B's file before starting.
