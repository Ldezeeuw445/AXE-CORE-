# Architecture

## Principle

MCP is an interface. NorthSea's source of truth stays AXE Commodities (Supabase
project `kbimnuepbecbyezedvih`); NorthSea's existing automations stay where they are
(edge functions `resend-inbound`, `commodity-intake`, `send-approved-reply`,
`northsea-desk`, `resend-lifecycle`, `kaicalls-webhook`, `northsea-command-center`).
This package adds one secured entry point in front of a shared service layer.

## Layers

| Layer | File | Responsibility |
|---|---|---|
| Transport + auth | `server.py`, `oauth.py` | Streamable HTTP at `/mcp`, bearer verification (RFC 9728 metadata, `WWW-Authenticate`), OAuth 2.1 authorization server, host/origin checks, body limit |
| Guard (per call) | `server.py` → `Guard.run` | scopes, rate limits, idempotency, timeout, safe errors, audit |
| Service | `service.py` → `NorthSeaService` | all NorthSea capabilities; deterministic state, redaction, policy checks |
| Policy | `policy.py`, `matching.py` | scopes, risk classes, sensitive-draft rule, match and readiness scoring |
| Data | `repository.py` | typed PostgREST reads/writes on existing tables; no SQL strings |
| Research | `research.py` | `/research/perplexity` on axe-core-api (shared daily budget) and Tavily search |
| CrewAI | `crew.py` | bounded handoff to `/crew/run` on axe-core-api, `depth="deep"` only |
| Audit | `audit.py` | `core_audit_log` (AXE Companion), local fallback queue |
| State | `store.py` | SQLite on the box: OAuth clients/codes, token hashes, idempotency, rate windows |

## What is reused (not rebuilt)

| Need | Existing AXE / NorthSea capability used |
|---|---|
| Deal, counterparty, communication data | AXE Commodities tables (`opportunities`, `buyer_requirements`, `supplier_offers`, `companies`, `contacts`, `communications`, `email_intelligence`, `call_intelligence`, `deal_evidence`, `deal_tasks`, `action_queue`, `deal_events`, `reply_drafts`, `match_assessments`, `verification_checks`) |
| Tasks | `deal_tasks` — the record the AXE CORE Northsea desk and AXE Chase already show |
| Sending email | edge function `send-approved-reply` (approval check, duplicate guard, Resend idempotency key, branded footer, threading) |
| Sensitive-draft rule | same rule as `northsea-desk`: signed commission protection required |
| Match score | same rule as `commodity-intake` `matchScore` (tested for parity) |
| Web research + budget | axe-core-api `/research/perplexity` (server-side daily question and dollar caps) |
| Search | Tavily key already on the box |
| CrewAI runtime | axe-core-api `/crew/run`, isolated venv `/opt/axe-crew-venv`, slots in `zuinig.py` |
| Login identity | Supabase Auth of AXE Companion (Luka's AXE account) + allowlist |
| Audit | `core_audit_log` used by axe-core-api |
| Deployment | same box, systemd + nginx + certbot pattern as `api.axecompanion.com` |

## What is deliberately not built

- No second database, task engine, calendar or scheduler. Agenda/cron stay in AXE CORE; this server schedules nothing.
- No direct Resend/SMTP calls. The single send path is the edge function.
- No raw SQL tool.
- No autonomous sending or commercial commitment.
- No NorthSea CrewAI crews: the canonical pack contains only a scaffold (see CREWAI_INTEGRATION.md).

## Deterministic vs agentic

| Tool | Deterministic | External research | CrewAI |
|---|---|---|---|
| review_deal, get_next_actions, assess_match, process_reply | yes | no | no |
| qualify_opportunity | yes | no | only `depth=deep` |
| research_counterparty, investigate_blockers | state | Perplexity | only `depth=deep` |
| find_suppliers, find_buyers | DB scoring | Tavily | no |
| prepare_outreach | templates grounded in record | no | no |

## Data flow of a call

1. nginx terminates TLS and forwards to `127.0.0.1:8040`.
2. SDK bearer middleware verifies the token via `NorthSeaTokenVerifier` (hash lookup, expiry, revocation, resource binding).
3. `Guard.run`: scopes → rate limit → idempotency (writes) → service call with timeout.
4. Service reads AXE Commodities, applies redaction for the caller, returns a Pydantic model (structured output + output schema).
5. Audit row to `core_audit_log` (fallback to local store), including denials and errors.
