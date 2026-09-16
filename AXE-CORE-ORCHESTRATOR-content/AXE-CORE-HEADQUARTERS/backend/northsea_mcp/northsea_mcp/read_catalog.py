"""Catalogus van de leestools: naam, benodigde scope en de beschrijving die een
verse client (ChatGPT) ziet. Zonder imports, zodat policy.py hem kan lezen."""
from __future__ import annotations

# (naam, scope, beschrijving). De beschrijving is wat een verse ChatGPT-sessie ziet.
READ_TOOLS: list[tuple[str, str, str]] = [
    # SYSTEM
    ("northsea_get_trade_center_overview", "northsea.read",
     "START HERE for 'what is happening inside NorthSea'. One call returns the Global Trade Center headline counters (active deals, "
     "pipeline, blocked, awaiting approval, counterparties, verified counterparties), the top AXE Chase items that need attention, "
     "recent inbound messages, pending approvals, the canonical definitions of active/matched/blocked, and which tools to call next. "
     "Read-only."),
    ("northsea_get_system_health", "northsea.read",
     "Check whether the NorthSea backend is reachable: database reachability and load time, tables that failed or were truncated, "
     "CrewAI gateway configuration and research configuration, plus what this check does NOT cover. Read-only."),
    ("northsea_get_data_freshness", "northsea.read",
     "Per NorthSea table: row count and the timestamp of the most recent change, so you can tell how current the data behind the "
     "dashboard is. Read-only."),
    ("northsea_get_dashboard_snapshot", "northsea.read",
     "Canonical backend numbers behind all 10 AXE CORE Global Trade Center views (live_map, active_deals, pipeline, counterparties, "
     "communications, market_intel, documents, evidence, automation, reports). Each metric has its value, canonical definition, "
     "source tables and contributing record ids, so you can explain e.g. why the dashboard shows 24 active deals, which deals form "
     "the routes on the map, or why zero counterparties are verified. Optional view filters to one view. Data verification only, "
     "not a visual inspection of the app window. Read-only."),
    ("northsea_get_automation_status", "northsea.read",
     "NorthSea automation state: the deal automation policy (what may be sent automatically, what never), automation status per "
     "deal, recent automation events, and sourcing campaign statuses. Schedules themselves are not stored in this database. Read-only."),
    # DEALS
    ("northsea_list_deals", "northsea.deal.read",
     "List NorthSea opportunities/deals with filters for stage, execution_state (e.g. matched, qualifying), qualification_status, "
     "dashboard_state (active/matched/blocked/completed/other), deal code/priority, commodity, counterparty, blocked, "
     "approval_required, active, readiness range and updated_since; sortable and paginated. Each item shows deal code, state, "
     "blocker, next action, readiness, buyer and supplier (identities redacted without northsea.identity) and integrity flags. "
     "An opportunity is NOT an executable deal. Internal testcases are excluded unless include_testcases=true. Read-only."),
    ("northsea_get_deal", "northsea.deal.read",
     "Full canonical state of ONE deal by code (e.g. DEAL-001), UUID or '#idprefix': requirement and offer specs, gates G1-G9 with "
     "evidence counts, readiness score and stored breakdown, latest match assessment, open tasks, communications, evidence, "
     "documents, recent events and commission status. Read-only."),
    ("northsea_get_deal_readiness", "northsea.deal.read",
     "Readiness of ONE deal: stored score, the stored breakdown exactly as NorthSea computed it, and the target 100-point framework "
     "(buyer 20, seller 20, product/quantity 15, logistics 10, payment 15, authority 10, protection 10). Read-only."),
    ("northsea_get_deal_gates", "northsea.deal.read",
     "The nine NorthSea gates for ONE deal (G1 buyer, G2 seller, G3 commercial, G4 evidence, G5 protection, G6 introduction, "
     "G7 transaction, G8 fulfilment, G9 settlement) with passed/not passed and evidence counts by verification class. Read-only."),
    ("northsea_get_deal_blockers", "northsea.deal.read",
     "What blocks ONE deal: primary blocker, gates not passed, match-assessment blockers and missing information, open blocker tasks "
     "and integrity flags (internal testcase, do-not-contact). Read-only; to research a blocker use northsea_investigate_blockers."),
    ("northsea_get_deal_events", "northsea.deal.read",
     "Chronological event log of ONE deal (automation, status changes, communications, decisions), newest first, paginated. Read-only."),
    ("northsea_get_pipeline_summary", "northsea.deal.read",
     "Canonical pipeline calculations: pipeline (open), active, blocked, blocked-and-active, awaiting approval, won, counts by stage, "
     "execution state, qualification status, readiness bucket and gates passed, with definitions and record ids. Same rules as the "
     "Global Trade Center. Read-only."),
    # COUNTERPARTIES
    ("northsea_list_counterparties", "northsea.read",
     "List NorthSea counterparties (companies): the same population as the Counterparties tab. Filters: company_type (buyer, "
     "supplier, ...), verification_status (verified/reviewing/unverified/rejected), country, commodity, search, has_open_deals, "
     "do_not_contact, updated_since; paginated. Names are redacted without northsea.identity. 'reviewing' is not verified. Read-only."),
    ("northsea_get_counterparty", "northsea.read",
     "Full profile of ONE counterparty by name or UUID: verification status and checks, contacts, buyer requirements, supplier offers, "
     "opportunities, and integrity flags such as do-not-contact. Read-only."),
    ("northsea_list_buyers", "northsea.read", "List counterparties whose company_type is buyer, with verification status, country, commodity focus and open deal counts "
     "(same filters as northsea_list_counterparties; names redacted without northsea.identity). Read-only."),
    ("northsea_list_suppliers", "northsea.read", "List counterparties whose company_type is supplier, with verification status, country, commodity focus and open deal counts "
     "(same filters as northsea_list_counterparties; names redacted without northsea.identity). Read-only."),
    ("northsea_get_counterparty_evidence", "northsea.read",
     "Verification checks and deal evidence connected to ONE counterparty, with verification classes (verified, partial, "
     "unverified, contradicted) and provenance. Only verified counts as verified. Read-only."),
    ("northsea_get_counterparty_communications", "northsea.read",
     "Communications with ONE counterparty, newest first, with analysis (classification, intent, urgency). Paginated. Read-only."),
    ("northsea_get_counterparty_opportunities", "northsea.read", "All opportunities (open and lost) in which ONE counterparty is the buyer or the supplier, with deal code, stage, "
     "dashboard state, blocker and readiness. An opportunity is not an executable deal. Read-only."),
    # COMMUNICATIONS
    ("northsea_list_communications", "northsea.read",
     "List NorthSea communications (email via trade@northseacommodity.com / Resend, calls, other channels) with filters: direction "
     "(inbound/outbound/internal), channel, delivery_status (delivered, bounced, failed, not_tracked), counterparty, deal, "
     "classification, urgency, since, has_analysis. Each item includes the email-intelligence analysis when present. Paginated. Read-only."),
    ("northsea_get_communication", "northsea.read",
     "ONE communication by UUID or provider message id: full body (redacted without northsea.identity), classification, intent, "
     "urgency, risk, summary, extracted commercial terms, missing information, red flags, recommended action, reply drafts, call "
     "details and attachment metadata. Read-only."),
    ("northsea_list_recent_inbound", "northsea.read", "Inbound communications (email, calls, other channels) of the last N days (default 7), newest first, with classification, "
     "urgency, linked deal and counterparty. Answers 'what came in recently'. Paginated. Read-only."),
    ("northsea_get_communication_thread", "northsea.read",
     "All messages in the same conversation as ONE communication (derived: same deal or counterparty + same subject without Re:/Fwd:). Read-only."),
    ("northsea_list_failed_or_bounced_communications", "northsea.read",
     "Outbound messages whose delivery failed according to the stored delivery status: bounced, failed, complained or delayed, "
     "with deal, counterparty and recipient domain so they can be chased. Paginated. Read-only."),
    ("northsea_summarize_inbound", "northsea.read",
     "Aggregate of inbound messages in the last N days (default 14): counts by classification, urgency and risk, how many were not "
     "analysed or not linked to a deal, and the messages that need human attention. Read-only."),
    # TASKS
    ("northsea_list_tasks", "northsea.deal.read",
     "List NorthSea tasks from deal_tasks and action_queue. Filters: status (open = open/waiting/in_progress, any, or a specific "
     "status), source, deal, requires_approval, overdue, owner. Overdue first. Paginated. Read-only; to create or update use "
     "northsea_create_task / northsea_update_task."),
    ("northsea_get_task", "northsea.deal.read", "ONE task by UUID from deal_tasks or action_queue, with type, status, priority, owner, due date, approval requirement, "
     "linked deal, description and result. Read-only; update with northsea_update_task."),
    ("northsea_list_overdue_tasks", "northsea.deal.read", "Open tasks (deal_tasks and action_queue with status open, waiting or in_progress) whose due date has passed, most overdue "
     "first, with linked deal and owner. Paginated. Read-only."),
    ("northsea_list_pending_actions", "northsea.deal.read",
     "The AXE Chase list: everything that needs chasing, ranked (bounces, failed executions, overdue actions, approvals, ready drafts, "
     "waiting replies, next actions), with critical/new/overdue flags. Filter only=critical|new|overdue. Read-only."),
    # EVIDENCE / DOCUMENTS
    ("northsea_list_evidence", "northsea.deal.read",
     "List deal evidence with filters for deal, party_side, evidence_type and verification_class (verified, partial, unverified, "
     "contradicted). Only 'verified' counts as verified. Paginated. Read-only."),
    ("northsea_get_evidence", "northsea.deal.read", "ONE deal evidence record by UUID: claim, party side, evidence type, verification class, source type and provenance. "
     "Unverified evidence never counts as verification. Read-only."),
    ("northsea_list_documents", "northsea.deal.read",
     "Deal documents and inbound email attachment metadata (type, name, size, status, linked deal and message; never file "
     "contents), optionally for one deal. Paginated. Read-only."),
    ("northsea_get_document_metadata", "northsea.deal.read", "Metadata of ONE deal document or inbound email attachment by UUID: type, file name, size, status, linked deal and "
     "communication. File contents are never returned. Read-only."),
    ("northsea_get_verification_status", "northsea.read",
     "Verification overview. Without reference: counterparties by verification status, evidence by class, checks by status, and why "
     "zero may be verified. With a counterparty or deal reference: its verification detail. Read-only."),
    # APPROVALS
    ("northsea_list_pending_approvals", "northsea.read",
     "Everything waiting for Luka's decision: pending unsent reply drafts (sensitive ones flagged), opportunities with "
     "approval_required, open tasks that require approval, and inbound messages flagged for human review. Only lists; approving a "
     "draft is northsea_approve_draft (northsea.admin). Read-only."),
    ("northsea_get_approval", "northsea.read", "ONE pending approval by id (reply draft, deal, task or flagged inbound message); for a reply draft includes the exact text "
     "awaiting approval and whether it is sensitive. Does not approve anything. Read-only."),
    # INTELLIGENCE
    ("northsea_get_market_context", "northsea.read",
     "Which market instruments the Global Trade Center tracks (copper, gold, silver, Brent, WTI, DXY), where its prices come from and "
     "why the MCP does not return prices. Market data is context, never a deal fact. Read-only."),
    ("northsea_list_market_intelligence", "northsea.read",
     "Captured supply and demand in NorthSea by commodity (active buyer requirements and supplier offers, volumes) and recent captures, "
     "with internal testcases excluded and listed separately. Captured leads are not verified demand. Read-only."),
    # REPORTING
    ("northsea_get_deal_metrics", "northsea.deal.read",
     "Deal metrics for reporting: the pipeline summary plus commission truth (secured commission records, signed agreements, deals with "
     "recorded amounts/values). Unknown stays null; nothing is estimated. Read-only."),
    ("northsea_get_counterparty_metrics", "northsea.read",
     "Counterparty metrics: totals by type, verification status and country, counterparties with open deals, do-not-contact list. Read-only."),
    ("northsea_get_communications_metrics", "northsea.read",
     "Communication metrics: weekly inbound/outbound, channels, outbound email delivery states, bounces, inbound analysis coverage and "
     "reply-draft statuses. Read-only."),
]
READ_TOOL_SCOPES = {naam: scope for naam, scope, _ in READ_TOOLS}
DESCRIPTIONS = {naam: beschrijving for naam, _, beschrijving in READ_TOOLS}
