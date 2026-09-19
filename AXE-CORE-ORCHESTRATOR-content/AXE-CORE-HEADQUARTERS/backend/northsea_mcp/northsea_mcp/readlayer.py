"""De leeslaag: het hele operationele NorthSea-systeem, inzichtelijk voor een agent.

## Waarom dit bestand bestaat

De eerste MCP (service.py) was actiegericht: één deal beoordelen, onderzoeken,
een draft maken -- allemaal met een UUID die je al moest hebben. Een verse
ChatGPT-sessie kon daardoor niet eens de deals opsommen ("It doesn't currently
offer a way to list your contacts or deals").

Deze module geeft lijsten, details, rapporten en de canonieke dashboardcijfers.

## Eén bron, dezelfde regels als het dashboard

- De data komt uit dezelfde tabellen in AXE Commodities die de Global Trade
  Center leest (backend/axe_api/northsea.py). Er is geen MCP-eigen staat.
- Tellen, "actief", "geblokkeerd", routes en AXE Chase gaan via canon.py, een
  port van de TypeScript-regels met gedeelde pariteitstests.
- De dataset is klein (honderden rijen), dus de tabellen worden in hun geheel
  geladen en 30 seconden bewaard, net als het dashboard. Filteren en pagineren
  gebeurt daarna in Python. Zo kan een gefilterde lijst nooit een andere
  definitie hanteren dan het totaal. Een tabel boven 5000 rijen wordt gemeld als
  afgekapt, nooit stil.

## Wat hier NOOIT gebeurt

Schrijven. Elke functie hier is alleen-lezen; de bestaande goedkeuringspoorten
in service.py en policy.py blijven de enige weg naar een wijziging.
Identiteiten (bedrijfsnamen, contactnamen, e-mail, telefoon) zijn gemaskeerd
tenzij de aanroeper `northsea.identity` heeft -- dezelfde regel als review_deal.
"""
from __future__ import annotations

import asyncio
import re
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable

from . import canon
from .repository import SNAPSHOT_SELECT, RepositoryError, SupabaseRepository, UUID
from .service import Caller, NotFound, Redactor, ServiceError

CACHE_S = 30.0
MAX_LIMIT = 100
GATES = ("buyer", "seller", "commercial", "evidence", "protection", "introduction", "transaction", "fulfilment", "settlement")
GATE_CODES = {g: f"G{i}" for i, g in enumerate(GATES, 1)}
CORE_TABLES = ("opportunities", "companies", "buyer_requirements", "supplier_offers")
OPEN_TASK = ("open", "waiting", "in_progress")

# Het readiness-kader zoals Luka het wil zien. De database heeft een eigen
# `readiness_breakdown`; die wordt letterlijk doorgegeven, met dit kader ernaast.
READINESS_FRAMEWORK = [
    {"component": "buyer_verified", "max": 20}, {"component": "seller_verified", "max": 20},
    {"component": "product_quantity", "max": 15}, {"component": "logistics", "max": 10},
    {"component": "payment", "max": 15}, {"component": "authority", "max": 10},
    {"component": "northsea_protection", "max": 10},
]

MARKET_INSTRUMENTS = [
    # src/presentation/pages/northsea/tabs/MarktTab.tsx MARKTEN
    {"symbol": "XCUUSD", "label": "Copper", "group": "Metals", "plausible_band": [1, 20000]},
    {"symbol": "XAUUSD", "label": "Gold", "group": "Metals", "plausible_band": [400, 20000]},
    {"symbol": "XAGUSD", "label": "Silver", "group": "Metals", "plausible_band": [3, 500]},
    {"symbol": "BCOUSD", "label": "Brent Crude", "group": "Energy", "plausible_band": [10, 400]},
    {"symbol": "WTIUSD", "label": "WTI Crude", "group": "Energy", "plausible_band": [10, 400]},
    {"symbol": "DXY", "label": "US Dollar Index", "group": "Macro", "plausible_band": [40, 200]},
]


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def ts(v: Any) -> float:
    return canon._ts(v)


def _lower(v: Any) -> str:
    return v.strip().lower() if isinstance(v, str) else ""


