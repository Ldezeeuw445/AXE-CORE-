# CrewAI integration

## Current state (measured 15 Sep 2026)

- The canonical NorthSea pack (`NORTHSEA_COMMODITY_DESK/crewai/implementation`) is a
  scaffold: eight role profiles in `agents.yaml`, crew builders without tasks, a router.
  There are no runnable NorthSea crews.
- The CrewAI runtime that does run is AXE CORE's: axe-core-api `/crew/run`, isolated venv
  `/opt/axe-crew-venv`, concurrency slots and timeouts (`crew_runner.py`, `zuinig.py`).

## Boundary implemented

`northsea_mcp/crew.py` → `CrewGateway.run(action, handoff)`:

- Crew chosen with the pack's own routing table (`CREW_FOR_ACTION`): research/find/assess →
  discovery; qualify/investigate/outreach/reply/review/next → deal.
- Handoff follows `crewai/HANDOFFS.md`: entity ids, verified facts, unverified claims,
  research findings, blockers, required output, prohibited actions.
- Called only when `depth="deep"` on `qualify_opportunity`, `research_counterparty` and
  `investigate_blockers`. All other tools are deterministic and never start a crew.
- Result is `CrewRunInfo(used, crew, run_id, status, analysis, reason)`. The analysis is
  labelled unverified, redacted for the caller, never persisted, never used to pass a gate.
- Availability (`/ready`): AXE API key present and crew venv exists on the host.

## Mapping

| MCP capability | Crew / role (pack) | Today |
|---|---|---|
| research_counterparty | Discovery / Research | Perplexity research + optional crew analysis |
| find_suppliers, find_buyers | Discovery / Sourcing | DB scoring + Tavily search (no crew) |
| assess_match | Discovery / Matching | deterministic scoring (no crew) |
| qualify_opportunity | Deal | deterministic gates + optional crew analysis |
| investigate_blockers | Deal + Research | Perplexity per blocker + optional crew analysis |
| prepare_outreach | Deal / Communications | grounded templates (no crew) |
| process_reply | Deal | stored email/call intelligence (no crew) |
| review_deal, get_next_actions | Deal | deterministic (no crew) |

## Replacing the boundary with real NorthSea crews

1. Build the Discovery and Deal crews inside `/opt/axe-crew-venv` (tasks, tools bound to
   `NorthSeaService` methods, not to raw SQL).
2. Expose them on axe-core-api (for example `/crew/northsea/{crew}`) with the same handoff.
3. Point `CrewGateway.run` at that route. No MCP tool signature changes.
4. Keep the rule: crews return structured, validated output; side effects only through the
   service layer's write methods and their approval checks.
