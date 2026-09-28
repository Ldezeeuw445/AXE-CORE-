"""Registratie van de leestools (readtools.py) bij de MCP-server.

Elke tool loopt door dezelfde Guard als de bestaande tools: token, scopes,
rate limit, veilige fout, audit. Allemaal READ_ONLY en zonder bijwerkingen.
"""
from __future__ import annotations

from typing import Annotated, Any, Literal

from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from pydantic import BaseModel, ConfigDict, Field

from .read_catalog import DESCRIPTIONS as _DESC
from .readtools import ReadTools


class ReadResult(BaseModel):
    """Structured read result. Every result has generated_at and source; the rest depends on the tool."""
    model_config = ConfigDict(extra="allow")
    generated_at: str
    source: list[str] = []


RO = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)

Limit = Annotated[int, Field(ge=1, le=100, description="Page size (default 25, max 100).")]
Offset = Annotated[int, Field(ge=0, description="Items to skip; use next_offset from the previous page.")]
DealRef = Annotated[str, Field(min_length=3, max_length=80,
                               description="Deal reference: a deal code such as DEAL-001, an opportunity UUID, or '#' plus the first 6+ "
                                           "characters of its id. Ambiguous references return candidates instead of guessing.")]
PartyRef = Annotated[str, Field(min_length=2, max_length=120,
                                description="Counterparty (company) reference: UUID, or company name (exact or unique partial) when you hold "
                                            "northsea.identity. Ambiguous names return candidates.")]
Since = Annotated[str | None, Field(description="ISO 8601 timestamp; only records updated/occurring at or after it.")]
OptBool = Annotated[bool | None, Field(description="true / false to filter; omit for both.")]