def _since(v: str | None) -> float | None:
    if not v:
        return None
    t = ts(v)
    if not t:
        raise ServiceError("invalid_input", "updated_since must be an ISO 8601 timestamp, e.g. 2026-09-01T00:00:00Z.")
    return t


class Snapshot:
    def __init__(self, tables: dict[str, list[dict]], truncated: set[str], errors: dict[str, str], loaded_at: datetime, load_ms: int):
        self.t = tables
        self.truncated = truncated
        self.errors = errors
        self.loaded_at = loaded_at
        self.load_ms = load_ms
        self.by_id = {naam: {str(r.get("id")): r for r in rows} for naam, rows in tables.items()}

    def rows(self, table: str) -> list[dict]:
        return self.t.get(table, [])

    def get(self, table: str, id_: Any) -> dict | None:
        return self.by_id.get(table, {}).get(str(id_)) if id_ else None


class InspectService:
    def __init__(self, repo: SupabaseRepository, *, crew: Any = None, research: Any = None, auditor: Any = None,
                 cache_s: float = CACHE_S):
        self.repo = repo
        self.crew = crew
        self.research = research
        self.auditor = auditor  # optioneel: alleen voor observability (scheduler-status lezen), zie system_health()
        self.cache_s = cache_s
        self._snap: Snapshot | None = None
        self._t = 0.0
        self._lock = asyncio.Lock()

    # ── Laden ────────────────────────────────────────────────────────────────
    async def snapshot(self, fresh: bool = False) -> Snapshot:
        async with self._lock:
            if not fresh and self._snap and time.monotonic() - self._t < self.cache_s:
                return self._snap
            t0 = time.monotonic()
            namen = list(SNAPSHOT_SELECT)
            uit = await asyncio.gather(*(self.repo.fetch_all(n) for n in namen), return_exceptions=True)
            tables, truncated, errors = {}, set(), {}
            for naam, res in zip(namen, uit):
                if isinstance(res, BaseException):
                    tables[naam] = []
                    errors[naam] = "read failed" if isinstance(res, RepositoryError) else type(res).__name__
                else:
                    tables[naam], afgekapt = res
                    if afgekapt:
                        truncated.add(naam)
            if any(n in errors for n in CORE_TABLES):
                raise RepositoryError("core NorthSea tables could not be read")
            self._snap = Snapshot(tables, truncated, errors, datetime.now(timezone.utc), int((time.monotonic() - t0) * 1000))
            self._t = time.monotonic()
            return self._snap

    async def view(self, caller: Caller) -> "View":
        return View(await self.snapshot(), caller)


