# Testing

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/northsea_mcp
.venv/bin/python -m pytest -q
```

## Suites

| File | Covers |
|---|---|
| `test_protocol.py` | real MCP client in-process: 14 stable tools, input/output schemas, annotations, structured output, scope refusal, unauthenticated refusal, safe errors, resources; HTTP 401 + discovery, invalid bearer, metadata, public health |
| `test_e2e_http.py` | uvicorn on a real port + official Streamable HTTP client with a service token: discovery, tool call, scope refusal, no token 401, wrong-resource token 401, foreign Host rejected |
| `test_oauth.py` | DCR, consent page CSP, PKCE success/failure, single-use code, token binding, refresh rotation and reuse revocation, wrong password, non-allowlisted user, login rate limit, redirect mismatch, plain PKCE refused, deny, confidential/non-https registration refused, revocation |
| `test_service.py` | deterministic deal state, ranking, not-found, research redaction and own-domain sources, identity scope, budget exhausted, deep CrewAI boundary and redaction, supplier/buyer search dedupe and scoring, match fit vs readiness, qualification without passing gates, blockers never auto-resolved, outreach never names the other party, pending-draft save and no-thread case, reply facts/questions/changed terms, task dedupe, stale update |
| `test_writes.py` | via MCP: idempotent replay, key conflict, missing key, admin scope for approval, sensitive draft needs signed commission, send refuses unapproved / unconfirmed, retry and new key never send twice, high-impact rate limit, draft-save idempotency, mutation audit |
| `test_matching.py` | parity with `commodity-intake` matchScore weights, explanation, readiness |
| `test_store_policy_audit.py` | token hashes only, expiry and revocation, sliding window, write tools need keys, sensitive rules, audit scrubbing, Perplexity answer parsing |

## Fakes versus live

Unit and protocol tests use `tests/fakes.py`: the real AXE Commodities schema and
constraints (for example `reply_drafts.communication_id NOT NULL`, `verification_checks.status =
positive`), verified against the live database on 15 Sep 2026 through the read-only MCP hub.
After deployment, run the live smoke test from CHATGPT_MCP_CONNECTION.md §8 with a service
token.

## Live acceptance (production, 15 Sep 2026)

| Check | Result |
|---|---|
| Public HTTPS `https://mcp.northseacommodity.com` | Let's Encrypt, HSTS, http→https, `/health` ok |
| Discovery | `/mcp` without token → 401 + `resource_metadata`; PRM `authorization_servers` == AS `issuer` exactly; 8 scopes |
| Remote MCP client (public, service token) | 14 tools; `review_deal` DEAL-001 masked without `northsea.identity`, unmasked with it |
| OAuth up to login | DCR 201; consent page 200 with CSP; `northsea.identity` unticked by default |
| Search fallback | Tavily 432 → Zenserp answered; 3 new masked web candidates |
| CrewAI (public, `qualify_opportunity depth=deep`) | real crew run, status ok, 1784-char analysis (names redacted), typed result, call 114 s; audit row has `crewai_run_id` |
| ChatGPT OAuth login + tool call | pending: done by Luka in ChatGPT |

## ChatGPT-shaped selection checks

| Request | Expected tool | Why the description selects it |
|---|---|---|
| “Review deal 001 and tell me what blocks execution.” | northsea_review_deal | “Use this first whenever the user asks about a specific deal … what blocks execution” |
| “Find serious copper cathode suppliers for this buyer requirement.” | northsea_find_suppliers | “Use for 'find serious suppliers for this requirement'” |
| “Research the seller behind this opportunity.” | northsea_research_counterparty | “Use for 'research the seller behind this deal'” |
| “Draft the qualification email but do not send it.” | northsea_prepare_outreach | “Use for 'draft the qualification email but do not send it'. THIS TOOL NEVER SENDS.” |
| “What should NorthSea do next on this deal?” | northsea_get_next_actions | “Use when the user asks 'what should NorthSea do next' on a deal” |

These are asserted indirectly (descriptions present and specific); final confirmation happens
in ChatGPT after connecting.
