"""Nepversies van repository, onderzoek, crew en audit, met realistische NorthSea-data.

De data volgt het echte schema van AXE Commodities (gemeten 15 sep 2026) en de
echte vorm van de copper-cathode-deals. Namen zijn verzonnen maar herkenbaar
genoeg om maskering te testen: "Mopani" mag nergens in een gemaskeerd antwoord staan.
"""
from __future__ import annotations

import copy
import uuid
from datetime import datetime, timedelta, timezone

from northsea_mcp.models import CrewRunInfo, SourceRef
from northsea_mcp.repository import uid
from northsea_mcp.research import Answer, ResearchError, SearchHit, SearchResult


def ts(delta_h: float = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=delta_h)).isoformat()


BUYER_CO = "11111111-1111-4111-8111-111111111111"
SELLER_CO = "22222222-2222-4222-8222-222222222222"
OTHER_SELLER_CO = "23232323-2323-4323-8323-232323232323"
REQ = "33333333-3333-4333-8333-333333333333"
OFFER = "44444444-4444-4444-8444-444444444444"
OTHER_OFFER = "45454545-4545-4545-8545-454545454545"
OPP = "55555555-5555-4555-8555-555555555555"
COMM = "66666666-6666-4666-8666-666666666666"
DRAFT_PENDING = "77777777-7777-4777-8777-777777777777"
DRAFT_APPROVED = "78787878-7878-4878-8878-787878787878"
DRAFT_SENSITIVE = "79797979-7979-4979-8979-797979797979"
TASK = "88888888-8888-4888-8888-888888888888"
CONTACT_S = "99999999-9999-4999-8999-999999999999"
CONTACT_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def seed() -> dict[str, list[dict]]:
    buyer = {"id": BUYER_CO, "company_name": "Qinzhou Harbour Metals Ltd", "country": "China", "city": "Qinzhou",
             "website": "https://qhmetals.cn", "company_type": "buyer", "commodity_focus": ["copper cathode"],
             "source_url": None, "verification_status": "unverified", "verification_score": 20, "updated_at": ts(-5)}
    seller = {"id": SELLER_CO, "company_name": "Mopani Copper Mines PLC", "country": "Zambia", "city": "Kitwe",
              "website": "https://mopani.com", "company_type": "supplier", "commodity_focus": ["copper cathode"],
              "source_url": None, "verification_status": "unverified", "verification_score": 35, "trade_activity": "Mopani states monthly cathode output",
              "updated_at": ts(-3)}
    other = {"id": OTHER_SELLER_CO, "company_name": "Zambezi Refining Co", "country": "Zambia", "website": "https://zambezirefining.example",
             "company_type": "supplier", "commodity_focus": ["copper cathode"], "verification_status": "verified", "verification_score": 80}
    req = {"id": REQ, "company_id": BUYER_CO, "commodity": "Copper", "product": "Copper Cathode", "grade": "LME Grade A",
           "purity": 99.99, "quantity_mt": 500, "frequency": "monthly", "destination": "Qinzhou, China", "incoterm": "CIF",
           "payment_terms": "LC at sight", "origin_preference": "Zambia", "required_delivery": None, "status": "active",
           "updated_at": ts(-10)}
    offer = {"id": OFFER, "company_id": SELLER_CO, "commodity": "Copper", "product": "Copper Cathode", "grade": "LME Grade A",
             "purity": 99.99, "origin": "Zambia", "quantity_mt": 600, "monthly_capacity_mt": 600, "loading_port": None,
             "incoterm": "CIF", "payment_terms": "Letter of credit", "price_basis": None, "mandate_status": "claimed, unverified",
             "status": "active", "updated_at": ts(-9)}
    other_offer = {"id": OTHER_OFFER, "company_id": OTHER_SELLER_CO, "commodity": "Copper", "product": "Copper Cathode",
                   "grade": "Grade A", "purity": 99.99, "origin": "Zambia", "quantity_mt": 1000, "incoterm": "FOB",
                   "payment_terms": "TT", "mandate_status": "producer verified", "status": "active"}
    opp = {"id": OPP, "buyer_requirement_id": REQ, "supplier_offer_id": OFFER, "match_score": 100, "stage": "identified",
           "execution_state": "qualifying", "qualification_status": "in_progress", "deal_priority": "DEAL-001",
           "primary_blocker": "Seller authority from Mopani not verified", "blocker_search_query": "Mopani Copper Mines cathode sales authority",
           "next_best_action": "Await Mopani routing response; request sales contact and live allocation.",
           "next_action": "Follow up with Mopani sales desk", "next_action_at": ts(-2), "commission_agreement_status": "not_started",
           "approval_required": False, "action_owner": "axe", "waiting_since": ts(-100), "readiness_score": 39,
           **{f"{g}_gate_passed": False for g in ("buyer", "seller", "commercial", "evidence", "protection", "introduction",
                                                   "transaction", "fulfilment", "settlement")},
           "updated_at": ts(-1)}
    return {
        "companies": [buyer, seller, other],
        "contacts": [
            {"id": CONTACT_S, "company_id": SELLER_CO, "full_name": "Chanda Mwale", "role": "Sales Manager", "email": "chanda@mopani.com",
             "phone": "+260 212 123456", "is_primary": True, "verification_status": "unverified"},
            {"id": CONTACT_B, "company_id": BUYER_CO, "full_name": "Li Wei", "role": "Procurement", "email": "li.wei@qhmetals.cn",
             "phone": None, "is_primary": True, "verification_status": "unverified"},
        ],
        "buyer_requirements": [req],
        "supplier_offers": [offer, other_offer],
        "opportunities": [opp],
        "verification_checks": [{"id": str(uuid.uuid4()), "company_id": SELLER_CO, "check_type": "registry", "status": "pending",
                                 "source_url": "https://mopani.com/about", "checked_at": ts(-20)}],
        "communications": [{"id": COMM, "company_id": SELLER_CO, "contact_id": CONTACT_S, "opportunity_id": OPP, "direction": "inbound",
                            "channel": "email", "subject": "Re: Mopani cathode allocation",
                            "body": "Dear team, Chanda Mwale here from Mopani. We can supply 800 MT monthly FOB Ndola. Can you confirm the destination port? Payment by TT only.",
                            "occurred_at": ts(-4), "delivery_status": None}],
        "email_intelligence": [{"communication_id": COMM, "classification": "supplier", "extracted_terms": {"quantity_mt": 800, "incoterm": "FOB", "payment_terms": "TT"},
                                "missing_information": ["loading point / delivery capability"], "red_flags": [],
                                "recommended_action": "Verify legal seller entity and authority for Mopani before any introduction.",
                                "requires_human_approval": False}],
        "call_intelligence": [],
        "deal_evidence": [{"id": str(uuid.uuid4()), "opportunity_id": OPP, "party_side": "seller", "evidence_type": "company_registration",
                           "claim": "Mopani is registered in Zambia", "verification_status": "unverified", "source_type": "web", "created_at": ts(-30)}],
        "deal_tasks": [{"id": TASK, "opportunity_id": OPP, "task_type": "resolve_blocker", "title": "Verify Mopani seller authority",
                        "status": "open", "priority": 90, "owner": "axe", "requires_approval": False, "due_at": ts(-1),
                        "result": None, "updated_at": ts(-6), "created_at": ts(-6)}],
        "action_queue": [{"id": str(uuid.uuid4()), "opportunity_id": OPP, "action_type": "qualify_match", "title": "Qualify buyer",
                          "status": "open", "priority": 60, "requires_approval": False, "due_at": ts(30)}],
        "deal_events": [],
        "deal_documents": [],
        "match_assessments": [],
        "reply_drafts": [
            {"id": DRAFT_PENDING, "communication_id": COMM, "company_id": SELLER_CO, "contact_id": CONTACT_S, "opportunity_id": OPP,
             "to_email": "chanda@mopani.com", "subject": "Re: allocation", "body": "Please confirm the loading point.",
             "approval_status": "pending", "sensitive_action": False, "sent_at": None, "resend_email_id": None, "updated_at": ts(-2),
             "created_at": ts(-2)},
            {"id": DRAFT_APPROVED, "communication_id": COMM, "company_id": SELLER_CO, "contact_id": CONTACT_S, "opportunity_id": OPP,
             "to_email": "chanda@mopani.com", "subject": "Re: documents", "body": "Please share the COA.", "approval_status": "approved",
             "approval_actor_type": "human", "approved_by": "acff7a12-1111-481d-a7a9-cc07583b8069", "approval_channel": "deal_desk",
             "lifecycle_state": "human_approved",
             "approved_at": ts(-1), "sensitive_action": False, "sent_at": None, "resend_email_id": None, "updated_at": ts(-1), "created_at": ts(-3)},
            {"id": DRAFT_SENSITIVE, "communication_id": COMM, "company_id": SELLER_CO, "contact_id": CONTACT_S, "opportunity_id": OPP,
             "to_email": "chanda@mopani.com", "subject": "Introduction", "body": "We will introduce you to the buyer.",
             "approval_status": "pending", "sensitive_action": True, "sent_at": None, "resend_email_id": None, "updated_at": ts(-1), "created_at": ts(-1)},
        ],
        "deal_automation_policy": [{"id": 1, "auto_send_qualification": False, "auto_reply_nonbinding": False, "auto_send_followups": False,
                                    "auto_disclose_counterparty_identity": False, "followup_interval_hours": 48, "max_auto_followups": 3}],
        "northsea_followups": [],
        "northsea_audit_events": [],
    }