class View:
    """Eén snapshot gezien door één aanroeper: joins, maskering, regels."""

    def __init__(self, snap: Snapshot, caller: Caller):
        self.s = snap
        self.caller = caller
        self.red = Redactor(caller)
        for c in snap.rows("companies"):
            self.red.company(c, "[counterparty]")
        self.red.contacts(snap.rows("contacts"), "[contact]")
        self.now = snap.loaded_at
        self.generated_at = iso(snap.loaded_at)

    # ── Joins ────────────────────────────────────────────────────────────────
    def req(self, opp: dict) -> dict:
        return self.s.get("buyer_requirements", opp.get("buyer_requirement_id")) or {}

    def off(self, opp: dict) -> dict:
        return self.s.get("supplier_offers", opp.get("supplier_offer_id")) or {}

    def buyer(self, opp: dict) -> dict | None:
        return self.s.get("companies", self.req(opp).get("company_id"))

    def seller(self, opp: dict) -> dict | None:
        return self.s.get("companies", self.off(opp).get("company_id"))

    def map_row(self, opp: dict) -> dict:
        return canon.map_row(opp, self.req(opp), self.off(opp), self.buyer(opp), self.seller(opp))

    def company_deals(self, company_id: str) -> list[dict]:
        return [o for o in self.s.rows("opportunities")
                if self.req(o).get("company_id") == company_id or self.off(o).get("company_id") == company_id]

    # ── Integriteit ──────────────────────────────────────────────────────────
    def deal_flags(self, opp: dict) -> list[dict]:
        vlaggen = []
        for kant, rec, co in (("buyer_requirement", self.req(opp), self.buyer(opp)), ("supplier_offer", self.off(opp), self.seller(opp))):
            reden = canon.testcase_reason(rec, co) if rec else None
            if reden:
                vlaggen.append({"flag": "internal_testcase", "on": kant, "reason": reden})
            dnc = canon.do_not_contact_reason(co)
            if dnc:
                vlaggen.append({"flag": "do_not_contact", "on": kant.split("_")[0], "reason": dnc})
            review = canon.contact_review_reason(co)
            if review:
                vlaggen.append({"flag": "contact_review_required", "on": kant.split("_")[0], "reason": review})
        if opp.get("is_synthetic") is True:
            vlaggen.append({"flag": "internal_testcase", "on": "opportunity", "reason": f"Synthetic/test opportunity: {opp.get('synthetic_reason') or 'is_synthetic'}"})
        return vlaggen

    def company_flags(self, co: dict) -> list[dict]:
        vlaggen = []
        dnc = canon.do_not_contact_reason(co)
        if dnc:
            vlaggen.append({"flag": "do_not_contact", "reason": dnc})
        review = canon.contact_review_reason(co)
        if review:
            vlaggen.append({"flag": "contact_review_required", "reason": review})
        reden = canon.testcase_reason({"id": None, "notes": co.get("notes")}, co)
        if reden:
            vlaggen.append({"flag": "internal_testcase", "reason": reden})
        return vlaggen

    def is_testcase_deal(self, opp: dict) -> bool:
        return any(f["flag"] == "internal_testcase" for f in self.deal_flags(opp))

    # ── Weergave ─────────────────────────────────────────────────────────────
    def company_ref(self, co: dict | None, role: str | None = None) -> dict | None:
        if not co:
            return None
        focus = [str(x) for x in (co.get("commodity_focus") or [])][:3]
        ref: dict[str, Any] = {
            "counterparty_id": co.get("id"), "role": role or co.get("company_type"), "company_type": co.get("company_type"),
            "country": co.get("country"), "commodity_focus": focus,
            "verification_status": co.get("verification_status") or "unknown",
            "verification_meaning": canon.COMPANY_VERIFICATION.get(co.get("verification_status") or "", "No verification status recorded."),
            "verification_score": co.get("verification_score"),
        }
        if self.caller.identity:
            ref.update(name=co.get("company_name"), city=co.get("city"), website=co.get("website"))
        else:
            ref["name"] = " · ".join([x for x in ((role or co.get("company_type") or "counterparty").capitalize(),
                                                  co.get("country") or "country unknown", ", ".join(focus[:1])) if x])
            ref["identity_redacted"] = True
        vlaggen = self.company_flags(co)
        if vlaggen:
            ref["integrity_flags"] = vlaggen
        return ref

    def contact_ref(self, c: dict) -> dict:
        if self.caller.identity:
            return {"contact_id": c.get("id"), "full_name": c.get("full_name"), "role": c.get("role"), "email": c.get("email"),
                    "phone": c.get("phone"), "is_primary": c.get("is_primary"), "verification_status": c.get("verification_status")}
        return {"contact_id": c.get("id"), "role": c.get("role"), "is_primary": c.get("is_primary"),
                "has_email": bool(c.get("email")), "has_phone": bool(c.get("phone")),
                "verification_status": c.get("verification_status"), "identity_redacted": True}

    def deal_summary(self, opp: dict) -> dict:
        req, off = self.req(opp), self.off(opp)
        uit = {
            "deal_id": opp.get("id"), "deal": canon.deal_label(opp),
            "deal_code": opp.get("deal_priority") if canon.is_deal_code(opp.get("deal_priority")) else None,
            "stage": opp.get("stage"), "execution_state": opp.get("execution_state"),
            "qualification_status": opp.get("qualification_status"),
            "dashboard_state": canon.deal_state(opp), "active": canon.is_active(opp), "blocked": canon.is_blocked(opp),
            "is_executable_deal": False,
            "primary_blocker": self.red(opp.get("primary_blocker")) or None,
            "approval_required": bool(opp.get("approval_required")), "approval_type": opp.get("approval_type"),
            "readiness_score": opp.get("readiness_score"), "match_score": opp.get("match_score"),
            "commodity": off.get("commodity") or req.get("commodity"),
            "product": off.get("product") or req.get("product") or off.get("commodity") or req.get("commodity"),
            "volume_mt": off.get("quantity_mt") or req.get("quantity_mt"),
            "incoterm": req.get("incoterm") or off.get("incoterm"),
            "origin": off.get("origin") or None, "loading_port": off.get("loading_port") or None,
            "destination": req.get("destination") or None,
            "buyer": self.company_ref(self.buyer(opp), "buyer"), "supplier": self.company_ref(self.seller(opp), "supplier"),
            "next_action": self.red(opp.get("next_action") or opp.get("next_best_action")) or None,
            "next_action_at": opp.get("next_action_at"), "action_owner": opp.get("action_owner"),
            "waiting_since": opp.get("waiting_since"), "follow_up_count": opp.get("follow_up_count"),
            "automation_status": opp.get("automation_status"),
            "commission_agreement_status": opp.get("commission_agreement_status"),
            "estimated_value": opp.get("estimated_value"), "currency": opp.get("currency"),
            "created_at": opp.get("created_at"), "updated_at": opp.get("updated_at"),
        }
        vlaggen = self.deal_flags(opp)
        if vlaggen:
            uit["integrity_flags"] = vlaggen
        return uit

    def gates(self, opp: dict) -> list[dict]:
        bewijs = [e for e in self.s.rows("deal_evidence") if e.get("opportunity_id") == opp.get("id")]
        kant = {"buyer": "buyer", "seller": "seller", "commercial": None, "evidence": None}
        uit = []
        for g in GATES:
            relevant = [e for e in bewijs if kant.get(g) and _lower(e.get("party_side")) == kant[g]] if kant.get(g) else \
                (bewijs if g == "evidence" else [])
            klassen = Counter(canon.evidence_class(e.get("verification_status")) for e in relevant)
            uit.append({
                "gate": GATE_CODES[g], "name": g, "passed": bool(opp.get(f"{g}_gate_passed")),
                "status": "passed" if opp.get(f"{g}_gate_passed") else "not_passed",
                "evidence": {"records": len(relevant), **{k: klassen.get(k, 0) for k in ("verified", "partial", "unverified", "contradicted")},
                             "evidence_ids": [e.get("id") for e in relevant][:20]},
                "blocker": self.red(opp.get("primary_blocker")) or None if not opp.get(f"{g}_gate_passed") else None,
                "owner": None, "next_action": None, "passed_at": None,
            })
        return uit

    def chase(self) -> list[dict]:
        now = self.now
        deals = self.s.by_id["opportunities"]

        def deal_ctx(oid: Any) -> dict:
            o = deals.get(str(oid)) if oid else None
            if not o:
                return {"code": None, "product": None, "buyer": None, "supplier": None, "blocker": None, "next_action": None, "deal_id": None}
            b, s = self.buyer(o), self.seller(o)
            naam = (lambda c: (c or {}).get("company_name")) if self.caller.identity else (lambda c: None)
            return {"code": o.get("deal_priority"), "product": self.off(o).get("product") or self.req(o).get("product"),
                    "buyer": naam(b), "supplier": naam(s), "blocker": self.red(o.get("primary_blocker")),
                    "next_action": self.red(o.get("next_best_action")), "deal_id": o.get("id")}

        items = []
        for a in self.s.rows("action_queue"):
            if a.get("status") in ("open", "waiting"):
                items.append(canon.chase_item({**deal_ctx(a.get("opportunity_id")), "id": a.get("id"), "kind": a.get("action_type"),
                                               "title": self.red(a.get("title")), "status": a.get("status"), "priority": a.get("priority"),
                                               "requires_approval": a.get("requires_approval"), "due_at": a.get("due_at"),
                                               "created_at": a.get("created_at"), "updated_at": a.get("updated_at")}, "action", now))
        for t in self.s.rows("deal_tasks"):
            if t.get("status") == "open":
                items.append(canon.chase_item({**deal_ctx(t.get("opportunity_id")), "id": t.get("id"), "kind": t.get("task_type"),
                                               "title": self.red(t.get("title")), "status": t.get("status"), "priority": t.get("priority"),
                                               "requires_approval": t.get("requires_approval"), "due_at": t.get("due_at"),
                                               "error": t.get("execution_error"), "created_at": t.get("created_at"),
                                               "updated_at": t.get("updated_at")}, "task", now))
        for d in self.s.rows("reply_drafts"):
            if not d.get("sent_at") and d.get("approval_status") == "pending":
                items.append(canon.chase_item({**deal_ctx(d.get("opportunity_id")), "id": d.get("id"), "kind": d.get("purpose"),
                                               "title": self.red(d.get("subject")), "sensitive": d.get("sensitive_action"),
                                               "created_at": d.get("created_at"), "updated_at": d.get("updated_at")}, "draft", now))
        grens = (now - timedelta(days=30)).timestamp()
        for c in self.s.rows("communications"):
            if c.get("delivery_status") == "bounced" and ts(c.get("occurred_at")) > grens:
                items.append(canon.chase_item({**deal_ctx(c.get("opportunity_id")), "id": c.get("id"), "title": self.red(c.get("subject")),
                                               "to": None, "created_at": c.get("occurred_at")}, "bounce", now))
        return canon.sort_chase(items)

    def communication_summary(self, c: dict, full: bool = False) -> dict:
        ei = self.intel(c.get("id"))
        co = self.s.get("companies", c.get("company_id"))
        opp = self.s.get("opportunities", c.get("opportunity_id"))
        body = self.red(c.get("body"))
        uit = {
            "communication_id": c.get("id"), "direction": c.get("direction"), "channel": c.get("channel"),
            "occurred_at": c.get("occurred_at"), "delivery_status": c.get("delivery_status") or "not_tracked",
            "delivery_status_at": c.get("delivery_status_at"),
            "subject": self.red(c.get("subject")), "counterparty": self.company_ref(co),
            "contact": self.contact_ref(self.s.get("contacts", c.get("contact_id"))) if c.get("contact_id") and self.s.get("contacts", c.get("contact_id")) else None,
            "deal_id": c.get("opportunity_id"), "deal": canon.deal_label(opp) if opp else None,
            "thread_key": thread_key(c),
            "is_synthetic": bool(c.get("is_synthetic")),
            "mapping": {"status": c.get("mapping_status"), "basis": c.get("mapping_basis"), "candidates": c.get("mapping_candidates")}
                       if c.get("mapping_status") else None,
            "analysis": None,
        }
        if c.get("direction") == "outbound":
            # Historische onbekenden blijven onbekend (null), nooit ingevuld.
            uit["provenance"] = {"from": c.get("from_address"), "reply_to": c.get("reply_to_address"), "transport": c.get("transport"),
                                 "provider_message_id": c.get("external_message_id"), "actor": c.get("actor"), "actor_type": c.get("actor_type"),
                                 "approval_basis": c.get("approval_basis"), "reply_draft_id": c.get("reply_draft_id"),
                                 "recorded": bool(c.get("approval_basis"))}
        uit["body" if full else "preview"] = body if full else body[:280]
        if ei:
            uit["analysis"] = {
                "classification": ei.get("classification"), "commercial_intent": ei.get("commercial_intent"), "urgency": ei.get("urgency"),
                "risk_level": ei.get("risk_level"), "qualification_score": ei.get("qualification_score"),
                "summary": self.red(ei.get("summary")), "recommended_action": self.red(ei.get("recommended_action")),
                "requires_human_approval": ei.get("requires_human_approval"), "status": ei.get("status"), "analyzed_at": ei.get("analyzed_at"),
                **({"extracted_terms": ei.get("extracted_terms"), "missing_information": ei.get("missing_information"),
                    "red_flags": ei.get("red_flags")} if full else {}),
            }
        drafts = [d for d in self.s.rows("reply_drafts") if d.get("communication_id") == c.get("id")]
        if drafts:
            uit["reply_drafts"] = [{"draft_id": d.get("id"), "approval_status": d.get("approval_status"), "lifecycle_state": d.get("lifecycle_state"),
                                    "approval_actor_type": d.get("approval_actor_type"), "approval_channel": d.get("approval_channel"),
                                    "sent_at": d.get("sent_at"), "sensitive_action": d.get("sensitive_action"), "subject": self.red(d.get("subject"))}
                                   for d in drafts]
        call = next((x for x in self.s.rows("call_intelligence") if x.get("communication_id") == c.get("id")), None)
        if call:
            uit["call"] = {k: call.get(k) for k in ("call_status", "duration_seconds", "caller_type", "commodity", "product", "quantity_mt",
                                                    "destination", "incoterm", "urgency", "requires_human_review")}
            uit["call"]["summary"] = self.red(call.get("summary"))
        return uit

    def intel(self, communication_id: Any) -> dict | None:
        rijen = [e for e in self.s.rows("email_intelligence") if e.get("communication_id") == communication_id]
        return max(rijen, key=lambda e: ts(e.get("analyzed_at") or e.get("created_at"))) if rijen else None


