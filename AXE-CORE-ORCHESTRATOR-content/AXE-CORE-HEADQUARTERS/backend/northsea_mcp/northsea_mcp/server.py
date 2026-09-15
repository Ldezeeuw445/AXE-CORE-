"""De MCP-server: dunne handlers rond NorthSeaService.

Elke tool doet precies dit, in `Guard.run`:
1. wie ben je (token uit de SDK-authcontext), mag je dit (scopes, policy.TOOLS);
2. binnen de limiet (per principal en risicoklasse, glijdend venster);
3. voor schrijfacties: idempotentiesleutel -- een herhaalde aanroep geeft het
   eerste resultaat terug in plaats van nog een taak, draft of e-mail;
4. de service aanroepen met een timeout;
5. een veilige fout (stabiele code, geen stacktrace, geen query) of het
   gestructureerde resultaat;
6. audit naar core_audit_log, ook bij weigering en fout.

Wat NIET in een handler staat: bedrijfslogica. Die zit in service.py.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

import httpx
from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl, BaseModel, Field
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse, Response

from . import __version__
from .audit import Auditor
from .config import Settings
from .crew import CrewGateway
from .models import (
    BlockerInvestigation, CandidateSearch, CounterpartyResearch, DealReview, DraftApprovalResult, MatchAssessmentResult,
    NextActions, OutreachDraft, QualificationResult, ReplyAnalysis, SendResult, TaskResult,
)
from .oauth import NorthSeaTokenVerifier, OAuthServer, client_ip
from .policy import SCOPES, TOOLS, PolicyDenied, Risk, require_scopes
from .repository import InvalidId, RepositoryError, SupabaseRepository
from .research import ResearchError, ResearchGateway
from .service import Caller, NorthSeaService, NotFound, ServiceError
from .store import Store

log = logging.getLogger("northsea_mcp")

RATE_LIMITS: dict[Risk, list[tuple[int, int]]] = {
    Risk.READ_ONLY: [(60, 120), (3600, 2000)],
    Risk.RESEARCH: [(60, 4), (3600, 30), (86400, 120)],
    Risk.DRAFT: [(3600, 40)],
    Risk.LOW_RISK_WRITE: [(3600, 60)],
    Risk.HIGH_IMPACT_WRITE: [(3600, 5), (86400, 20)],
}
TIMEOUTS: dict[Risk, float] = {Risk.READ_ONLY: 30, Risk.RESEARCH: 175, Risk.DRAFT: 45,
                               Risk.LOW_RISK_WRITE: 30, Risk.HIGH_IMPACT_WRITE: 90}
# depth="deep" wacht op een CrewAI-run (crew.py: 170 s). Zonder eigen grens kreeg
# qualify_opportunity (READ_ONLY, 30 s) een timeout vóór de crew klaar kon zijn.
# 190 s blijft onder nginx' proxy_read_timeout van 200 s.
DEEP_TIMEOUT = 190.0


class ToolFailure(ToolError):
    """Wat een client te zien krijgt: `code: message`. Niets meer.

    Een ToolError en geen gewone Exception: de SDK geeft dan precies deze tekst
    door als tool-fout, in plaats van hem in te pakken."""


def _args_hash(args: dict) -> str:
    return hashlib.sha256(json.dumps(args, sort_keys=True, default=str).encode()).hexdigest()


class Guard:
    def __init__(self, store: Store, auditor: Auditor):
        self.store = store
        self.auditor = auditor

    async def run(self, tool: str, entity_ids: dict[str, Any], call: Callable[[Caller], Awaitable[BaseModel]],
                  result_type: type[BaseModel], *, idempotency_key: str | None = None, args: dict | None = None,
                  timeout: float | None = None) -> BaseModel:
        beleid = TOOLS[tool]
        token = get_access_token()
        request_id = str(uuid.uuid4())
        t0 = time.monotonic()
        details: dict[str, Any] = {"request_id": request_id, "tool": tool, "risk": beleid.risk.value,
                                   "entity_ids": {k: v for k, v in entity_ids.items() if v}, "decision": "allowed",
                                   "approval_state": "required" if beleid.risk == Risk.HIGH_IMPACT_WRITE else "not_required"}
        principal = "anonymous"
        idem_open = False
        try:
            if token is None:
                raise PolicyDenied("unauthorized", "Authentication required.")
            caller = Caller(principal=token.subject or token.client_id, client_id=token.client_id, scopes=frozenset(token.scopes))
            principal = caller.principal
            details["client_id"] = caller.client_id
            require_scopes(tool, caller.scopes)
            for venster, limiet in RATE_LIMITS[beleid.risk]:
                ok, rest, wacht = self.store.hit(f"{principal}:{beleid.risk.value}:{venster}", venster, limiet)
                if not ok:
                    details["rate"] = {"window_s": venster, "limit": limiet}
                    raise PolicyDenied("rate_limited", f"Rate limit reached for {beleid.risk.value} tools; retry in {int(wacht) + 1}s.")
            if beleid.needs_idempotency_key:
                if not idempotency_key or not (8 <= len(idempotency_key) <= 128):
                    raise PolicyDenied("idempotency_key_required", "Provide an idempotency_key (8-128 characters) so a retry cannot repeat this action.")
                staat, eerder = self.store.idem_begin(principal, tool, idempotency_key, _args_hash(args or {}))
                if staat == "done":
                    details["idempotent_replay"] = True
                    return result_type.model_validate(eerder)
                if staat == "conflict":
                    raise PolicyDenied("idempotency_conflict", "This idempotency_key was already used with different arguments.")
                if staat == "running":
                    raise PolicyDenied("in_progress", "An identical request is still running.")
                idem_open = True
            result = await asyncio.wait_for(call(caller), timeout=timeout or TIMEOUTS[beleid.risk])
            if idem_open:
                self.store.idem_finish(principal, tool, idempotency_key or "", result.model_dump(mode="json"))
                idem_open = False
            data = result.model_dump(mode="json")
            for sleutel in ("run_id",):
                if data.get(sleutel):
                    details["northsea_run_id"] = data[sleutel]
            crew = data.get("crew") or {}
            if isinstance(crew, dict) and crew.get("used"):
                details["crewai_run_id"] = crew.get("run_id")
                details["crewai_status"] = crew.get("status")
            research = data.get("research") or {}
            if isinstance(research, dict) and research.get("provider"):
                details["research"] = {k: research.get(k) for k in ("status", "provider", "calls_made", "cost_usd")}
            if beleid.risk in (Risk.LOW_RISK_WRITE, Risk.HIGH_IMPACT_WRITE) or data.get("saved_draft_id"):
                details["mutations"] = {k: data.get(k) for k in ("task_id", "draft_id", "saved_draft_id", "communication_id",
                                                                   "created", "submitted", "duplicate", "approval_status") if k in data}
            details["result_class"] = "ok"
            return result
        except PolicyDenied as e:
            details.update(decision="denied", result_class="policy_denied", error_code=e.code)
            raise ToolFailure(f"{e.code}: {e.message}") from None
        except NotFound as e:
            details.update(result_class="not_found", error_code="not_found")
            raise ToolFailure(f"not_found: {e.what} not found") from None
        except InvalidId as e:
            details.update(result_class="invalid_input", error_code="invalid_input")
            raise ToolFailure(f"invalid_input: {e}") from None
        except ServiceError as e:
            details.update(result_class="service_error", error_code=e.code)
            raise ToolFailure(f"{e.code}: {e.message}") from None
        except ResearchError as e:
            details.update(result_class="research_error", error_code=e.status)
            raise ToolFailure(f"{e.status}: {e.message}") from None
        except RepositoryError:
            details.update(result_class="upstream_error", error_code="database_error")
            raise ToolFailure(f"upstream_error: the NorthSea database request failed (request {request_id}).") from None
        except asyncio.TimeoutError:
            details.update(result_class="timeout", error_code="timeout")
            raise ToolFailure(f"timeout: the operation took too long (request {request_id}).") from None
        except ToolFailure:
            raise
        except Exception:  # noqa: BLE001
            log.exception("interne fout in %s (request %s)", tool, request_id)
            details.update(result_class="internal_error", error_code="internal_error")
            raise ToolFailure(f"internal_error: unexpected server error (request {request_id}).") from None
        finally:
            if idem_open:
                self.store.idem_abort(principal, tool, idempotency_key or "")
            details["duration_ms"] = int((time.monotonic() - t0) * 1000)
            ids = [str(v) for v in entity_ids.values() if v]
            await self.auditor.record(tool=tool, resource="northsea/" + ("/".join(ids) if ids else "-"), principal=principal,
                                      ip=None, details=details)


# ── Beschrijvingen: wanneer wel, wanneer niet, wat nodig is, bijwerkingen ──────
UUID_DESC = "UUID from the NorthSea database."
PRIO = Annotated[Literal["P0", "P1", "P2", "P3"], Field(description="P0 live blocker (premium research allowed), P1 high value, P2 normal (default), P3 background.")]
DEPTH = Annotated[Literal["standard", "deep"], Field(description="standard = deterministic + research only. deep = also run a bounded CrewAI analysis (slower, unverified output).")]
# Op moduleniveau en niet in register_tools: met `from __future__ import annotations`
# evalueert de SDK de annotaties als tekst tegen de module, en lokale aliassen
# bestaan daar niet (InvalidSignature).
Id = Annotated[str, Field(description=UUID_DESC, min_length=36, max_length=36)]
Key = Annotated[str, Field(description="Idempotency key (8-128 chars). Reuse the SAME key when retrying the same action.", min_length=8, max_length=128)]

DESCRIPTIONS = {
    "northsea_review_deal": (
        "Return the complete current operational state of ONE NorthSea deal (opportunity): stage, buyer and seller gate status, "
        "commercial fit and transaction readiness scores, latest communications, open blockers, evidence, tasks, deadlines and "
        "the top next actions. Use this first whenever the user asks about a specific deal ('review deal 001', 'what blocks "
        "execution', 'where are we with X'). Requires opportunity_id. Read-only, no side effects, no external research. "
        "Counterparty identities are redacted unless the caller holds northsea.identity."),
    "northsea_get_next_actions": (
        "Return ranked, executable next steps for ONE deal, ordered by impact, urgency, dependencies and whether approval is "
        "needed. Use when the user asks 'what should NorthSea do next' on a deal. Requires opportunity_id. Read-only; it does "
        "NOT create tasks (use northsea_create_task for that)."),
    "northsea_qualify_opportunity": (
        "Run a structured qualification of an existing deal: the nine gates (buyer, seller, commercial, evidence, protection, "
        "introduction, transaction, fulfilment, settlement) with evidence counts, blockers, next actions, and recommended tasks "
        "and communications. Use when the user wants to know whether a deal is qualified or what is missing. Requires "
        "opportunity_id. Read-only; never passes a gate. depth=deep adds an unverified CrewAI analysis."),
    "northsea_assess_match": (
        "Assess compatibility between ONE buyer requirement and ONE supplier offer. Returns commercial_fit_score (same rule as "
        "the NorthSea website intake; 60+ is a match) separately from transaction_readiness_score, with matching fields, "
        "conflicts, unknowns, blockers and next actions. Use for 'does this offer fit this requirement'. Requires both ids. "
        "Read-only; does not create an opportunity."),
    "northsea_process_reply": (
        "Analyse an inbound email, call or message that is ALREADY stored in NorthSea: classification, facts the counterparty "
        "explicitly stated, their questions, terms that changed versus the record, blockers, red flags, the recommended reply "
        "and recommended tasks. Requires communication_id. Read-only; does not send or draft anything. Do not use for text "
        "pasted into the chat that is not in NorthSea."),
    "northsea_research_counterparty": (
        "Research an existing or candidate counterparty (company) with sourced web research: legal entity, real commodity "
        "activity, locations, public roles, red flags, open verification questions and recommended actions. Use for 'research "
        "the seller behind this deal' or due diligence on a company. Requires counterparty_id (company UUID) OR a safe "
        "identifying context for a company not yet in NorthSea. Uses the shared, cost-limited research budget. No database "
        "writes. Findings are UNVERIFIED and never change a verification status."),
    "northsea_find_suppliers": (
        "Find candidate suppliers for ONE existing buyer requirement: scores active supplier offers already in NorthSea with the "
        "intake match rule and searches the web for new source-supported candidates, deduplicated against known companies. "
        "Use for 'find serious suppliers for this requirement'. Requires buyer_requirement_id. Uses the research budget. "
        "Candidates are returned, not saved; every new candidate is unverified."),
    "northsea_find_buyers": (
        "Find candidate buyers for ONE existing supplier offer: scores active buyer requirements in NorthSea and searches the web "
        "for new importer/end-user candidates, deduplicated against known companies. Use for 'who could buy this offer'. "
        "Requires supplier_offer_id. Uses the research budget. Candidates are returned, not saved; all unverified."),
    "northsea_investigate_blockers": (
        "Try to resolve researchable blockers on ONE deal (entity verification, seller authority, the deal's primary blocker) "
        "with sourced research. Returns new evidence with sources and which blockers remain open. Research NEVER marks a "
        "blocker resolved by itself; a human verifies evidence first. Requires opportunity_id; optional blocker_codes from "
        "northsea_review_deal. Uses the research budget. No database writes."),
    "northsea_prepare_outreach": (
        "Prepare a grounded business communication draft (qualification, follow-up or documentation request) for a deal or a "
        "counterparty, using only facts on record, never revealing the other party's identity. Use for 'draft the qualification "
        "email but do not send it'. Requires opportunity_id or counterparty_id plus the objective. THIS TOOL NEVER SENDS. "
        "With save_as_pending_draft=true it stores the email as a PENDING draft in the Deal Desk (needs idempotency_key); "
        "sending then requires human approval and northsea_send_approved_communication."),
    "northsea_create_task": (
        "Create a NorthSea deal task in the existing Deal Desk task list (the same record the AXE CORE desk shows). Use only when "
        "the user asks to create or schedule a follow-up. Requires opportunity_id, title and idempotency_key; retries with the "
        "same key return the same task, and an identical open task is reused instead of duplicated. Low-risk write."),
    "northsea_update_task": (
        "Update status, due date, priority or result note of an existing NorthSea deal task. Requires task_id and idempotency_key. "
        "Closed tasks cannot be reopened; completing an approval-required task needs northsea.admin. Low-risk write."),
    "northsea_approve_draft": (
        "Record a HUMAN approval for a pending reply draft. Only call this when the user explicitly says they reviewed and approve "
        "that exact draft. Requires draft_id and idempotency_key and the northsea.admin scope. Sensitive drafts (identity, "
        "commission, binding terms) are refused unless the deal has signed commission protection. Does not send."),
    "northsea_send_approved_communication": (
        "Send ONE email draft that a human has already approved, through the NorthSea sending service (branded, threaded, "
        "provider-idempotent). Only call when the user explicitly asks to send that approved draft now. Requires draft_id, "
        "confirm=true and idempotency_key. Refuses unapproved drafts and sensitive drafts without signed commission protection. "
        "A draft that was already sent is never sent again. High-impact, irreversible."),
}


def _ann(title: str, risk: Risk, open_world: bool) -> ToolAnnotations:
    return ToolAnnotations(title=title, read_only_hint=risk in (Risk.READ_ONLY, Risk.RESEARCH, Risk.DRAFT),
                           destructive_hint=risk == Risk.HIGH_IMPACT_WRITE,
                           idempotent_hint=risk in (Risk.READ_ONLY, Risk.LOW_RISK_WRITE, Risk.HIGH_IMPACT_WRITE),
                           open_world_hint=open_world)


def register_tools(mcp: MCPServer, service: NorthSeaService, guard: Guard) -> None:

    @mcp.tool(name="northsea_review_deal", title="Review deal", description=DESCRIPTIONS["northsea_review_deal"],
              annotations=_ann("Review deal", Risk.READ_ONLY, False), structured_output=True)
    async def review_deal(opportunity_id: Id) -> DealReview:
        return await guard.run("northsea_review_deal", {"opportunity_id": opportunity_id},
                               lambda c: service.review_deal(c, opportunity_id=opportunity_id), DealReview)

    @mcp.tool(name="northsea_get_next_actions", title="Get next actions", description=DESCRIPTIONS["northsea_get_next_actions"],
              annotations=_ann("Get next actions", Risk.READ_ONLY, False), structured_output=True)
    async def get_next_actions(opportunity_id: Id) -> NextActions:
        return await guard.run("northsea_get_next_actions", {"opportunity_id": opportunity_id},
                               lambda c: service.get_next_actions(c, opportunity_id=opportunity_id), NextActions)

    @mcp.tool(name="northsea_qualify_opportunity", title="Qualify opportunity", description=DESCRIPTIONS["northsea_qualify_opportunity"],
              annotations=_ann("Qualify opportunity", Risk.READ_ONLY, False), structured_output=True)
    async def qualify_opportunity(opportunity_id: Id, depth: DEPTH = "standard") -> QualificationResult:
        return await guard.run("northsea_qualify_opportunity", {"opportunity_id": opportunity_id},
                               lambda c: service.qualify_opportunity(c, opportunity_id=opportunity_id, depth=depth), QualificationResult,
                               timeout=DEEP_TIMEOUT if depth == "deep" else None)

    @mcp.tool(name="northsea_assess_match", title="Assess match", description=DESCRIPTIONS["northsea_assess_match"],
              annotations=_ann("Assess match", Risk.READ_ONLY, False), structured_output=True)
    async def assess_match(buyer_requirement_id: Id, supplier_offer_id: Id) -> MatchAssessmentResult:
        return await guard.run("northsea_assess_match", {"buyer_requirement_id": buyer_requirement_id, "supplier_offer_id": supplier_offer_id},
                               lambda c: service.assess_match(c, buyer_requirement_id=buyer_requirement_id, supplier_offer_id=supplier_offer_id),
                               MatchAssessmentResult)

    @mcp.tool(name="northsea_process_reply", title="Process reply", description=DESCRIPTIONS["northsea_process_reply"],
              annotations=_ann("Process reply", Risk.READ_ONLY, False), structured_output=True)
    async def process_reply(communication_id: Id) -> ReplyAnalysis:
        return await guard.run("northsea_process_reply", {"communication_id": communication_id},
                               lambda c: service.process_reply(c, communication_id=communication_id), ReplyAnalysis)

    @mcp.tool(name="northsea_research_counterparty", title="Research counterparty", description=DESCRIPTIONS["northsea_research_counterparty"],
              annotations=_ann("Research counterparty", Risk.RESEARCH, True), structured_output=True)
    async def research_counterparty(
        objective: Annotated[str, Field(description="What to establish, e.g. 'verify seller authority for copper cathode'.", min_length=5, max_length=500)],
        counterparty_id: Annotated[str | None, Field(description="Company UUID if the counterparty is in NorthSea.")] = None,
        context: Annotated[str | None, Field(description="For companies not in NorthSea: name, country and website. No personal data.", max_length=600)] = None,
        priority: PRIO = "P2", depth: DEPTH = "standard",
    ) -> CounterpartyResearch:
        return await guard.run("northsea_research_counterparty", {"counterparty_id": counterparty_id},
                               lambda c: service.research_counterparty(c, objective=objective, counterparty_id=counterparty_id,
                                                                       context=context, priority=priority, depth=depth), CounterpartyResearch,
                               timeout=DEEP_TIMEOUT if depth == "deep" else None)

    @mcp.tool(name="northsea_find_suppliers", title="Find suppliers", description=DESCRIPTIONS["northsea_find_suppliers"],
              annotations=_ann("Find suppliers", Risk.RESEARCH, True), structured_output=True)
    async def find_suppliers(buyer_requirement_id: Id,
                             geography: Annotated[str | None, Field(description="Optional comma-separated countries or regions to focus on.", max_length=200)] = None,
                             priority: PRIO = "P2") -> CandidateSearch:
        return await guard.run("northsea_find_suppliers", {"buyer_requirement_id": buyer_requirement_id},
                               lambda c: service.find_suppliers(c, buyer_requirement_id=buyer_requirement_id, geography=geography, priority=priority),
                               CandidateSearch)

    @mcp.tool(name="northsea_find_buyers", title="Find buyers", description=DESCRIPTIONS["northsea_find_buyers"],
              annotations=_ann("Find buyers", Risk.RESEARCH, True), structured_output=True)
    async def find_buyers(supplier_offer_id: Id,
                          geography: Annotated[str | None, Field(description="Optional comma-separated countries or regions to focus on.", max_length=200)] = None,
                          priority: PRIO = "P2") -> CandidateSearch:
        return await guard.run("northsea_find_buyers", {"supplier_offer_id": supplier_offer_id},
                               lambda c: service.find_buyers(c, supplier_offer_id=supplier_offer_id, geography=geography, priority=priority),
                               CandidateSearch)

    @mcp.tool(name="northsea_investigate_blockers", title="Investigate blockers", description=DESCRIPTIONS["northsea_investigate_blockers"],
              annotations=_ann("Investigate blockers", Risk.RESEARCH, True), structured_output=True)
    async def investigate_blockers(opportunity_id: Id,
                                   blocker_codes: Annotated[list[str] | None, Field(description="Optional blocker codes from northsea_review_deal; default all researchable.", max_length=10)] = None,
                                   priority: PRIO = "P2", depth: DEPTH = "standard") -> BlockerInvestigation:
        return await guard.run("northsea_investigate_blockers", {"opportunity_id": opportunity_id},
                               lambda c: service.investigate_blockers(c, opportunity_id=opportunity_id, blocker_codes=blocker_codes,
                                                                      priority=priority, depth=depth), BlockerInvestigation,
                               timeout=DEEP_TIMEOUT if depth == "deep" else None)

    @mcp.tool(name="northsea_prepare_outreach", title="Prepare outreach draft", description=DESCRIPTIONS["northsea_prepare_outreach"],
              annotations=_ann("Prepare outreach draft", Risk.DRAFT, False), structured_output=True)
    async def prepare_outreach(
        objective: Annotated[str, Field(description="What the message should achieve.", min_length=5, max_length=500)],
        opportunity_id: Annotated[str | None, Field(description="Deal UUID.")] = None,
        counterparty_id: Annotated[str | None, Field(description="Company UUID of the recipient.")] = None,
        channel: Literal["email", "phone", "linkedin", "whatsapp"] = "email",
        template: Literal["auto", "supplier_qualification", "buyer_qualification", "follow_up", "document_request"] = "auto",
        save_as_pending_draft: Annotated[bool, Field(description="Store as a PENDING email draft in the Deal Desk. Never sends.")] = False,
        idempotency_key: Annotated[str | None, Field(description="Required when save_as_pending_draft is true.", max_length=128)] = None,
    ) -> OutreachDraft:
        args = {"objective": objective, "opportunity_id": opportunity_id, "counterparty_id": counterparty_id, "channel": channel,
                "template": template, "save": save_as_pending_draft}

        async def doe(c: Caller) -> OutreachDraft:
            return await service.prepare_outreach(c, objective=objective, opportunity_id=opportunity_id, counterparty_id=counterparty_id,
                                                  channel=channel, template=template, save_as_pending_draft=save_as_pending_draft)
        if save_as_pending_draft:
            # Opslaan is een schrijfactie: dan geldt de idempotentie van een write-tool.
            if not idempotency_key:
                raise ToolFailure("idempotency_key_required: save_as_pending_draft=true needs an idempotency_key.")
            beleid = TOOLS["northsea_prepare_outreach"]
            staat, eerder = guard.store.idem_begin("draft-save", "northsea_prepare_outreach", idempotency_key, _args_hash(args))
            if staat == "done":
                return OutreachDraft.model_validate(eerder)
            if staat in ("conflict", "running"):
                raise ToolFailure(f"idempotency_{staat}: this idempotency_key is already in use.")
            try:
                uit = await guard.run(beleid.name, {"opportunity_id": opportunity_id, "counterparty_id": counterparty_id}, doe, OutreachDraft, args=args)
            except Exception:
                guard.store.idem_abort("draft-save", "northsea_prepare_outreach", idempotency_key)
                raise
            guard.store.idem_finish("draft-save", "northsea_prepare_outreach", idempotency_key, uit.model_dump(mode="json"))
            return uit
        return await guard.run("northsea_prepare_outreach", {"opportunity_id": opportunity_id, "counterparty_id": counterparty_id},
                               doe, OutreachDraft, args=args)

    @mcp.tool(name="northsea_create_task", title="Create deal task", description=DESCRIPTIONS["northsea_create_task"],
              annotations=_ann("Create deal task", Risk.LOW_RISK_WRITE, False), structured_output=True)
    async def create_task(opportunity_id: Id,
                          title: Annotated[str, Field(min_length=3, max_length=200)],
                          idempotency_key: Key,
                          description: Annotated[str | None, Field(max_length=4000)] = None,
                          task_type: Annotated[str, Field(pattern=r"^[a-z_]{3,40}$")] = "follow_up",
                          priority: Annotated[int, Field(ge=0, le=100)] = 50,
                          due_at: Annotated[str | None, Field(description="ISO 8601 timestamp.")] = None,
                          requires_approval: bool = False,
                          owner: Literal["axe", "luka"] = "axe") -> TaskResult:
        args = dict(opportunity_id=opportunity_id, title=title, description=description, task_type=task_type, priority=priority,
                    due_at=due_at, requires_approval=requires_approval, owner=owner)
        return await guard.run("northsea_create_task", {"opportunity_id": opportunity_id},
                               lambda c: service.create_task(c, **args), TaskResult, idempotency_key=idempotency_key, args=args)

    @mcp.tool(name="northsea_update_task", title="Update deal task", description=DESCRIPTIONS["northsea_update_task"],
              annotations=_ann("Update deal task", Risk.LOW_RISK_WRITE, False), structured_output=True)
    async def update_task(task_id: Id, idempotency_key: Key,
                          status: Literal["open", "waiting", "in_progress", "completed", "cancelled"] | None = None,
                          result_note: Annotated[str | None, Field(max_length=2000)] = None,
                          due_at: Annotated[str | None, Field(description="ISO 8601 timestamp.")] = None,
                          priority: Annotated[int | None, Field(ge=0, le=100)] = None,
                          expected_updated_at: Annotated[str | None, Field(description="updated_at you last read; rejects stale updates.")] = None) -> TaskResult:
        args = dict(task_id=task_id, status=status, result_note=result_note, due_at=due_at, priority=priority, expected_updated_at=expected_updated_at)
        return await guard.run("northsea_update_task", {"task_id": task_id},
                               lambda c: service.update_task(c, **args), TaskResult, idempotency_key=idempotency_key, args=args)

    @mcp.tool(name="northsea_approve_draft", title="Approve draft (human decision)", description=DESCRIPTIONS["northsea_approve_draft"],
              annotations=_ann("Approve draft", Risk.HIGH_IMPACT_WRITE, False), structured_output=True)
    async def approve_draft(draft_id: Id, idempotency_key: Key,
                            expected_updated_at: Annotated[str | None, Field(description="updated_at of the draft the human reviewed.")] = None) -> DraftApprovalResult:
        args = dict(draft_id=draft_id, expected_updated_at=expected_updated_at)
        return await guard.run("northsea_approve_draft", {"draft_id": draft_id},
                               lambda c: service.approve_draft(c, **args), DraftApprovalResult, idempotency_key=idempotency_key, args=args)

    @mcp.tool(name="northsea_send_approved_communication", title="Send approved email", description=DESCRIPTIONS["northsea_send_approved_communication"],
              annotations=_ann("Send approved email", Risk.HIGH_IMPACT_WRITE, True), structured_output=True)
    async def send_approved_communication(draft_id: Id, confirm: Annotated[bool, Field(description="Must be true: the user explicitly asked to send this approved draft now.")],
                                          idempotency_key: Key) -> SendResult:
        args = dict(draft_id=draft_id, confirm=confirm)
        return await guard.run("northsea_send_approved_communication", {"draft_id": draft_id},
                               lambda c: service.send_approved_communication(c, **args), SendResult, idempotency_key=idempotency_key, args=args)


STATUSES = {
    "opportunity_stage": ["identified", "verifying", "qualified", "contacted", "engaged", "matching", "introduced", "negotiating",
                          "contracting", "shipment", "commission_due", "won", "lost"],
    "verification_status": ["unverified", "reviewing", "verified", "rejected"],
    "gates": ["buyer", "seller", "commercial", "evidence", "protection", "introduction", "transaction", "fulfilment", "settlement"],
    "draft_approval_status": ["pending", "approved", "rejected"],
    "task_status": ["open", "waiting", "in_progress", "completed", "cancelled"],
}


def register_resources(mcp: MCPServer) -> None:
    @mcp.resource("northsea://policy/permissions", name="NorthSea permissions", mime_type="application/json",
                  description="Scopes, tool risk classes and which tools need approval.")
    def permissions() -> str:
        return json.dumps({
            "scopes": SCOPES,
            "tools": {n: {"risk": p.risk.value, "scopes": list(p.scopes), "idempotency_key": p.needs_idempotency_key,
                          "may_use_crewai": p.uses_crew} for n, p in TOOLS.items()},
            "policy": ["Research, analysis and drafting are automatic.", "Sending requires a human-approved draft and confirm=true.",
                       "Sensitive drafts require signed commission protection.", "Public-source claims stay unverified.",
                       "Counterparty identities are redacted without northsea.identity."],
        }, indent=2)

    @mcp.resource("northsea://policy/statuses", name="NorthSea statuses", mime_type="application/json",
                  description="Supported deal stages, verification states, gates, draft and task statuses.")
    def statuses() -> str:
        return json.dumps(STATUSES, indent=2)


INSTRUCTIONS = (
    "NorthSea Commodity Partners is an independent physical-commodity intermediary (copper cathode focus). Use these tools to "
    "review deals, qualify opportunities, research counterparties, find and match buyers and suppliers, and prepare "
    "communications. Rules: never present research as verified; never claim NorthSea owns inventory; never accept prices, "
    "payment terms, commissions or contracts; never send anything unless a human approved that exact draft and asked to "
    "send it. Start deal questions with northsea_review_deal."
)


def create_app(settings: Settings | None = None, *, repo: SupabaseRepository | None = None, research: ResearchGateway | None = None,
               crew: CrewGateway | None = None, store: Store | None = None, auditor: Auditor | None = None,
               http: httpx.AsyncClient | None = None):
    settings = settings or Settings.from_env()
    store = store or Store(settings.state_db)
    repo = repo or SupabaseRepository(settings.commodities_url, settings.commodities_key, settings.http_timeout_s)
    research = research or ResearchGateway(axe_api_url=settings.axe_api_url, axe_api_key=settings.axe_api_key,
                                           tavily_key=settings.tavily_key, zenserp_key=settings.zenserp_key,
                                           timeout=settings.research_timeout_s)
    crew = crew or CrewGateway(axe_api_url=settings.axe_api_url, axe_api_key=settings.axe_api_key, crew_venv_py=settings.crew_venv_py)
    auditor = auditor or Auditor(axe_url=settings.axe_url, axe_key=settings.axe_key, store=store)
    service = NorthSeaService(repo, research, crew)
    oauth = OAuthServer(settings, store, http)
    guard = Guard(store, auditor)

    mcp = MCPServer(
        "northsea-commodity-partners",
        title="NorthSea Commodity Partners",
        description="Deal review, qualification, counterparty research and approval-controlled communications for NorthSea.",
        instructions=INSTRUCTIONS, version=__version__, website_url="https://northseacommodity.com",
        token_verifier=NorthSeaTokenVerifier(store),
        auth=AuthSettings(issuer_url=AnyHttpUrl(settings.issuer), resource_server_url=AnyHttpUrl(settings.resource_url),
                          required_scopes=None, validate_token_resource=True),
    )
    register_tools(mcp, service, guard)
    register_resources(mcp)

    route = mcp.custom_route
    route("/.well-known/oauth-authorization-server", methods=["GET"])(oauth.well_known_as)
    route("/.well-known/openid-configuration", methods=["GET"])(oauth.well_known_as)
    route("/.well-known/oauth-protected-resource", methods=["GET"])(oauth.well_known_resource)
    route("/oauth/register", methods=["POST"])(oauth.register)
    route("/oauth/authorize", methods=["GET"])(oauth.authorize_get)
    route("/oauth/authorize", methods=["POST"])(oauth.authorize_post)
    route("/oauth/token", methods=["POST"])(oauth.token)
    route("/oauth/revoke", methods=["POST"])(oauth.revoke)

    @route("/", methods=["GET"])
    async def index(request: Request) -> Response:
        return PlainTextResponse(f"NorthSea Commodity Partners MCP {__version__}\nMCP endpoint: {settings.resource_url}\n")

    @route("/health", methods=["GET"])
    async def health(request: Request) -> Response:
        # Publiek: alleen of het proces leeft. Geen interne details.
        return JSONResponse({"status": "ok", "version": __version__}, headers={"Cache-Control": "no-store"})

    @route("/version", methods=["GET"])
    async def version(request: Request) -> Response:
        return JSONResponse({"name": "northsea-mcp", "version": __version__, "mcp_endpoint": settings.resource_url})

    @route("/ready", methods=["GET"])
    async def ready(request: Request) -> Response:
        checks: dict[str, Any] = {"state_store": store.ping()}
        checks.update(await service.health())
        try:
            checks["audit"] = await auditor.ping()
        except Exception:  # noqa: BLE001
            checks["audit"] = False
        klaar = bool(checks["state_store"] and checks.get("supabase") and checks["audit"])
        auth = request.headers.get("authorization", "")
        rec = store.lookup(auth[7:], ("service", "access")) if auth.lower().startswith("bearer ") else None
        if rec and "northsea.admin" in rec.scopes:
            try:
                checks["audit_pending_flushed"] = await auditor.flush()
            except Exception:  # noqa: BLE001
                pass
            return JSONResponse({"ready": klaar, "checks": checks, "version": __version__}, status_code=200 if klaar else 503)
        return JSONResponse({"ready": klaar}, status_code=200 if klaar else 503, headers={"Cache-Control": "no-store"})

    host = urlparse(settings.issuer).hostname or "localhost"
    starlette_app = mcp.streamable_http_app(
        streamable_http_path="/mcp", json_response=True, stateless_http=True, max_request_body_size=256 * 1024,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[host, f"{host}:*", "127.0.0.1:*", "localhost:*"],
            allowed_origins=[settings.issuer, "https://chatgpt.com", "https://chat.openai.com", "http://127.0.0.1:*", "http://localhost:*"]),
        host=host,
    )
    app = starlette_app
    # De SDK serveert /.well-known/oauth-protected-resource/mcp zelf, maar met de
    # autorisatieserver als pydantic-URL: "https://mcp.northseacommodity.com/" (met
    # slash), terwijl onze AS-metadata issuer zonder slash zegt. Een strikte client
    # vergelijkt die twee letterlijk en weigert (gemeten op het publieke endpoint,
    # 15 sep 2026). Onze eigen route vooraan wint, met dezelfde issuer en scopes.
    from starlette.routing import Route
    app.router.routes.insert(0, Route("/.well-known/oauth-protected-resource/mcp", endpoint=oauth.well_known_resource, methods=["GET"]))
    app.state.northsea = {"settings": settings, "store": store, "service": service, "oauth": oauth, "guard": guard,
                          "auditor": auditor, "mcp": mcp, "client_ip": client_ip}
    return app