class FakeRepo:
    def __init__(self):
        self.t = seed()
        self.sends: list[str] = []
        self.fail_reads = False
        self.guard_block = False
        self.engine_writes: list[tuple[str, str]] = []

    def _find(self, table: str, **eq) -> list[dict]:
        if self.fail_reads:
            from northsea_mcp.repository import RepositoryError
            raise RepositoryError("database read failed (simulated)")
        return [copy.deepcopy(r) for r in self.t[table] if all(r.get(k) == v for k, v in eq.items())]

    def _by_id(self, table: str, id_: str) -> dict | None:
        rows = self._find(table, id=uid(id_))
        return rows[0] if rows else None

    async def ping(self):
        return True

    async def engine_insert(self, table, row, *, on_conflict=None, ignore_duplicates=False):
        from northsea_mcp.repository import RepositoryError
        assert table in {"email_intelligence", "opportunities", "northsea_followups", "reply_drafts", "action_queue", "contacts", "deal_evidence",
                         "deal_events", "northsea_audit_events"}
        rows = self.t.setdefault(table, [])
        if self.guard_block and table == "reply_drafts":
            raise RepositoryError("database write failed for reply_drafts (400): NS_CONTACT_POLICY: draft blocked (bounced_channel)")
        if on_conflict:
            sleutels = on_conflict.split(",")
            if any(all(r.get(k) == row.get(k) for k in sleutels) for r in rows):
                if ignore_duplicates:
                    return []
                raise RepositoryError(f"database write failed for {table} (409): duplicate")
        if table == "action_queue" and row.get("dedupe_key") and any(r.get("dedupe_key") == row["dedupe_key"] and r.get("status") in ("open", "waiting", "in_progress") for r in rows):
            return [] if ignore_duplicates else None
        if table == "deal_evidence" and any((r.get("opportunity_id"), r.get("evidence_type"), r.get("source_reference")) == (row.get("opportunity_id"), row.get("evidence_type"), row.get("source_reference")) for r in rows):
            return []
        nieuw = {"id": str(uuid.uuid4()), "created_at": ts(), "updated_at": ts(), **copy.deepcopy(row)}
        rows.append(nieuw)
        self.engine_writes.append((table, "insert"))
        return [copy.deepcopy(nieuw)]

    async def engine_patch(self, table, filters, body):
        rows = self.t.setdefault(table, [])
        (sleutel, waarde), = filters.items()
        doel = waarde.removeprefix("eq.")
        hits = [r for r in rows if str(r.get(sleutel)) == doel]
        for r in hits:
            r.update(copy.deepcopy(body))
        self.engine_writes.append((table, "patch"))
        return copy.deepcopy(hits)

    async def fetch_all(self, table, max_rows=5000):
        from northsea_mcp.repository import SNAPSHOT_SELECT
        assert table in SNAPSHOT_SELECT
        return (self._find(table) if table in self.t else []), False

    async def get_company(self, i):
        return self._by_id("companies", i)

    async def get_requirement(self, i):
        r = self._by_id("buyer_requirements", i)
        if r:
            r["companies"] = self._by_id("companies", r["company_id"])
        return r

    async def get_offer(self, i):
        r = self._by_id("supplier_offers", i)
        if r:
            r["companies"] = self._by_id("companies", r["company_id"])
        return r

    async def get_opportunity(self, i):
        o = self._by_id("opportunities", i)
        if o:
            o["buyer_requirements"] = await self.get_requirement(o["buyer_requirement_id"])
            o["supplier_offers"] = await self.get_offer(o["supplier_offer_id"])
        return o

    async def list_contacts(self, company_id):
        return self._find("contacts", company_id=uid(company_id))

    async def list_verification_checks(self, company_id):
        return self._find("verification_checks", company_id=uid(company_id))

    async def list_company_offers(self, company_id):
        return self._find("supplier_offers", company_id=uid(company_id))

    async def list_company_requirements(self, company_id):
        return self._find("buyer_requirements", company_id=uid(company_id))

    async def list_communications(self, *, opportunity_id=None, company_id=None, limit=10):
        if opportunity_id:
            return self._find("communications", opportunity_id=uid(opportunity_id))[:limit]
        if company_id:
            return self._find("communications", company_id=uid(company_id))[:limit]
        return []

    async def get_communication(self, i):
        return self._by_id("communications", i)

    async def get_email_intelligence(self, cid):
        r = self._find("email_intelligence", communication_id=uid(cid))
        return r[0] if r else None

    async def get_call_intelligence(self, cid):
        r = self._find("call_intelligence", communication_id=uid(cid))
        return r[0] if r else None

    async def list_drafts_for_communication(self, cid):
        return self._find("reply_drafts", communication_id=uid(cid))

    async def list_evidence(self, oid):
        return self._find("deal_evidence", opportunity_id=uid(oid))

    async def list_deal_tasks(self, oid, open_only=False):
        rows = self._find("deal_tasks", opportunity_id=uid(oid))
        return [r for r in rows if not open_only or r["status"] in ("open", "waiting", "in_progress")]

    async def get_task(self, i):
        return self._by_id("deal_tasks", i)

    async def list_action_queue(self, oid):
        return [r for r in self._find("action_queue", opportunity_id=uid(oid)) if r["status"] in ("open", "waiting")]

    async def list_deal_events(self, oid, limit=10):
        return self._find("deal_events", opportunity_id=uid(oid))[:limit]

    async def get_match_assessment(self, rid, oid):
        r = self._find("match_assessments", buyer_requirement_id=uid(rid), supplier_offer_id=uid(oid))
        return r[0] if r else None

    async def find_opportunity_for_pair(self, rid, oid):
        r = self._find("opportunities", buyer_requirement_id=uid(rid), supplier_offer_id=uid(oid))
        return {"id": r[0]["id"], "stage": r[0]["stage"]} if r else None

    async def list_active_offers(self, limit=200):
        return [{**o, "companies": self._by_id("companies", o["company_id"])} for o in self._find("supplier_offers") if o["status"] in ("draft", "active", "paused", "matched")]

    async def list_active_requirements(self, limit=200):
        return [{**r, "companies": self._by_id("companies", r["company_id"])} for r in self._find("buyer_requirements") if r["status"] in ("draft", "active", "paused", "matched")]

    async def list_company_domains(self, limit=2000):
        return [{"id": c["id"], "company_name": c["company_name"], "website": c.get("website"), "source_url": c.get("source_url")} for c in self._find("companies")]

    async def get_policy(self):
        return self._find("deal_automation_policy")[0]

    async def get_draft(self, i):
        return self._by_id("reply_drafts", i)

    async def insert_deal_task(self, row):
        r = {"id": str(uuid.uuid4()), "created_at": ts(), "updated_at": ts(), "result": None, **row}
        self.t["deal_tasks"].append(r)
        return copy.deepcopy(r)

    async def update_deal_task(self, task_id, expected_updated_at, patch):
        for r in self.t["deal_tasks"]:
            if r["id"] == uid(task_id) and (not expected_updated_at or r["updated_at"] == expected_updated_at):
                r.update(patch)
                return copy.deepcopy(r)
        return None

    async def insert_reply_draft(self, row):
        if not row.get("communication_id"):
            # Zoals de echte tabel: reply_drafts.communication_id is NOT NULL.
            from northsea_mcp.repository import RepositoryError
            raise RepositoryError("database write failed for reply_drafts (400)")
        r = {"id": str(uuid.uuid4()), "created_at": ts(), "updated_at": ts(), "sent_at": None, "resend_email_id": None, **row}
        self.t["reply_drafts"].append(r)
        return copy.deepcopy(r)

    async def update_draft_if(self, draft_id, expected_updated_at, patch):
        for r in self.t["reply_drafts"]:
            if r["id"] == uid(draft_id) and r["updated_at"] == expected_updated_at:
                r.update(patch)
                return copy.deepcopy(r)
        return None

    async def insert_deal_event(self, row):
        self.t["deal_events"].append({"id": len(self.t["deal_events"]) + 1, "created_at": ts(), **row})

    async def insert_deal_document(self, row):
        r = {"id": str(uuid.uuid4()), "created_at": ts(), "updated_at": ts(), "file_path": None, "external_url": None, **row}
        self.t["deal_documents"].append(r)
        return copy.deepcopy(r)

    async def insert_opportunity(self, row):
        r = {"id": str(uuid.uuid4()), "created_at": ts(), "updated_at": ts(), "is_synthetic": False, **row}
        self.t["opportunities"].append(r)
        return copy.deepcopy(r)

    async def insert_match_assessment(self, row):
        r = {"id": str(uuid.uuid4()), "assessed_at": ts(), **row}
        self.t["match_assessments"].append(r)
        return copy.deepcopy(r)

    async def count_events_since(self, *, event_type, actor, since):
        return sum(1 for e in self.t["deal_events"] if e.get("event_type") == event_type and e.get("actor") == actor
                  and str(e.get("created_at") or "") >= since)

    async def find_crew_audit(self, event_id: str):
        if not event_id:
            return None
        for r in self.t.get("northsea_audit_events") or []:
            if r.get("action") == "crew_run" and (r.get("details") or {}).get("event_id") == event_id:
                return r
        return None

    async def outbound_block_reason(self, *, company_id=None, contact_id=None, email=None, opportunity_id=None):
        """Zelfde regels als northsea_outbound_block_reason in de database."""
        if self.fail_reads:
            from northsea_mcp.repository import RepositoryError
            raise RepositoryError("database read failed (simulated)")
        companies, contacts, rang = ({company_id} if company_id else set()), [], []
        for k in self.t["contacts"]:
            if (contact_id and k["id"] == contact_id) or (email and (k.get("email") or "").lower() == email.lower()):
                contacts.append(k)
                companies.add(k["company_id"])
        opp = next((o for o in self.t["opportunities"] if o["id"] == opportunity_id), None) if opportunity_id else None
        recs = []
        if opp:
            rang.append(2 if opp.get("is_synthetic") else 9)
            req = next((r for r in self.t["buyer_requirements"] if r["id"] == opp.get("buyer_requirement_id")), None)
            off = next((r for r in self.t["supplier_offers"] if r["id"] == opp.get("supplier_offer_id")), None)
            recs = [x for x in (req, off) if x]
            companies |= {x["company_id"] for x in recs}
        rang += [2 if x.get("is_synthetic") else 9 for x in recs]
        pol = {"do_not_contact": 1, "review_required": 3}
        for c in self.t["companies"]:
            if c["id"] in companies:
                rang += [pol.get(c.get("contact_policy"), 9), 2 if c.get("is_synthetic") else 9]
        rang += [pol.get(k.get("contact_policy"), 9) for k in contacts]
        return {1: "do_not_contact", 2: "synthetic", 3: "review_required"}.get(min(rang, default=9))

    async def send_approved_reply(self, draft_id, requested_by=None):
        """Gedraagt zich als de echte edge function send-approved-reply (v7)."""
        for r in self.t["reply_drafts"]:
            if r["id"] == uid(draft_id):
                if r["approval_status"] != "approved":
                    return {"ok": False, "error": "draft_not_approved", "_status": 409}
                if r.get("approval_actor_type") != "human" or not r.get("approved_by"):
                    return {"ok": False, "error": "human_approval_provenance_missing", "_status": 409}
                if r["sent_at"] or r["resend_email_id"]:
                    return {"ok": True, "duplicate": True, "resend_email_id": r["resend_email_id"], "_status": 200}
                r["sent_at"] = ts()
                r["resend_email_id"] = f"re_{uuid.uuid4().hex[:12]}"
                self.sends.append(r["id"])
                comm = str(uuid.uuid4())
                return {"ok": True, "draft_id": r["id"], "communication_id": comm, "resend_email_id": r["resend_email_id"], "_status": 200}
        return {"ok": False, "error": "draft_not_found", "_status": 404}