# ── Hulpfuncties ────────────────────────────────────────────────────────────
_RE_PREFIX = re.compile(r"^\s*((re|fw|fwd|aw|wg)\s*:\s*)+", re.I)


def thread_key(c: dict) -> str:
    """Een gesprek = zelfde deal (of anders zelfde bedrijf) + onderwerp zonder Re:/Fwd:.

    NorthSea bewaart geen In-Reply-To-keten (communications heeft alleen
    external_message_id), dus dit is een afgeleide sleutel en dat staat erbij.
    """
    onderwerp = _RE_PREFIX.sub("", (c.get("subject") or "").strip()).lower()
    anker = c.get("opportunity_id") or c.get("company_id") or "none"
    return f"{anker}|{onderwerp[:120]}"


def page(items: list[dict], *, limit: int, offset: int) -> tuple[list[dict], dict]:
    limit = max(1, min(int(limit or 25), MAX_LIMIT))
    offset = max(0, int(offset or 0))
    stuk = items[offset:offset + limit]
    volgende = offset + limit if offset + limit < len(items) else None
    return stuk, {"returned": len(stuk), "total": len(items), "limit": limit, "offset": offset, "next_offset": volgende}


def resolve_one(kind: str, ref: str, rows: Iterable[dict], *, id_field: str = "id",
                exact: Callable[[dict], Iterable[str]] = lambda r: (), fuzzy: Callable[[dict], Iterable[str]] = lambda r: (),
                label: Callable[[dict], str] = lambda r: str(r.get("id"))) -> dict:
    """UUID, dan exacte naam/code, dan unieke deelnaam. Nooit gokken bij twijfel."""
    r = (ref or "").strip()
    if not r:
        raise ServiceError("invalid_input", f"Provide a {kind} reference.")
    rows = list(rows)
    if UUID.match(r):
        hit = next((x for x in rows if str(x.get(id_field)).lower() == r.lower()), None)
        if not hit:
            raise NotFound(kind)
        return hit
    laag = r.lower().lstrip("#")
    exacte = [x for x in rows if laag in {v.strip().lower() for v in exact(x) if isinstance(v, str)}]
    if not exacte and re.fullmatch(r"[0-9a-f]{6,35}", laag):
        exacte = [x for x in rows if str(x.get(id_field)).lower().startswith(laag)]
    if len(exacte) == 1:
        return exacte[0]
    kandidaten = exacte or [x for x in rows if any(laag in v.lower() for v in fuzzy(x) if isinstance(v, str))]
    if len(kandidaten) == 1:
        return kandidaten[0]
    if not kandidaten:
        raise NotFound(f"{kind} '{r}'")
    lijst = "; ".join(f"{label(x)} ({x.get(id_field)})" for x in kandidaten[:8])
    raise ServiceError("ambiguous_reference", f"'{r}' matches {len(kandidaten)} {kind}s: {lijst}. Use one of these ids.")