def register_read_tools(mcp: MCPServer, rt: ReadTools, guard: Any) -> None:
    def tool(naam: str, titel: str):
        return mcp.tool(name=naam, title=titel, description=_DESC[naam], annotations=RO, structured_output=True)

    async def run(naam: str, ids: dict, doe) -> ReadResult:
        async def call(c):
            return ReadResult.model_validate(await doe(c))
        return await guard.run(naam, ids, call, ReadResult)

    @tool("northsea_get_trade_center_overview", "Trade Center overview (start here)")
    async def overview() -> ReadResult:
        return await run("northsea_get_trade_center_overview", {}, rt.overview)

    @tool("northsea_get_system_health", "System health")
    async def health() -> ReadResult:
        return await run("northsea_get_system_health", {}, rt.system_health)

    @tool("northsea_get_data_freshness", "Data freshness")
    async def freshness() -> ReadResult:
        return await run("northsea_get_data_freshness", {}, rt.data_freshness)

    @tool("northsea_get_dashboard_snapshot", "Dashboard snapshot (all 10 views)")
    async def snapshot(view: Annotated[Literal["live_map", "active_deals", "pipeline", "counterparties", "communications", "market_intel",
                                               "documents", "evidence", "automation", "reports"] | None,
                                       Field(description="Limit to one view; omit for all 10.")] = None) -> ReadResult:
        return await run("northsea_get_dashboard_snapshot", {}, lambda c: rt.dashboard_snapshot(c, view=view))

    @tool("northsea_get_automation_status", "Automation status")
    async def automation() -> ReadResult:
        return await run("northsea_get_automation_status", {}, rt.automation_status)

    @tool("northsea_list_deals", "List deals")
    async def list_deals(
        stage: Annotated[str | None, Field(description="identified, verifying, qualified, contacted, engaged, matching, introduced, negotiating, contracting, shipment, commission_due, won, lost")] = None,
        execution_state: Annotated[str | None, Field(description="e.g. matched, qualifying, discovered, awaiting_supplier_reply")] = None,
        qualification_status: str | None = None,
        dashboard_state: Literal["active", "matched", "blocked", "completed", "other"] | None = None,
        priority: Annotated[str | None, Field(description="Value of deal_priority, e.g. DEAL-001 or high")] = None,
        commodity: Annotated[str | None, Field(description="Substring of commodity or product, e.g. copper")] = None,
        counterparty: Annotated[str | None, Field(description="Counterparty UUID (or name when you hold northsea.identity)")] = None,
        blocked: OptBool = None, approval_required: OptBool = None, active: OptBool = None,
        min_readiness: Annotated[int | None, Field(ge=0, le=100)] = None, max_readiness: Annotated[int | None, Field(ge=0, le=100)] = None,
        updated_since: Since = None, include_lost: bool = False, include_testcases: bool = False,
        sort: Literal["updated_desc", "readiness_desc", "created_desc", "next_action_asc"] = "updated_desc",
        limit: Limit = 25, offset: Offset = 0,
    ) -> ReadResult:
        return await run("northsea_list_deals", {}, lambda c: rt.list_deals(
            c, stage=stage, execution_state=execution_state, qualification_status=qualification_status, dashboard_state=dashboard_state,
            priority=priority, commodity=commodity, counterparty=counterparty, blocked=blocked, approval_required=approval_required,
            active=active, min_readiness=min_readiness, max_readiness=max_readiness, updated_since=updated_since, include_lost=include_lost,
            include_testcases=include_testcases, sort=sort, limit=limit, offset=offset))

    @tool("northsea_get_deal", "Get deal")
    async def get_deal(deal: DealRef) -> ReadResult:
        return await run("northsea_get_deal", {"deal": deal}, lambda c: rt.get_deal(c, deal=deal))

    @tool("northsea_get_deal_readiness", "Get deal readiness")
    async def readiness(deal: DealRef) -> ReadResult:
        return await run("northsea_get_deal_readiness", {"deal": deal}, lambda c: rt.deal_readiness(c, deal=deal))

    @tool("northsea_get_deal_gates", "Get deal gates")
    async def gates(deal: DealRef) -> ReadResult:
        return await run("northsea_get_deal_gates", {"deal": deal}, lambda c: rt.deal_gates(c, deal=deal))

    @tool("northsea_get_deal_blockers", "Get deal blockers")
    async def blockers(deal: DealRef) -> ReadResult:
        return await run("northsea_get_deal_blockers", {"deal": deal}, lambda c: rt.deal_blockers(c, deal=deal))

    @tool("northsea_get_deal_events", "Get deal events")
    async def events(deal: DealRef, limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_get_deal_events", {"deal": deal}, lambda c: rt.deal_events(c, deal=deal, limit=limit, offset=offset))

    @tool("northsea_get_pipeline_summary", "Pipeline summary")
    async def pipeline() -> ReadResult:
        return await run("northsea_get_pipeline_summary", {}, rt.pipeline_summary)

    @tool("northsea_list_counterparties", "List counterparties")
    async def list_counterparties(
        company_type: Annotated[str | None, Field(description="buyer, supplier, broker, other ...")] = None,
        verification_status: Literal["verified", "reviewing", "unverified", "rejected"] | None = None,
        country: str | None = None, commodity: str | None = None,
        search: Annotated[str | None, Field(description="Matches country/commodity (and name/city with northsea.identity)")] = None,
        has_open_deals: OptBool = None, do_not_contact: OptBool = None, updated_since: Since = None,
        sort: Literal["updated_desc", "open_deals_desc", "last_contact_desc"] = "updated_desc", limit: Limit = 25, offset: Offset = 0,
    ) -> ReadResult:
        return await run("northsea_list_counterparties", {}, lambda c: rt.list_counterparties(
            c, company_type=company_type, verification_status=verification_status, country=country, commodity=commodity, search=search,
            has_open_deals=has_open_deals, do_not_contact=do_not_contact, updated_since=updated_since, sort=sort, limit=limit, offset=offset))

    @tool("northsea_list_buyers", "List buyers")
    async def list_buyers(verification_status: Literal["verified", "reviewing", "unverified", "rejected"] | None = None,
                          country: str | None = None, commodity: str | None = None, has_open_deals: OptBool = None,
                          limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_buyers", {}, lambda c: rt.list_counterparties(
            c, company_type="buyer", verification_status=verification_status, country=country, commodity=commodity,
            has_open_deals=has_open_deals, limit=limit, offset=offset))

    @tool("northsea_list_suppliers", "List suppliers")
    async def list_suppliers(verification_status: Literal["verified", "reviewing", "unverified", "rejected"] | None = None,
                             country: str | None = None, commodity: str | None = None, has_open_deals: OptBool = None,
                             limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_suppliers", {}, lambda c: rt.list_counterparties(
            c, company_type="supplier", verification_status=verification_status, country=country, commodity=commodity,
            has_open_deals=has_open_deals, limit=limit, offset=offset))

    @tool("northsea_get_counterparty", "Get counterparty")
    async def get_counterparty(counterparty: PartyRef) -> ReadResult:
        return await run("northsea_get_counterparty", {"counterparty": counterparty}, lambda c: rt.get_counterparty(c, counterparty=counterparty))

    @tool("northsea_get_counterparty_evidence", "Get counterparty evidence")
    async def party_evidence(counterparty: PartyRef) -> ReadResult:
        return await run("northsea_get_counterparty_evidence", {"counterparty": counterparty},
                         lambda c: rt.counterparty_evidence(c, counterparty=counterparty))

    @tool("northsea_get_counterparty_communications", "Get counterparty communications")
    async def party_comms(counterparty: PartyRef, limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_get_counterparty_communications", {"counterparty": counterparty},
                         lambda c: rt.counterparty_communications(c, counterparty=counterparty, limit=limit, offset=offset))

    @tool("northsea_get_counterparty_opportunities", "Get counterparty opportunities")
    async def party_opps(counterparty: PartyRef) -> ReadResult:
        return await run("northsea_get_counterparty_opportunities", {"counterparty": counterparty},
                         lambda c: rt.counterparty_opportunities(c, counterparty=counterparty))

    @tool("northsea_list_communications", "List communications")
    async def list_comms(
        direction: Literal["inbound", "outbound", "internal"] | None = None, channel: str | None = None,
        delivery_status: Annotated[str | None, Field(description="sent, delivered, bounced, failed, not_tracked ...")] = None,
        counterparty: Annotated[str | None, Field(description="Counterparty name or UUID")] = None,
        deal: Annotated[str | None, Field(description="Deal code or UUID")] = None,
        classification: str | None = None, urgency: str | None = None, since: Since = None, has_analysis: OptBool = None,
        limit: Limit = 25, offset: Offset = 0,
    ) -> ReadResult:
        return await run("northsea_list_communications", {}, lambda c: rt.list_communications(
            c, direction=direction, channel=channel, delivery_status=delivery_status, counterparty=counterparty, deal=deal,
            classification=classification, urgency=urgency, since=since, has_analysis=has_analysis, limit=limit, offset=offset))

    @tool("northsea_get_communication", "Get communication")
    async def get_comm(communication: Annotated[str, Field(min_length=3, max_length=200, description="Communication UUID or provider message id")]) -> ReadResult:
        return await run("northsea_get_communication", {"communication": communication}, lambda c: rt.get_communication(c, communication=communication))

    @tool("northsea_list_recent_inbound", "Recent inbound")
    async def recent_inbound(days: Annotated[int, Field(ge=1, le=90)] = 7, limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_recent_inbound", {}, lambda c: rt.recent_inbound(c, days=days, limit=limit, offset=offset))

    @tool("northsea_get_communication_thread", "Get communication thread")
    async def thread(communication: Annotated[str, Field(min_length=3, max_length=200, description="Communication UUID or provider message id")]) -> ReadResult:
        return await run("northsea_get_communication_thread", {"communication": communication},
                         lambda c: rt.communication_thread(c, communication=communication))

    @tool("northsea_list_failed_or_bounced_communications", "Failed or bounced communications")
    async def bounced(limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_failed_or_bounced_communications", {}, lambda c: rt.failed_or_bounced(c, limit=limit, offset=offset))

    @tool("northsea_summarize_inbound", "Summarize inbound")
    async def summarize(days: Annotated[int, Field(ge=1, le=90)] = 14) -> ReadResult:
        return await run("northsea_summarize_inbound", {}, lambda c: rt.summarize_inbound(c, days=days))

    @tool("northsea_list_tasks", "List tasks")
    async def list_tasks(
        status: Annotated[str, Field(description="open (open/waiting/in_progress), any, or a specific status")] = "open",
        source: Literal["deal_tasks", "action_queue"] | None = None, deal: Annotated[str | None, Field(description="Deal code or UUID")] = None,
        requires_approval: OptBool = None, overdue: OptBool = None, owner: str | None = None, limit: Limit = 25, offset: Offset = 0,
    ) -> ReadResult:
        return await run("northsea_list_tasks", {}, lambda c: rt.list_tasks(
            c, status=status, source=source, deal=deal, requires_approval=requires_approval, overdue=overdue, owner=owner, limit=limit, offset=offset))

    @tool("northsea_get_task", "Get task")
    async def get_task(task_id: Annotated[str, Field(min_length=36, max_length=36, description="Task UUID")]) -> ReadResult:
        return await run("northsea_get_task", {"task_id": task_id}, lambda c: rt.get_task(c, task_id=task_id))

    @tool("northsea_list_overdue_tasks", "Overdue tasks")
    async def overdue(limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_overdue_tasks", {}, lambda c: rt.list_tasks(c, overdue=True, limit=limit, offset=offset))

    @tool("northsea_list_pending_actions", "Pending actions (AXE Chase)")
    async def chase(only: Literal["critical", "new", "overdue"] | None = None, limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_pending_actions", {}, lambda c: rt.pending_actions(c, only=only, limit=limit, offset=offset))

    @tool("northsea_list_evidence", "List evidence")
    async def list_evidence(deal: Annotated[str | None, Field(description="Deal code or UUID")] = None,
                            party_side: Annotated[str | None, Field(description="buyer or seller")] = None,
                            verification_class: Literal["verified", "partial", "unverified", "contradicted"] | None = None,
                            evidence_type: str | None = None, limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_evidence", {}, lambda c: rt.list_evidence(
            c, deal=deal, party_side=party_side, verification_class=verification_class, evidence_type=evidence_type, limit=limit, offset=offset))

    @tool("northsea_get_evidence", "Get evidence")
    async def get_evidence(evidence_id: Annotated[str, Field(min_length=36, max_length=36)]) -> ReadResult:
        return await run("northsea_get_evidence", {"evidence_id": evidence_id}, lambda c: rt.get_evidence(c, evidence_id=evidence_id))

    @tool("northsea_list_documents", "List documents")
    async def list_documents(deal: Annotated[str | None, Field(description="Deal code or UUID")] = None, limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_documents", {}, lambda c: rt.list_documents(c, deal=deal, limit=limit, offset=offset))

    @tool("northsea_get_document_metadata", "Get document metadata")
    async def document(document_id: Annotated[str, Field(min_length=36, max_length=36)]) -> ReadResult:
        return await run("northsea_get_document_metadata", {"document_id": document_id}, lambda c: rt.document_metadata(c, document_id=document_id))

    @tool("northsea_get_verification_status", "Verification status")
    async def verification(reference: Annotated[str | None, Field(description="Optional counterparty or deal reference")] = None) -> ReadResult:
        return await run("northsea_get_verification_status", {}, lambda c: rt.verification_status(c, reference=reference))

    @tool("northsea_list_pending_approvals", "Pending approvals")
    async def approvals(limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_pending_approvals", {}, lambda c: rt.pending_approvals(c, limit=limit, offset=offset))

    @tool("northsea_get_approval", "Get approval")
    async def approval(approval_id: Annotated[str, Field(min_length=36, max_length=36)]) -> ReadResult:
        return await run("northsea_get_approval", {"approval_id": approval_id}, lambda c: rt.get_approval(c, approval_id=approval_id))

    @tool("northsea_get_engine_status", "Communication Engine status")
    async def engine_status() -> ReadResult:
        return await run("northsea_get_engine_status", {}, rt.engine_status)

    @tool("northsea_get_live_operations", "Live operations view (running/waiting/approval/failed/next)")
    async def live_operations() -> ReadResult:
        return await run("northsea_get_live_operations", {}, rt.live_operations)

    @tool("northsea_list_followups", "Follow-up plans")
    async def followups(status: Literal["scheduled", "draft_created", "replied", "cancelled", "blocked", "expired"] | None = None,
                        deal: Annotated[str | None, Field(description="Deal code or UUID")] = None,
                        limit: Limit = 25, offset: Offset = 0) -> ReadResult:
        return await run("northsea_list_followups", {}, lambda c: rt.list_followups(c, status=status, deal=deal, limit=limit, offset=offset))

    @tool("northsea_get_market_context", "Market context")
    async def market() -> ReadResult:
        return await run("northsea_get_market_context", {}, rt.market_context)

    @tool("northsea_list_market_intelligence", "Market intelligence (captured supply/demand)")
    async def intel(commodity: str | None = None, days: Annotated[int, Field(ge=1, le=365)] = 90) -> ReadResult:
        return await run("northsea_list_market_intelligence", {}, lambda c: rt.market_intelligence(c, commodity=commodity, days=days))

    @tool("northsea_get_deal_metrics", "Deal metrics")
    async def deal_metrics() -> ReadResult:
        return await run("northsea_get_deal_metrics", {}, rt.deal_metrics)

    @tool("northsea_get_counterparty_metrics", "Counterparty metrics")
    async def party_metrics() -> ReadResult:
        return await run("northsea_get_counterparty_metrics", {}, rt.counterparty_metrics)

    @tool("northsea_get_communications_metrics", "Communications metrics")
    async def comm_metrics(weeks: Annotated[int, Field(ge=1, le=52)] = 12) -> ReadResult:
        return await run("northsea_get_communications_metrics", {}, lambda c: rt.communications_metrics(c, weeks=weeks))
