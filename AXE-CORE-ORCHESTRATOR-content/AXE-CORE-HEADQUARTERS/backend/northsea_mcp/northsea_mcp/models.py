"""De vorm van elk antwoord. Pydantic, zodat de MCP-server er het outputSchema uit
afleidt en een client (ChatGPT) gestructureerde data krijgt in plaats van proza.

Gemeenschappelijke velden volgen crewai/OUTPUT_SCHEMAS.md van de NorthSea-pack:
run_id, entity_ids, claims met bronnen, blockers, aanbevelingen.

Twee regels die in elk model terugkomen:
- Een claim uit een openbare bron is `unverified` tot iemand hem verifieert
  (POLICIES.md). Deze server zet nooit zelf iets op `verified`.
- Identiteiten zijn standaard gemaskeerd; `identity_disclosed` zegt of dat zo is.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

VerificationState = Literal["verified", "unverified", "reviewing", "rejected", "contradicted", "unknown"]
Priority = Literal["P0", "P1", "P2", "P3"]
Depth = Literal["standard", "deep"]
ResearchStatus = Literal["completed", "partial", "budget_exhausted", "not_configured", "provider_error", "skipped"]


class SourceRef(BaseModel):
    url: str
    title: str | None = None
    provider: str | None = None
    cited: bool = False


class Claim(BaseModel):
    field: str
    value: Any
    state: VerificationState = "unverified"
    basis: str = Field(description="Where this claim comes from: a database field, a source, or a research answer.")
    sources: list[SourceRef] = Field(default_factory=list)


class PartyView(BaseModel):
    """Een tegenpartij zoals deze aanroeper hem mag zien."""
    counterparty_id: str | None
    role: Literal["buyer", "supplier", "counterparty"]
    descriptor: str = Field(description="Display-safe description; never contains the company or person name when redacted.")
    country: str | None = None
    verification_state: VerificationState = "unknown"
    verification_score: int | None = None
    identity_disclosed: bool = False
    company_name: str | None = None
    website: str | None = None
    contacts: list[dict[str, Any]] = Field(default_factory=list)


class Blocker(BaseModel):
    code: str
    description: str
    researchable: bool = False
    source: str = Field(description="What raised it: opportunity.primary_blocker, gate, match, email_intelligence, task, readiness.")


class RankedAction(BaseModel):
    rank: int
    title: str
    why: str
    impact: Literal["high", "medium", "low"]
    urgency: Literal["overdue", "now", "soon", "later"]
    risk: Literal["low", "medium", "high"]
    requires_approval: bool
    depends_on: list[str] = Field(default_factory=list)
    owner: str = "axe"
    source: str


class ResearchRun(BaseModel):
    status: ResearchStatus
    provider: str | None = None
    calls_made: int = 0
    cost_usd: float = 0.0
    message: str | None = None


class CrewRunInfo(BaseModel):
    """Het getypte crew-resultaat (CrewRunResult). Nieuwe velden zijn optioneel met een
    standaardwaarde: bestaande clients blijven werken, en elke run is herleidbaar
    (welke crew gevraagd, welke backend, fallback ja/nee en waarom)."""
    used: bool = False
    crew: str | None = None
    run_id: str | None = None
    status: str | None = None
    analysis: str | None = Field(default=None, description="Unverified CrewAI analysis text; never treated as fact.")
    reason: str | None = None
    route: str | None = Field(default=None, description="discovery_run, deal_run, intelligence_run or operations_run.")
    requested_crew: str | None = None
    backend: Literal["northsea_crewai", "northsea_local", "axe_general_crew"] | None = Field(
        default=None, description="northsea_local = in-process specialist crews; northsea_crewai = optional Studio AMP; axe_general_crew = fallback.")
    actual_crew: str | None = None
    fallback_used: bool = False
    fallback_reason: str | None = None
    models: list[str] = Field(default_factory=list)
    skills: list[dict[str, Any]] = Field(default_factory=list, description="Skill names with versions.")
    tools: list[str] = Field(default_factory=list, description="Tools and providers used.")
    budget_usage: dict[str, Any] = Field(default_factory=dict)
    timings: dict[str, float] = Field(default_factory=dict)
    validation: Literal["valid", "invalid", "not_validated"] = "not_validated"
    attempts: list[dict[str, Any]] = Field(default_factory=list, description="Every backend attempt, in order.")


CrewRunResult = CrewRunInfo


# ── Tools ────────────────────────────────────────────────────────────────────

class CounterpartyResearch(BaseModel):
    run_id: str
    objective: str
    counterparty: PartyView
    findings: str = Field(description="Research answer text. Unverified; identities redacted unless disclosed.")
    claims: list[Claim]
    sources: list[SourceRef]
    verification_state: VerificationState
    open_questions: list[str]
    blockers: list[Blocker]
    recommended_actions: list[str]
    research: ResearchRun
    crew: CrewRunInfo


class CandidateView(BaseModel):
    descriptor: str
    name: str | None = Field(default=None, description="Only present with northsea.identity.")
    website: str | None = Field(default=None, description="Only present with northsea.identity.")
    source_url: str | None = Field(default=None, description="Only present with northsea.identity.")
    source_type: Literal["database_offer", "database_requirement", "web_search"]
    existing_entity_id: str | None = None
    preliminary_score: int
    score_basis: str
    fit_reasons: list[str]
    verification_gaps: list[str]
    verification_state: VerificationState = "unverified"


class DedupeSummary(BaseModel):
    found: int
    duplicates_removed: int
    already_in_database: int
    new_candidates: int


class CandidateSearch(BaseModel):
    run_id: str
    anchor_id: str
    anchor: dict[str, Any]
    candidates: list[CandidateView]
    dedupe: DedupeSummary
    verification_gaps: list[str]
    persisted: bool = Field(default=False, description="Candidates are returned, not written to the database.")
    research: ResearchRun


class MatchAssessmentResult(BaseModel):
    buyer_requirement_id: str
    supplier_offer_id: str
    commercial_fit_score: int
    transaction_readiness_score: int
    meets_match_threshold: bool
    matching_fields: list[dict[str, Any]]
    conflicts: list[dict[str, Any]]
    unknowns: list[str]
    blockers: list[Blocker]
    recommended_next_actions: list[str]
    existing_assessment: dict[str, Any] | None
    existing_opportunity_id: str | None
    method: str


class GateState(BaseModel):
    gate: str
    passed: bool
    evidence_count: int
    basis: str


class QualificationResult(BaseModel):
    opportunity_id: str
    stage: str | None
    gates: list[GateState]
    evidence_state: dict[str, int]
    blockers: list[Blocker]
    next_actions: list[RankedAction]
    task_recommendations: list[dict[str, Any]]
    communication_recommendations: list[dict[str, Any]]
    crew: CrewRunInfo


class BlockerInvestigation(BaseModel):
    run_id: str
    opportunity_id: str
    investigated: list[str]
    resolved: list[dict[str, Any]] = Field(description="Blockers already resolved by existing verified data. Research never marks a blocker resolved on its own.")
    unresolved: list[dict[str, Any]]
    new_evidence: list[Claim]
    sources: list[SourceRef]
    recommended_next_actions: list[str]
    research: ResearchRun
    crew: CrewRunInfo


class OutreachDraft(BaseModel):
    objective: str
    channel: Literal["email", "phone", "linkedin", "whatsapp"]
    template: str
    recipient: PartyView
    to_email: str | None = Field(default=None, description="Only present with northsea.identity.")
    subject: str
    body: str
    facts_used: list[Claim]
    unknowns: list[str]
    sensitive: bool
    approval_required: bool = True
    sent: bool = False
    saved_draft_id: str | None = None
    saved_status: str | None = None
    notes: list[str]


class ReplyAnalysis(BaseModel):
    communication_id: str
    channel: str | None
    direction: str | None
    classification: str
    analysis_source: Literal["email_intelligence", "call_intelligence", "derived"]
    counterparty: PartyView | None
    facts: list[Claim]
    questions: list[str]
    changed_terms: list[dict[str, Any]]
    blockers: list[Blocker]
    red_flags: list[str]
    recommended_reply: dict[str, Any] | None
    recommended_tasks: list[dict[str, Any]]
    requires_human_approval: bool


class DealReview(BaseModel):
    opportunity_id: str
    code: str | None
    stage: str | None
    execution_state: str | None
    qualification_status: str | None
    product: str | None
    buyer: PartyView
    seller: PartyView
    buyer_requirement: dict[str, Any]
    supplier_offer: dict[str, Any]
    gates: list[GateState]
    commercial_fit_score: int
    transaction_readiness_score: int
    commission_protection: str | None
    latest_communications: list[dict[str, Any]]
    open_blockers: list[Blocker]
    evidence: list[dict[str, Any]]
    tasks: list[dict[str, Any]]
    deadlines: list[dict[str, Any]]
    next_best_actions: list[RankedAction]
    approval_required: bool
    updated_at: str | None


class NextActions(BaseModel):
    opportunity_id: str
    actions: list[RankedAction]
    ranking: str


class TaskResult(BaseModel):
    task_id: str
    opportunity_id: str | None
    status: str
    title: str
    created: bool
    duplicate_of_existing: bool = False
    updated_at: str | None = None


class DraftApprovalResult(BaseModel):
    draft_id: str
    approval_status: str
    approved_at: str | None
    sensitive: bool
    message: str


class SendResult(BaseModel):
    draft_id: str
    submitted: bool
    duplicate: bool
    communication_id: str | None
    provider_message_id: str | None
    message: str
