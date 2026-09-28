# CrewAI integration

AXE CORE is the only global orchestrator. The NorthSea flow is a bounded domain layer
underneath it. `CrewGateway.run(action, handoff)` is the stable adapter the shared NorthSea
service layer calls; MCP tools and service methods do not change when the backend changes.

## Backends

| Role | Backend | Status |
|---|---|---|
| **PRIMARY** | Dedicated NorthSea CrewAI workforce (CrewAI Studio / AMP deployment, one per crew) | **prepared, not yet connected** — waiting for the deployment endpoints |
| **FALLBACK** | Existing AXE CORE general crew (axe-core-api `/crew/run`, `/opt/axe-crew-venv`) | live; kept and not modified |

The general crew proved the full path MCP → CrewGateway → crew → typed result → audit in
production (15 Sep 2026: `qualify_opportunity depth=deep`, status ok, 114 s, audit carries the
run id). **That run does not count as acceptance of the NorthSea workforce.**

## The NorthSea workforce (routes)

| Route | Crew | Roles |
|---|---|---|
| `discovery_run` | NorthSea Discovery Crew | Sourcing Specialist, Research Specialist, Matching Specialist |
| `deal_run` | NorthSea Deal Crew | Deal Qualification Specialist, Evidence Specialist, Communications Specialist |
| `intelligence_run` | NorthSea Intelligence Crew | Market Intelligence Specialist, Research Specialist |
| `operations_run` | NorthSea Operations Crew | Operations Specialist, Deal Qualification Specialist |

Action → route (`ROUTE_FOR_ACTION`): research_counterparty, find_suppliers, find_buyers,
assess_match → `discovery_run`; qualify_opportunity, investigate_blockers, prepare_outreach,
process_reply, review_deal, get_next_actions → `deal_run`; market_signal → `intelligence_run`;
stale_deal, provider_failure → `operations_run`.

Today MCP tools invoke CrewAI only with `depth="deep"` (qualify_opportunity,
research_counterparty, investigate_blockers). Intelligence and operations routes are reachable
through the gateway for AXE CORE events; they add no MCP tools.

## Dedicated backend protocol (CrewAI AMP)

Per route: `NORTHSEA_CREW_<ROUTE>_URL` (https) and `NORTHSEA_CREW_<ROUTE>_TOKEN`.

1. Health: `GET {url}/inputs` → 200 (cached 60 s).
2. `POST {url}/kickoff` with `{"inputs": {"route", "action", "handoff" (JSON string), "roles", "prohibited_actions"}, "meta": {...}}` → `kickoff_id`.
3. Poll `GET {url}/status/{kickoff_id}` until `completed` or `error`, within the deadline.
4. `result.output` must be JSON (optionally fenced) matching the crew output contract:

```json
{
  "analysis": "required, non-empty",
  "claims": [], "blockers": [], "recommendations": [],
  "models": ["model ids used"],
  "skills": [{"name": "assess_match", "version": 1}],
  "tools": ["provider/tool names"],
  "budget_usage": {"research_calls": 1, "premium_calls": 0},
  "confidence": 0.7
}
```

The result is mapped into the typed `CrewRunInfo` (alias `CrewRunResult`) the service layer
already returns; the analysis stays unverified, is redacted for the caller and is never persisted
as fact.

## Fallback policy — never silent

Fallback to the general crew only for reasons listed in `NORTHSEA_CREW_FALLBACK_ON`
(default all five; `none` disables):

| Reason | When |
|---|---|
| `dedicated_backend_not_configured` | no deployment for the route (current state) |
| `dedicated_backend_unavailable` | kickoff/status unreachable or rejected |
| `health_check_failed` | `GET /inputs` not 200 |
| `capacity_exhausted` | kickoff 429/503 |
| `timeout` | dedicated run exceeded the deadline |

Not fallback reasons: invalid output (`status=invalid_output`, `validation=invalid`) and a crew
execution error (`status=error`) are reported as such. Primary + fallback share one 170 s budget;
a fallback needs at least 20 s left.

## Provenance on every result and audit row

`CrewRunInfo` and `core_audit_log.details.crewai` carry: `route`, `requested_crew`, `backend`
(`northsea_crewai` | `axe_general_crew`), `actual_crew`, `fallback_used`, `fallback_reason`,
`run_id`, `models`, `skills` (with versions), `tools`, `budget_usage`, `timings`
(`dedicated_health_s`, `dedicated_run_s`, `crew_execution_s`, `fallback_run_s`, `total_s`),
`validation`, `attempts` (every backend attempt in order). `/ready` with an admin token shows
`crewai_backends` (per-route configuration and fallback policy).

## Connecting the dedicated workforce

1. Put the four URLs and tokens in `/opt/northsea-mcp/.env` (tokens never in git or chat).
2. `systemctl restart northsea-mcp`; check `/ready` (admin) → all four `dedicated_configured: true`.
3. Run the acceptance below.

## Acceptance criteria (dedicated workforce)

The dedicated NorthSea CrewAI integration is production-ready only when **all four routes**
have executed through the dedicated backend and returned valid typed results:

| Route | Required result |
|---|---|
| `discovery_run` | `backend=northsea_crewai`, `actual_crew=NorthSea Discovery Crew`, `fallback_used=false`, `validation=valid`, run id, provenance present |
| `deal_run` | same for NorthSea Deal Crew |
| `intelligence_run` | same for NorthSea Intelligence Crew |
| `operations_run` | same for NorthSea Operations Crew |

A run that used the fallback does not count for any route.