class FakeResearch:
    def __init__(self, *, fail: ResearchError | None = None, search_fail: ResearchError | None = None):
        self.fail = fail
        self.search_fail = search_fail
        self.asks: list[str] = []
        self.searches: list[str] = []

    perplexity_configured = True
    search_configured = True

    async def ask(self, question, *, instructions, priority):
        self.asks.append(question)
        if self.fail:
            raise self.fail
        return Answer(
            text="Legal entity: Mopani Copper Mines PLC is registered in Zambia [web:1]. Contact Chanda Mwale at chanda@mopani.com. "
                 "Authority to sell cathode: not confirmed [web:2].",
            sources=[SourceRef(url="https://mopani.com/about", title="About Mopani", provider="perplexity", cited=True),
                     SourceRef(url="https://registry.example.zm/12345", title="Registry: Mopani Copper Mines PLC", provider="perplexity", cited=True),
                     SourceRef(url="https://news.example.com/zambia-copper", title="Zambia copper output", provider="perplexity", cited=False)],
            cost_usd=0.012, model="sonar")

    async def search(self, query, *, max_results, priority="P2"):
        self.searches.append(query)
        if self.search_fail:
            raise self.search_fail
        return SearchResult(provider="tavily", hits=[
            SearchHit("Mopani Copper Mines", "https://www.mopani.com/products", "Copper cathode producer in Zambia", 0.9),
            SearchHit("Kansanshi refinery copper cathode exporter", "https://kansanshi.example/cathode", "Copper cathode refinery exporter Grade A 99.99 Zambia", 0.8),
            SearchHit("Kansanshi again", "https://kansanshi.example/other", "duplicate domain", 0.5),
            SearchHit("Copper cathode trade leads", "https://tradekey.example/copper", "B2B marketplace broker copper cathode", 0.4),
        ][:max_results])


class FakeCrew:
    def __init__(self, available: bool = True):
        self._available = available
        self.runs: list[tuple[str, dict]] = []

    def available(self):
        return (self._available, "ok" if self._available else "CrewAI venv not present on this host")

    async def run(self, action, handoff):
        self.runs.append((action, handoff))
        return CrewRunInfo(used=True, crew="deal", run_id=str(uuid.uuid4()), status="ok",
                           analysis="Risk: Mopani Copper Mines PLC authority unproven; ask chanda@mopani.com for mandate.")

    def status(self) -> dict:
        return {"routes": {}, "fallback": {"backend": "axe_general_crew", "available": self._available, "permitted_reasons": []},
                "studio_optional": True}


class FakeAuditor:
    def __init__(self):
        self.rows: list[dict] = []
        self.schedule: dict | None = None  # test sets this to simulate core_schedules' northsea row

    async def record(self, *, tool, resource, principal, ip, details):
        self.rows.append({"tool": tool, "resource": resource, "principal": principal, "details": details})

    async def ping(self):
        return True

    async def flush(self):
        return 0

    async def get_schedule(self, app: str) -> dict | None:
        return self.schedule

    async def aclose(self):
        pass
