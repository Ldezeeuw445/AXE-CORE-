"""Versie-gecontroleerde crew-definities, 1-op-1 met de Studio-YAML-export.

De YAML onder `crews/config/` is de bron van agents/tasks. Dit module spiegelt
die keys zodat de runtime geen YAML-parser nodig heeft in de test-venv.
`test_local_crews.py` controleert dat de YAML-topkeys gelijk blijven.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

CONFIG_ROOT = Path(__file__).resolve().parent / "config"

# Wat de Studio Master-flow als *nested copies* beschrijft — lokaal verboden.
NESTED_STUDIO_AGENT_COUNTS = {
    "discovery": 6,
    "deal": 3,
    "intelligence": 2,
    "operations": 2,
}


@dataclass(frozen=True)
class AgentDef:
    key: str
    role: str
    goal: str
    tools: tuple[str, ...] = ()
    backstory: str = ""
    llm: str = "openai/gpt-5.6-luna"


@dataclass(frozen=True)
class TaskDef:
    key: str
    agent: str
    description: str
    expected_output: str
    async_execution: bool = False


@dataclass(frozen=True)
class CrewSpec:
    crew_id: str
    name: str
    process: Literal["sequential"] = "sequential"
    studio_id: str = ""
    agents: tuple[AgentDef, ...] = ()
    tasks: tuple[TaskDef, ...] = ()
    invariants: tuple[str, ...] = ()

    @property
    def agent_keys(self) -> tuple[str, ...]:
        return tuple(a.key for a in self.agents)

    @property
    def agent_roles(self) -> list[str]:
        return [a.role for a in self.agents]

    @property
    def task_keys(self) -> tuple[str, ...]:
        return tuple(t.key for t in self.tasks)


DEAL_EXECUTION = CrewSpec(
    crew_id="deal_execution",
    name="NorthSea Deal Execution Crew",
    studio_id="8c722284-b968-40d4-830f-aac179c21cfa",
    invariants=(
        "Does not sign, accept, or commit to documents.",
        "ORIGIN UNCONFIRMED if origin is not evidenced.",
        "Exactly one next_best_action.",
        "Canonical deal state arrives via NorthSeaService, never file_read.",
    ),
    agents=(
        AgentDef("deal_manager", "Deal Manager",
                 "Own and orchestrate one deal opportunity from SEARCH through CLOSE.",
                 tools=("canonical_state",)),
        AgentDef("buyer_qualification_agent", "Buyer Qualification Agent",
                 "Verify and score buyer readiness (max 20 pts) from source-supported evidence only.",
                 tools=("canonical_state",)),
        AgentDef("seller_qualification_agent", "Seller Qualification Agent",
                 "Verify and score seller readiness (max 20 pts); flag unverifiable items as blockers.",
                 tools=("canonical_state",)),
        AgentDef("commercial_alignment_agent", "Commercial Alignment Agent",
                 "Produce a deterministic GREEN/AMBER/RED gap matrix across eight commercial dimensions.",
                 tools=("canonical_state",)),
        AgentDef("trade_documentation_protection_agent", "Trade Documentation & Protection Agent",
                 "Score eight document categories COMPLETE/PARTIAL/MISSING. Does NOT sign or commit.",
                 tools=("canonical_state",)),
        AgentDef("logistics_execution_agent", "Logistics & Execution Agent",
                 "Assess logistics feasibility. If origin is unknown, report ORIGIN UNCONFIRMED.",
                 tools=("canonical_state",)),
        AgentDef("deal_risk_agent", "Deal Risk Agent",
                 "Identify execution risks and rate each LOW/MEDIUM/HIGH/CRITICAL.",
                 tools=("canonical_state",)),
        AgentDef("next_best_action_agent", "Next Best Action Agent",
                 "Synthesize upstream outputs into exactly ONE next best action.",
                 tools=("canonical_state",)),
    ),
    tasks=(
        TaskDef("deal_state_ingestion", "deal_manager",
                "Read canonical deal state from the NorthSea service/MCP boundary (not a file).",
                "Normalized deal_state object for all downstream agents."),
        TaskDef("buyer_qualification", "buyer_qualification_agent",
                "Qualify the buyer from canonical deal_state. Cap score at 10 if legal entity, authority, or payment is MISSING/FAILED.",
                "buyer_qualification with buyer_score 0–20."),
        TaskDef("seller_qualification", "seller_qualification_agent",
                "Qualify the seller from canonical deal_state. Cap score at 10 if principal/allocation/spec is MISSING/FAILED.",
                "seller_qualification with seller_score 0–20."),
        TaskDef("commercial_alignment_gap_matrix", "commercial_alignment_agent",
                "Eight-dimension GREEN/AMBER/RED gap matrix. Unconfirmed terms are RED/UNCONFIRMED.",
                "commercial_gaps report."),
        TaskDef("evidence_protection_assessment", "trade_documentation_protection_agent",
                "Score eight document/protection categories. NorthSea does not sign or commit.",
                "evidence_status."),
        TaskDef("logistics_execution_assessment", "logistics_execution_agent",
                "Logistics feasibility. ORIGIN UNCONFIRMED if not evidenced. Score cannot exceed 5 if origin unconfirmed.",
                "logistics_assessment with logistics_score 0–10."),
        TaskDef("deal_risk_assessment", "deal_risk_agent",
                "Nine-category risk scan. Rate flags LOW/MEDIUM/HIGH/CRITICAL.",
                "risk_flags list."),
        TaskDef("next_best_action_deal_output", "next_best_action_agent",
                "Sum readiness_score (max 100). One current_blocker. One next_best_action.",
                "Final structured deal output."),
    ),
)

INTELLIGENCE_OPERATIONS = CrewSpec(
    crew_id="intelligence_operations",
    name="NorthSea Intelligence & Operations",
    studio_id="55f038dc-8816-4641-9fb5-a58022ec2fab",
    invariants=(
        "Never grants, simulates, or assumes approval.",
        "Never mutates a deal on ambiguous communication.",
        "Document received is not document verified.",
        "Market data is context, never proof a party can deliver or buy.",
        "Does not execute chase tasks.",
    ),
    agents=(
        AgentDef("communications_intelligence_agent", "Communications Intelligence Agent",
                 "Structured intelligence on inbound/outbound communications.",
                 tools=("canonical_state",)),
        AgentDef("deal_watch_agent", "Deal Watch Agent",
                 "Detect stale deals, term drift, evidence gaps, SLA-style waiting, and blockers.",
                 tools=("canonical_state",)),
        AgentDef("task_chase_agent", "Task & Chase Agent",
                 "Translate blockers into a prioritized Chase List. Never execute tasks.",
                 tools=("canonical_state",)),
        AgentDef("market_intelligence_agent", "Market Intelligence Agent",
                 "Commodity/FX/freight context. Never treat market data as delivery proof.",
                 tools=("canonical_state", "mock_market")),
        AgentDef("document_intelligence_agent", "Document Intelligence Agent",
                 "Classify documents, extract fields, flag mismatches. Receipt ≠ verification.",
                 tools=("canonical_state",)),
        AgentDef("approval_coordinator", "Approval Coordinator",
                 "Create structured human approval requests. Never grant approval.",
                 tools=("canonical_state",)),
        AgentDef("operations_controller", "Operations Controller",
                 "Unified operational state for AXE Chase List / Global Trade Center.",
                 tools=("canonical_state",)),
        AgentDef("exception_audit_agent", "Exception & Audit Agent",
                 "Log operational exceptions with severity, category, and recommended resolution.",
                 tools=("canonical_state",)),
    ),
    tasks=(
        TaskDef("analyze_communications", "communications_intelligence_agent",
                "Analyze communications into classification, intent, urgency, risk. Never propose a deal mutation on ambiguous comms.",
                "communication_intelligence list."),
        TaskDef("monitor_deal_pipeline", "deal_watch_agent",
                "Review deals for staleness, term drift, evidence gaps, blockers. Never close or approve a deal step.",
                "deal-health report."),
        TaskDef("process_received_documents", "document_intelligence_agent",
                "Classify documents. verification_status is always PENDING, never VERIFIED.",
                "document_findings."),
        TaskDef("gather_market_context", "market_intelligence_agent",
                "Market context with sources. Context only, never delivery proof.",
                "market_context."),
        TaskDef("build_chase_list", "task_chase_agent",
                "Prioritized Chase List. Never execute tasks.",
                "tasks and chase_items."),
        TaskDef("generate_approval_requests", "approval_coordinator",
                "Structured approval requests only. Never grant or assume approval.",
                "approval_requests."),
        TaskDef("log_exceptions", "exception_audit_agent",
                "Exception log across the operational cycle.",
                "exceptions."),
        TaskDef("compile_operational_state", "operations_controller",
                "Single operational-state report. Synthesize; do not invent.",
                "unified operational state for AXE."),
    ),
)

COUNTERPARTY_SOURCING = CrewSpec(
    crew_id="counterparty_sourcing",
    name="NorthSea Counterparty Intelligence & Sourcing",
    studio_id="9679d3e8-7e66-4017-9970-b67b447cc679",
    invariants=(
        "No invented contacts or LC-acceptance claims.",
        "Export capability does not imply LC acceptance.",
        "Marketplace listing is not production.",
        "Protected counterparties are not disclosed.",
        "No outreach.",
        "Never upgrade self-published claims to independently verified.",
        "Never mark VERIFIED without a source.",
        "Live Exa is optional; tests use mock tools only.",
    ),
    agents=(
        AgentDef("sourcing_strategist", "Sourcing Strategist",
                 "Convert a transaction/blocker into a precise sourcing strategy. UNKNOWN stays UNKNOWN.",
                 tools=("canonical_state",)),
        AgentDef("buyer_hunter", "Buyer Hunter",
                 "Find real buyers with evidence of purchasing/import activity. Do not fabricate.",
                 tools=("exa_search", "scrape_website")),
        AgentDef("supplier_hunter", "Supplier Hunter",
                 "Find real producers/exporters. Export capability does NOT imply LC acceptance.",
                 tools=("exa_search", "scrape_website")),
        AgentDef("counterparty_verifier", "Counterparty Verifier",
                 "Independently verify candidates. Classify facts VERIFIED/SELF-CLAIMED/INFERRED/UNKNOWN/CONFLICTING.",
                 tools=("exa_search", "url_read")),
        AgentDef("commercial_fit_analyst", "Commercial Fit Analyst",
                 "0–100 fit score with critical-incompatibility override. Synthesis only.",
                 tools=("canonical_state",)),
        AgentDef("evidence_provenance_analyst", "Evidence & Provenance Analyst",
                 "Normalize evidence chains. Never upgrade self-published claims to independently verified.",
                 tools=("canonical_state",)),
        AgentDef("sourcing_supervisor", "Sourcing Supervisor",
                 "Deduplicate, reject, rank, assemble canonical JSON. Respect exclusions and protected counterparties.",
                 tools=("canonical_state",)),
    ),
    tasks=(
        TaskDef("sourcing_strategy_formulation", "sourcing_strategist",
                "Parse NorthSea sourcing inputs. UNKNOWN stays UNKNOWN.",
                "Commercially grounded sourcing strategy."),
        TaskDef("buyer_discovery", "buyer_hunter",
                "If direction is find_supplier, return empty list. Else search evidenced buyer candidates.",
                "Raw buyer candidate list with sources."),
        TaskDef("supplier_discovery", "supplier_hunter",
                "If direction is find_buyer, return empty list. Else search evidenced suppliers.",
                "Raw supplier candidate list with sources."),
        TaskDef("counterparty_verification", "counterparty_verifier",
                "Independently verify every candidate. Never fabricate emails from naming patterns.",
                "Enriched profiles with fact classifications and provenance."),
        TaskDef("commercial_fit_analysis", "commercial_fit_analyst",
                "Score 0–100. Critical incompatibility overrides score. UNKNOWN payment = partial score only.",
                "Fit assessments with qualification questions."),
        TaskDef("evidence_normalization", "evidence_provenance_analyst",
                "Final evidence quality gate before canonical output.",
                "Normalized evidence set."),
        TaskDef("sourcing_supervision_canonical_output", "sourcing_supervisor",
                "Deduplicate, reject, rank Priority A/B/C, assemble canonical JSON. Do not disclose protected counterparties.",
                "Single valid structured sourcing result."),
    ),
)

CREW_SPECS: dict[str, CrewSpec] = {
    DEAL_EXECUTION.crew_id: DEAL_EXECUTION,
    INTELLIGENCE_OPERATIONS.crew_id: INTELLIGENCE_OPERATIONS,
    COUNTERPARTY_SOURCING.crew_id: COUNTERPARTY_SOURCING,
}

# Router → volledige specialist-crew. Intelligence en Operations delen dezelfde 8-agent crew.
SPECIALIST_FOR_ROUTE: dict[str, str] = {
    "discovery_run": "counterparty_sourcing",
    "deal_run": "deal_execution",
    "intelligence_run": "intelligence_operations",
    "operations_run": "intelligence_operations",
}

CREW_DISPLAY_NAME: dict[str, str] = {
    "discovery_run": COUNTERPARTY_SOURCING.name,
    "deal_run": DEAL_EXECUTION.name,
    "intelligence_run": INTELLIGENCE_OPERATIONS.name,
    "operations_run": INTELLIGENCE_OPERATIONS.name,
}


def specialist_id_for_route(route: str) -> str | None:
    return SPECIALIST_FOR_ROUTE.get(route)


def specialist_agent_count(route: str) -> int:
    cid = SPECIALIST_FOR_ROUTE.get(route)
    if not cid:
        return 0
    return len(CREW_SPECS[cid].agents)


def yaml_top_keys(text: str) -> list[str]:
    """Haal top-level YAML keys eruit zonder PyYAML (test-sync)."""
    keys: list[str] = []
    for line in text.splitlines():
        if not line or line.startswith(" ") or line.startswith("\t") or line.startswith("#"):
            continue
        if line.startswith("- "):
            continue
        if ":" in line:
            keys.append(line.split(":", 1)[0].strip())
    return keys
