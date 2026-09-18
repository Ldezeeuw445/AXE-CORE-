"""Deterministische master-orchestratie voor de NorthSea-workforce.

## Waarom deze laag bestaat

Codex bewees dat de CrewAI Studio-flow faalde op een *serialisatie/grens*-probleem,
niet op NorthSea-validatiesemantiek: de validator gaf `valid: true`, maar de
validation-gate las het resultaat op de verkeerde plek (`json_dict` i.p.v. `raw`).
Productie-veiligheid mag niet hangen aan ongedocumenteerd Studio-gedrag.

Daarom bezit deze module de grens deterministisch, in getypte Python:

    EVENT
      ↓  validate_event()        — getypt, faalt gesloten bij twijfel
    DETERMINISTISCHE VALIDATIE
      ↓  policy_gate()           — permissie + budget + approval, hergebruikt policy.py
    POLICY / PERMISSION / BUDGET
      ↓  route_for_event()
    ROUTER → {DISCOVERY, OPERATIONS, INTELLIGENCE}
      ↓  CrewGateway.run()       — de crews redeneren; ze beslissen niets over veiligheid
    GETYPTE OUTPUT (CrewRunInfo)

De LLM-crews doen onderzoek/analyse. Ze beslissen NIET over authenticatie,
permissies, DNC, approval-plicht of schema-geldigheid — dat doet deze code.
Malformed of dubbelzinnige invoer faalt gesloten (geen crew draait).
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from .crew import CREW_FOR_ROUTE, ROLES_FOR_ROUTE, SHORT_NAME
from .models import CrewRunInfo
from .policy import TOOLS

# ── Routing: EVENT_TYPE → crew-route → concrete gateway-actie ────────────────
#
# De drie toegewijde crews (Discovery / Operations / Intelligence). De bestaande
# gateway kent vier routes (deal_run is de kwalificatie-arm van Operations); we
# mappen elk canoniek event-type expliciet, nooit door te raden.
Route = Literal["discovery_run", "deal_run", "intelligence_run", "operations_run"]

EVENT_TYPE_TO_ACTION: dict[str, str] = {
    # DISCOVERY
    "new_signal": "find_buyers",
    "buyer_signal": "find_buyers",
    "supplier_signal": "find_suppliers",
    "research_counterparty": "research_counterparty",
    "assess_match": "assess_match",
    # OPERATIONS (kwalificatie + voortgang)
    "opportunity_qualification": "qualify_opportunity",
    "qualify_opportunity": "qualify_opportunity",
    "investigate_blockers": "investigate_blockers",
    "get_next_actions": "get_next_actions",
    "review_deal": "review_deal",
    "process_reply": "process_reply",
    "prepare_outreach": "prepare_outreach",
    "stale_deal": "stale_deal",
    "provider_failure": "provider_failure",
    # INTELLIGENCE
    "market_signal": "market_signal",
    "counterparty_intelligence": "research_counterparty",
    "evidence_request": "market_signal",
}

# Actie → route (moet overeenkomen met crew.ROUTE_FOR_ACTION; hier expliciet zodat
# de orchestrator los testbaar is en één canonieke bron blijft).
_ACTION_TO_ROUTE: dict[str, Route] = {
    "research_counterparty": "discovery_run", "find_suppliers": "discovery_run",
    "find_buyers": "discovery_run", "assess_match": "discovery_run",
    "qualify_opportunity": "deal_run", "investigate_blockers": "deal_run",
    "prepare_outreach": "deal_run", "process_reply": "deal_run",
    "review_deal": "deal_run", "get_next_actions": "deal_run",
    "market_signal": "intelligence_run",
    "stale_deal": "operations_run", "provider_failure": "operations_run",
}

# Welke event-types naar welke crew-familie leiden (voor rapportage/tests).
# deal_run is de Deal Execution-crew (8), niet de nested 3-agent Studio-copy.
# operations_run en intelligence_run delen dezelfde Intelligence & Operations-crew (8).
CREW_FAMILY: dict[Route, str] = {
    "discovery_run": "discovery", "deal_run": "deal",
    "operations_run": "operations", "intelligence_run": "intelligence",
}

UNROUTABLE_TYPES: frozenset[str] = frozenset({"unroutable", "unknown_intent", "no_specialist"})

# Actie → benodigde scopes. Afgeleid van de bestaande tool-policy waar er een
# 1-op-1 tool is; anders de minimale leesscope voor die crew-arm.
_ACTION_TOOL: dict[str, str] = {
    "research_counterparty": "northsea_research_counterparty",
    "find_suppliers": "northsea_find_suppliers",
    "find_buyers": "northsea_find_buyers",
    "assess_match": "northsea_assess_match",
    "qualify_opportunity": "northsea_qualify_opportunity",
    "investigate_blockers": "northsea_investigate_blockers",
    "get_next_actions": "northsea_get_next_actions",
    "review_deal": "northsea_review_deal",
    "process_reply": "northsea_process_reply",
    "prepare_outreach": "northsea_prepare_outreach",
}
# Voor routes zonder eigen MCP-tool (market_signal, stale_deal, provider_failure):
# minimaal lezen van de dealstaat.
_DEFAULT_ACTION_SCOPES: tuple[str, ...] = ("northsea.deal.read",)


def required_scopes_for_action(action: str) -> tuple[str, ...]:
    tool = _ACTION_TOOL.get(action)
    if tool and tool in TOOLS:
        return TOOLS[tool].scopes
    return _DEFAULT_ACTION_SCOPES


# ── Approval: welke event-types/payloads NIET autonoom mogen draaien ────────
#
# Sectie 5 van de opdracht: beschermde identiteit, introductie, bindende termen,
# SPA/NCNDA/IMFPA, fee/commissie, exclusiviteit, bankinstructies. Op event-niveau
# vangen we dat via de expliciete approval_policy én een payload-vlag.
APPROVAL_REQUIRED_TYPES: frozenset[str] = frozenset({
    "controlled_introduction", "binding_terms", "spa_acceptance",
    "ncnda_commitment", "imfpa_commitment", "fee_agreement",
    "exclusivity", "banking_change", "protected_identity_disclosure",
})


class ApprovalPolicy(str, Enum):
    NONE = "none"
    REQUIRED = "required"          # deze actie moet altijd langs Luka
    AUTO_IF_SAFE = "auto_if_safe"  # mag autonoom, mits geen gevoelige payload


class Priority(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


def _to_bool(v: Any) -> bool:
    """Normaliseer één keer aan de grens. Studio levert soms de string "true".
    Alles wat niet eenduidig waar/onwaar is, faalt gesloten (ValueError)."""
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("true", "1", "yes"):
            return True
        if s in ("false", "0", "no", ""):
            return False
    if v is None:
        return False
    raise ValueError(f"ambiguous boolean: {v!r}")


class BudgetEnvelope(BaseModel):
    """Wat deze run mag verbruiken. Een lege/uitgeputte envelope faalt gesloten
    op de gate, niet in de crew."""
    model_config = {"extra": "forbid"}
    research_calls: int = 0
    premium_calls: int = 0
    max_seconds: int = 170
    usd: float | None = None

    @field_validator("research_calls", "premium_calls", "max_seconds", mode="before")
    @classmethod
    def _non_negative_int(cls, v: Any) -> int:
        i = int(v)
        if i < 0:
            raise ValueError("budget values must be >= 0")
        return i


class NorthSeaEvent(BaseModel):
    """Het canonieke event-contract. Interne booleans zijn ECHTE booleans; externe
    rariteit (string "true") wordt hier één keer genormaliseerd. Onbekende extra
    velden worden geweigerd — dubbelzinnige invoer faalt gesloten."""
    model_config = {"extra": "forbid"}

    event_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    event_type: str = Field(min_length=1)
    source: str = Field(min_length=1)
    priority: Priority = Priority.P2
    entity_ids: list[str] = Field(default_factory=list)
    budget_envelope: BudgetEnvelope = Field(default_factory=BudgetEnvelope)
    allowed_tools: list[str] = Field(default_factory=list)
    retry_policy: dict[str, Any] = Field(default_factory=dict)
    approval_policy: ApprovalPolicy = ApprovalPolicy.AUTO_IF_SAFE
    requesting_principal: str = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_type")
    @classmethod
    def _known_event_type(cls, v: str) -> str:
        if v in UNROUTABLE_TYPES:
            return v
        if v not in EVENT_TYPE_TO_ACTION:
            raise ValueError(f"unknown event_type: {v!r}")
        return v

    @property
    def action(self) -> str:
        if self.event_type in UNROUTABLE_TYPES:
            return "unroutable"
        return EVENT_TYPE_TO_ACTION[self.event_type]

    @property
    def route(self) -> Route | Literal["unroutable"]:
        if self.event_type in UNROUTABLE_TYPES:
            return "unroutable"
        return _ACTION_TO_ROUTE[self.action]


# ── Uitkomsten ───────────────────────────────────────────────────────────────
class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    event_type: str | None = None
    priority: str | None = None


class GateDecision(BaseModel):
    allowed: bool
    code: str                       # "ok" | "insufficient_scope" | "budget_exhausted" | "unknown_event_type" | "approval_required"
    reason: str | None = None
    missing_scopes: list[str] = Field(default_factory=list)
    approval_required: bool = False
    approval_kind: str | None = None


class OrchestrationResult(BaseModel):
    """Wat de orchestrator teruggeeft. `crew` is alleen gezet als een crew echt draaide."""
    status: Literal["ok", "schema_invalid", "policy_denied", "approval_required", "crew_unavailable", "crew_error", "unroutable"]
    event_id: str | None = None
    run_id: str | None = None
    route: str | None = None
    crew_family: str | None = None
    validation: ValidationResult
    gate: GateDecision | None = None
    crew: CrewRunInfo | None = None
    reason: str | None = None


# ── De drie deterministische boundaries ──────────────────────────────────────
def validate_event(raw: dict[str, Any]) -> tuple[NorthSeaEvent | None, ValidationResult]:
    """DETERMINISTISCHE VALIDATIE. Faalt gesloten: bij twijfel geen event."""
    if not isinstance(raw, dict):
        return None, ValidationResult(valid=False, errors=["event payload is not an object"])
    data = dict(raw)
    # Normaliseer bekende boolean-velden in de payload één keer aan de grens.
    payload = data.get("payload")
    if isinstance(payload, dict):
        norm = dict(payload)
        for k in ("requires_approval", "sensitive_action", "verified"):
            if k in norm:
                try:
                    norm[k] = _to_bool(norm[k])
                except ValueError as e:
                    return None, ValidationResult(valid=False, errors=[f"payload.{k}: {e}"])
        data["payload"] = norm
    try:
        event = NorthSeaEvent.model_validate(data)
    except ValidationError as e:
        errs = [f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors()]
        return None, ValidationResult(valid=False, errors=errs)
    return event, ValidationResult(valid=True, event_type=event.event_type, priority=event.priority.value)


def _needs_approval(event: NorthSeaEvent) -> tuple[bool, str | None]:
    if event.approval_policy is ApprovalPolicy.REQUIRED:
        return True, "policy_required"
    if event.event_type in APPROVAL_REQUIRED_TYPES:
        return True, event.event_type
    p = event.payload
    if isinstance(p, dict) and (p.get("requires_approval") is True or p.get("sensitive_action") is True):
        return True, "sensitive_payload"
    return False, None


def policy_gate(event: NorthSeaEvent, granted_scopes: set[str] | frozenset[str]) -> GateDecision:
    """POLICY / PERMISSION / BUDGET. De crew draait alleen als dit `allowed=True`
    teruggeeft en er geen approval nodig is."""
    # 1. Permissie: heeft de aanvrager de scopes die deze crew-arm nodig heeft?
    needed = required_scopes_for_action(event.action)
    missing = [s for s in needed if s not in granted_scopes]
    if missing:
        return GateDecision(allowed=False, code="insufficient_scope",
                            reason=f"requires scope(s): {', '.join(missing)}", missing_scopes=missing)
    # 2. Budget: research/premium-calls moeten binnen de envelope passen.
    b = event.budget_envelope
    action_is_research = required_scopes_for_action(event.action) and "northsea.research" in needed
    if action_is_research and b.research_calls <= 0 and b.premium_calls <= 0:
        return GateDecision(allowed=False, code="budget_exhausted",
                            reason="research action but the budget envelope has no research/premium calls")
    if b.max_seconds <= 0:
        return GateDecision(allowed=False, code="budget_exhausted", reason="no time budget left")
    # Synthetische/test-vraag wordt nooit live sourcing of outreach.
    p = event.payload if isinstance(event.payload, dict) else {}
    if p.get("is_synthetic") or p.get("internal_testcase") or p.get("synthetic"):
        if event.route == "discovery_run" or event.action in ("prepare_outreach", "find_buyers", "find_suppliers", "research_counterparty"):
            return GateDecision(allowed=False, code="synthetic_isolated",
                                reason="synthetic/test demand never becomes live sourcing or outreach")
    # 3. Approval: gevoelige/bindende handelingen draaien niet autonoom.
    need_appr, kind = _needs_approval(event)
    if need_appr:
        return GateDecision(allowed=False, code="approval_required", approval_required=True,
                            approval_kind=kind, reason=f"human approval required ({kind})")
    return GateDecision(allowed=True, code="ok")


def route_for_event(event: NorthSeaEvent) -> str:
    """Dunne deterministische router. Geen nested mini-crews, geen tweede intelligence-laag."""
    return event.route


async def handle_event(raw: dict[str, Any], gateway: Any, granted_scopes: set[str] | frozenset[str]) -> OrchestrationResult:
    """De master-orchestrator. Één weg naar binnen; elke grens faalt gesloten.

    `gateway` is een CrewGateway (of een fake in tests) met
    `async run(action, handoff) -> CrewRunInfo`.
    """
    event, val = validate_event(raw)
    if not event:
        return OrchestrationResult(status="schema_invalid", validation=val,
                                   reason="event failed deterministic validation; no crew executed")

    if event.route == "unroutable":
        return OrchestrationResult(
            status="unroutable", event_id=event.event_id, run_id=event.run_id, route="unroutable",
            crew_family=None, validation=val,
            reason="event is unroutable; no specialist crew executed",
        )

    gate = policy_gate(event, granted_scopes)
    base = dict(event_id=event.event_id, run_id=event.run_id, route=event.route,
                crew_family=CREW_FAMILY[event.route], validation=val, gate=gate)
    if gate.code == "approval_required":
        return OrchestrationResult(status="approval_required",
                                   reason=gate.reason, **base)
    if not gate.allowed:
        return OrchestrationResult(status="policy_denied", reason=gate.reason, **base)

    # ROUTER → volledige specialist-crew. De crew krijgt de handoff; hij beslist niets over veiligheid.
    handoff = {
        "event_id": event.event_id, "run_id": event.run_id, "event_type": event.event_type,
        "priority": event.priority.value, "entity_ids": event.entity_ids,
        "roles": ROLES_FOR_ROUTE.get(event.route, []), "crew": CREW_FOR_ROUTE.get(event.route),
        "payload": event.payload, "action": event.action,
    }
    crew: CrewRunInfo = await gateway.run(event.action, handoff)
    if crew.status == "ok" and event.route == "discovery_run" and event.payload.get("handoff_to_deal") is True:
        deal_handoff = dict(handoff, roles=ROLES_FOR_ROUTE["deal_run"], crew=CREW_FOR_ROUTE["deal_run"])
        deal_crew: CrewRunInfo = await gateway.run("qualify_opportunity", deal_handoff)
        if deal_crew.status == "ok":
            return OrchestrationResult(status="ok", crew=deal_crew, route="deal_run",
                                       crew_family="deal", event_id=event.event_id, run_id=event.run_id,
                                       validation=val, gate=gate,
                                       reason="optional Discovery→Deal handoff")
        return OrchestrationResult(status="crew_error" if deal_crew.status not in ("unavailable", "timeout", "busy") else "crew_unavailable",
                                   crew=deal_crew, reason=deal_crew.reason, **base)
    if crew.status == "ok":
        return OrchestrationResult(status="ok", crew=crew, **base)
    if crew.status in ("unavailable", "timeout", "busy"):
        return OrchestrationResult(status="crew_unavailable", crew=crew, reason=crew.reason, **base)
    return OrchestrationResult(status="crew_error", crew=crew, reason=crew.reason, **base)
