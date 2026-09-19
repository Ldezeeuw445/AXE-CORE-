"""NorthSeaService -- de gedeelde servicelaag. MCP, AXE CORE en (later) de crews
roepen DEZE methodes aan; niemand dupliceert wat hier staat.

## Wat deterministisch is en wat niet

Deal ophalen, gates tellen, blockers afleiden, acties rangschikken, matchen: dat
is data en regels, en dat gebeurt hier zonder model. Extern onderzoek gaat via
research.py (gedeeld dagbudget). CrewAI komt alleen bij `depth="deep"` en levert
ANALYSE, nooit feiten (crew.py).

## Identiteiten

Standaard ziet een aanroeper geen bedrijfs- of persoonsnamen, websites of
e-mailadressen van tegenpartijen: `PartyView.descriptor` beschrijft rol, land en
focus. Met scope `northsea.identity` komt de echte identiteit mee. Vrije tekst
(onderzoeksantwoorden, onderwerpen, samenvattingen) gaat door `Redactor`, zodat
een naam niet via een bijzin alsnog lekt.

## Wat hier NOOIT gebeurt

Geen bericht versturen buiten `send_approved_communication` (en die gaat via de
bestaande edge function). Geen gate op "passed" zetten. Geen claim op "verified".
Geen commissie, prijs of betaalvoorwaarde accepteren.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from . import matching
from . import orchestration
from .crew import PROHIBITED, CrewGateway
from .models import (
    Blocker, BlockerInvestigation, CandidateSearch, CandidateView, Claim, CounterpartyResearch, CrewRunInfo,
    DealReview, DedupeSummary, DraftApprovalResult, GateState, MatchAssessmentResult, NextActions, OutreachDraft,
    PartyView, QualificationResult, RankedAction, ReplyAnalysis, ResearchRun, SendResult, SourceRef, TaskResult,
)
from .policy import PolicyDenied, check_sensitive_draft, is_sensitive_text, may_see_identity
from .repository import SupabaseRepository
from .research import SEARCH_RESULTS_BY_PRIORITY, Budget, ResearchError, ResearchGateway, domain_of


class NotFound(Exception):
    def __init__(self, what: str):
        super().__init__(f"{what} not found")
        self.what = what


class ServiceError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Caller:
    principal: str
    client_id: str
    scopes: frozenset[str]

    @property
    def is_human(self) -> bool:
        """Een ingelogde gebruiker (OAuth) en geen service-token (principal/client 'service:...')."""
        return not (self.principal.startswith("service:") or self.client_id.startswith("service:"))

    @property
    def identity(self) -> bool:
        return may_see_identity(self.scopes)


# Taken die op een DNC/synthetische deal WEL mogen (beoordelen/afsluiten); dezelfde lijst als de database-guard.
REVIEW_TASK_TYPES = frozenset({"dnc_review", "manual_review", "close_out", "contact_policy_review"})


def now() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


DEAL_CODE = re.compile(r"^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-\d{2,}[A-Z0-9-]*$")
EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<!\w)\+?\d[\d ().\-]{7,}\d")
ROLE_WORD = {"buyer": "Buyer", "supplier": "Supplier", "counterparty": "Counterparty"}
# Woorden die in bedrijfsnamen staan maar niemand identificeren. Wie hier een
# woord toevoegt, maakt maskering zwakker: alleen echt generieke termen.
GENERIEKE_NAAMWOORDEN = frozenset("""
copper cathode cathodes metal metals mining mines mine minerals mineral resources refining refinery refineries smelting
trading traders trade commodities commodity global international holdings holding group industries industrial company
limited corporation enterprises enterprise partners partner import export imports exports supply supplies logistics
harbour harbor port steel iron aluminium aluminum nickel zinc energy services solutions general investment investments
the and of for
""".split())
STATES = {"verified", "unverified", "reviewing", "rejected", "contradicted", "unknown"}

RESEARCH_INSTRUCTIONS = (
    "Only state facts supported by sources you cite with [web:N]. If something cannot be confirmed, write "
    "'not confirmed'. Never invent contacts, inventory, allocation, seller authority, pricing, payment terms, "
    "KYC status or readiness. Public web information is unverified. Be concise and group short bullet points "
    "under: Legal entity, Commodity activity, Locations and assets, People (public roles only), Red flags, Not confirmed."
)

SUPPLIER_GAPS = ["legal selling entity", "principal or authorised-seller status", "executable allocation / monthly capacity",
                 "origin, refinery or brand", "loading port and Incoterms", "accepted payment instruments",
                 "product documentation and inspection"]
BUYER_GAPS = ["legal buying entity and authorised contact", "exact grade and purity", "trial and recurring quantity",
              "destination port and Incoterm", "payment instrument and issuing bank", "shipment window"]


# ── Maskering ────────────────────────────────────────────────────────────────

def party_view(company: dict | None, role: str, caller: Caller, contacts: list[dict] | None = None) -> PartyView:
    if not company:
        return PartyView(counterparty_id=None, role=role, descriptor=f"{ROLE_WORD[role]} (not linked)")
    focus = ", ".join([str(x) for x in (company.get("commodity_focus") or [])][:2])
    soort = company.get("company_type")
    parts = [ROLE_WORD[role], company.get("country") or "country unknown"]
    if focus:
        parts.append(focus)
    if soort and soort not in ("other", role):
        parts.append(str(soort))
    state = company.get("verification_status") or "unknown"
    view: dict[str, Any] = dict(
        counterparty_id=company.get("id"), role=role, descriptor=" · ".join(parts), country=company.get("country"),
        verification_state=state if state in STATES else "unknown", verification_score=company.get("verification_score"),
    )
    if caller.identity:
        view.update(identity_disclosed=True, company_name=company.get("company_name"), website=company.get("website"),
                    contacts=[{"contact_id": c.get("id"), "full_name": c.get("full_name"), "role": c.get("role"),
                               "email": c.get("email"), "phone": c.get("phone"),
                               "verification_state": c.get("verification_status")} for c in (contacts or [])][:10])
    else:
        view["contacts"] = [{"contact_id": c.get("id"), "role": c.get("role"),
                             "verification_state": c.get("verification_status"),
                             "has_email": bool(c.get("email")), "has_phone": bool(c.get("phone"))}
                            for c in (contacts or [])][:10]
    return PartyView(**view)


class Redactor:
    """Vervangt bekende namen, domeinen, e-mails en telefoonnummers in vrije tekst."""

    def __init__(self, caller: Caller):
        self.caller = caller
        self._pairs: list[tuple[str, str]] = []

    def company(self, company: dict | None, label: str) -> None:
        if not company:
            return
        naam = (company.get("company_name") or "").strip()
        if len(naam) >= 3:
            self._pairs.append((naam, label))
            kern = re.sub(r"\b(ltd|limited|plc|llc|inc|gmbh|bv|b\.v\.|sa|s\.a\.|co|company|corp|corporation|group|trading|pty)\b\.?",
                          "", naam, flags=re.I).strip(" ,.-")
            if len(kern) >= 4 and kern.lower() != naam.lower():
                self._pairs.append((kern, label))
            # "Mopani Copper Mines PLC" lekt ook als losse "Mopani" in een onderwerp
            # of blocker (gevonden door test_protocol). Dus ook elk ONDERSCHEIDEND
            # woord maskeren -- maar niet "Copper" of "Metals", anders verdwijnt het
            # product uit elke zin.
            land = (company.get("country") or "").lower()
            for woord in re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'&\-]{3,}", naam):
                if woord.lower() not in GENERIEKE_NAAMWOORDEN and woord.lower() != land:
                    self._pairs.append((woord, label))
        for veld in ("website", "source_url"):
            d = domain_of(company.get(veld))
            if d:
                self._pairs.append((d, "[domain]"))

    def contacts(self, contacts: list[dict] | None, label: str) -> None:
        for c in contacts or []:
            naam = (c.get("full_name") or "").strip()
            if len(naam) >= 4 and "@" not in naam:
                self._pairs.append((naam, label))

    def __call__(self, text: Any) -> str:
        s = "" if text is None else str(text)
        if self.caller.identity:
            return s
        # E-mail en telefoon EERST. Andersom maakte de domeinvervanging van
        # "chanda@mopani.com" eerst "chanda@[domain]", en dan herkent het
        # e-mailpatroon het adres niet meer en blijft de voornaam staan
        # (gevonden door test_service).
        s = PHONE.sub("[phone]", EMAIL.sub("[email]", s))
        for waarde, label in sorted(self._pairs, key=lambda p: -len(p[0])):
            s = re.sub(re.escape(waarde), label, s, flags=re.I)
        return s

    def sources(self, sources: list[SourceRef]) -> list[SourceRef]:
        if self.caller.identity:
            return sources
        geheim = {w.lower() for w, label in self._pairs if label == "[domain]"}
        uit = []
        for s in sources:
            d = domain_of(s.url) or ""
            if any(d == g or d.endswith("." + g) for g in geheim):
                continue  # de eigen site van de tegenpartij is zijn identiteit
            uit.append(SourceRef(url=s.url, title=self(s.title) if s.title else None, provider=s.provider, cited=s.cited))
        return uit


# ── Dealstaat, deterministisch ───────────────────────────────────────────────

GATE_EVIDENCE = {
    "buyer": lambda e: (e.get("party_side") or "").lower() == "buyer",
    "seller": lambda e: (e.get("party_side") or "").lower() in ("seller", "supplier"),
    "commercial": lambda e: re.search(r"commerc|price|term|offer|quote", (e.get("evidence_type") or ""), re.I),
    "evidence": lambda e: True,
    "protection": lambda e: re.search(r"ncnda|imfpa|commission|protect|fee", (e.get("evidence_type") or ""), re.I),
    "introduction": lambda e: re.search(r"introduc", (e.get("evidence_type") or ""), re.I),
    "transaction": lambda e: re.search(r"contract|spa|lc|l/c|payment|bank", (e.get("evidence_type") or ""), re.I),
    "fulfilment": lambda e: re.search(r"ship|inspect|b/l|bill of lading|fulfil|deliver", (e.get("evidence_type") or ""), re.I),
    "settlement": lambda e: re.search(r"settle|invoice|paid|remit", (e.get("evidence_type") or ""), re.I),
}

READINESS_TEXT = {
    "buyer_entity_not_verified": ("Buyer legal entity is not verified.", True),
    "supplier_entity_not_verified": ("Supplier legal entity is not verified.", True),
    "seller_authority_not_evidenced": ("Seller authority (principal, producer or mandate) is not evidenced.", True),
    "commission_protection_not_signed": ("No signed commission protection; introduction and identity disclosure are blocked.", False),
}


def req_of(opp: dict) -> dict:
    return opp.get("buyer_requirements") or {}


def offer_of(opp: dict) -> dict:
    return opp.get("supplier_offers") or {}


def company_of(x: dict | None) -> dict | None:
    return (x or {}).get("companies") or None


def gates_for(opp: dict, evidence: list[dict]) -> list[GateState]:
    uit = []
    for gate in matching.GATES:
        n = sum(1 for e in evidence if GATE_EVIDENCE[gate](e))
        uit.append(GateState(gate=gate, passed=bool(opp.get(f"{gate}_gate_passed")), evidence_count=n,
                             basis=f"opportunities.{gate}_gate_passed; {n} deal_evidence row(s)"))
    return uit


def evidence_state(evidence: list[dict]) -> dict[str, int]:
    tel: dict[str, int] = {}
    for e in evidence:
        k = (e.get("verification_status") or "unverified").lower()
        tel[k] = tel.get(k, 0) + 1
    tel["total"] = len(evidence)
    return tel


def blockers_for(opp: dict, gates: list[GateState], readiness_blockers: list[str], tasks: list[dict],
                 intel: dict | None, red: Redactor) -> list[Blocker]:
    uit: dict[str, Blocker] = {}

    def add(b: Blocker) -> None:
        uit.setdefault(b.code, b)

    if opp.get("primary_blocker"):
        add(Blocker(code="primary_blocker", description=red(opp["primary_blocker"])[:500],
                    researchable=bool(opp.get("blocker_search_query")) or bool(
                        re.search(r"verif|authori|mandate|registr|legal entity|producer|refiner|origin|brand|licen", opp["primary_blocker"], re.I)),
                    source="opportunity.primary_blocker"))
    for code in readiness_blockers:
        tekst, onderzoekbaar = READINESS_TEXT.get(code, (code.replace("_", " "), False))
        add(Blocker(code=code, description=tekst, researchable=onderzoekbaar, source="readiness"))
    for g in gates:
        if not g.passed and g.gate in ("buyer", "seller", "commercial", "evidence", "protection"):
            add(Blocker(code=f"gate_{g.gate}_open", description=f"The {g.gate} gate has not passed.",
                        researchable=g.gate in ("buyer", "seller"), source="gate"))
            break  # alleen de eerstvolgende poort; de rest volgt pas daarna
    for t in tasks:
        if (t.get("task_type") or "") in ("resolve_blocker", "blocker") and (t.get("status") or "") in ("open", "waiting", "in_progress"):
            add(Blocker(code=f"task:{t.get('id')}", description=red(t.get("title") or t.get("description") or "Open blocker task")[:300],
                        researchable=False, source="deal_tasks"))
    if intel and intel.get("missing_information"):
        mist = intel["missing_information"]
        mist = mist if isinstance(mist, list) else [mist]
        if mist:
            add(Blocker(code="missing_information", description="Counterparty has not provided: " + red("; ".join(map(str, mist)))[:400],
                        researchable=False, source="email_intelligence"))
    return list(uit.values())


def _urgency(due: datetime | None, t: datetime) -> str:
    if not due:
        return "later"
    if due < t:
        return "overdue"
    if due < t + timedelta(hours=24):
        return "now"
    if due < t + timedelta(hours=72):
        return "soon"
    return "later"


def rank_actions(opp: dict, tasks: list[dict], queue: list[dict], blockers: list[Blocker], red: Redactor) -> list[RankedAction]:
    t = now()
    kandidaten: list[dict] = []
    stage = opp.get("stage") or ""
    if opp.get("next_best_action"):
        kandidaten.append(dict(title=red(opp["next_best_action"])[:400], why="Current next best action on the opportunity.",
                               impact="high", urgency=_urgency(parse_ts(opp.get("next_action_at")), t), risk="medium",
                               requires_approval=bool(opp.get("approval_required")), owner=opp.get("action_owner") or "axe",
                               source="opportunity.next_best_action"))
    if opp.get("next_action") and opp.get("next_action") != opp.get("next_best_action"):
        kandidaten.append(dict(title=red(opp["next_action"])[:400], why="Scheduled next action on the opportunity.",
                               impact="medium", urgency=_urgency(parse_ts(opp.get("next_action_at")), t), risk="low",
                               requires_approval=bool(opp.get("approval_required")), owner=opp.get("action_owner") or "axe",
                               source="opportunity.next_action"))
    for bron, rijen in (("deal_tasks", tasks), ("action_queue", queue)):
        for r in rijen:
            if (r.get("status") or "open") not in ("open", "waiting", "in_progress"):
                continue
            prio = r.get("priority") or 0
            kandidaten.append(dict(title=red(r.get("title") or r.get("task_type") or r.get("action_type") or "Task")[:400],
                                   why=f"Open {bron.replace('_', ' ')} item ({r.get('task_type') or r.get('action_type') or 'task'}).",
                                   impact="high" if prio >= 80 else "medium" if prio >= 50 else "low",
                                   urgency=_urgency(parse_ts(r.get("due_at")), t),
                                   risk="medium" if r.get("requires_approval") else "low",
                                   requires_approval=bool(r.get("requires_approval")), owner=r.get("owner") or "axe",
                                   source=f"{bron}:{r.get('id')}"))
    for b in blockers:
        if b.researchable:
            kandidaten.append(dict(title=f"Investigate blocker: {b.description}", why="Researchable blocker (northsea_investigate_blockers).",
                                   impact="medium", urgency="soon", risk="low", requires_approval=False, owner="axe",
                                   source=f"blocker:{b.code}"))
    if (opp.get("commission_agreement_status") or "") != "signed" and stage not in matching.GATES and stage not in (
            "introduced", "negotiating", "contracting", "shipment", "commission_due", "won", "lost"):
        kandidaten.append(dict(title="Secure signed commission protection before any introduction or identity disclosure.",
                               why="Required by NorthSea policy before introduction-stage actions.", impact="high",
                               urgency="soon", risk="high", requires_approval=True, owner="luka",
                               depends_on=[], source="policy:commission_protection"))

    gewicht_i = {"high": 3, "medium": 2, "low": 1}
    gewicht_u = {"overdue": 4, "now": 3, "soon": 2, "later": 1}
    gezien: set[str] = set()
    uniek = []
    for k in kandidaten:
        sleutel = re.sub(r"\W+", " ", k["title"].lower()).strip()[:120]
        if sleutel in gezien:
            continue
        gezien.add(sleutel)
        k.setdefault("depends_on", [])
        k["_score"] = gewicht_i[k["impact"]] * 3 + gewicht_u[k["urgency"]] * 2 - (1 if k["requires_approval"] else 0) - len(k["depends_on"])
        uniek.append(k)
    uniek.sort(key=lambda k: -k["_score"])
    return [RankedAction(rank=i + 1, **{x: v for x, v in k.items() if x != "_score"}) for i, k in enumerate(uniek)]


def summary_requirement(r: dict) -> dict:
    return {k: r.get(k) for k in ("id", "commodity", "product", "grade", "purity", "quantity_mt", "frequency", "contract_duration",
                                  "origin_preference", "destination", "incoterm", "payment_terms", "required_delivery", "status")}


def summary_offer(o: dict) -> dict:
    return {k: o.get(k) for k in ("id", "commodity", "product", "grade", "purity", "origin", "quantity_mt", "monthly_capacity_mt",
                                  "loading_port", "incoterm", "payment_terms", "price_basis", "mandate_status", "valid_until", "status")}


def web_fit(text: str, product: str | None, grade: str | None, geography: str | None, kant: str) -> tuple[int, list[str]]:
    t = text.lower()
    score, redenen = 0, []
    woorden = [w for w in re.findall(r"[a-z0-9]{4,}", (product or "").lower())]
    if woorden and sum(1 for w in woorden if w in t) >= max(1, len(woorden) // 2 + len(woorden) % 2):
        score += 30
        redenen.append("product mentioned in source snippet")
    if grade and grade.lower() in t:
        score += 10
        redenen.append("grade mentioned")
    if "99.99" in t:
        score += 5
        redenen.append("purity 99.99% mentioned")
    if geography and any(g.strip() and g.strip().lower() in t for g in geography.split(",")):
        score += 15
        redenen.append("geography matches")
    if kant == "supplier" and re.search(r"\b(producer|refinery|refiner|smelter|mine|mining|manufacturer)\b", t):
        score += 20
        redenen.append("describes itself as producer/refinery")
    if kant == "buyer" and re.search(r"\b(importer|manufacturer|fabricator|wire|rod|foundry|end[- ]user|mill)\b", t):
        score += 20
        redenen.append("describes itself as importer/end user")
    if re.search(r"\b(export|exporter|import)\b", t):
        score += 5
    if re.search(r"\b(broker|marketplace|b2b|directory|trade leads?|alibaba|tradekey|go4worldbusiness)\b", t):
        score -= 15
        redenen.append("looks like a broker or marketplace listing")
    return max(0, min(80, score)), redenen


class NorthSeaService:
    def __init__(self, repo: SupabaseRepository, research: ResearchGateway, crew: CrewGateway):
        self.repo = repo
        self.research = research
        self.crew = crew

    # ── Hulp ──────────────────────────────────────────────────────────────────
    async def _deal_context(self, opportunity_id: str, caller: Caller) -> dict:
        opp = await self.repo.get_opportunity(opportunity_id)
        if not opp:
            raise NotFound("opportunity")
        evidence, tasks, queue, comms = await asyncio.gather(
            self.repo.list_evidence(opp["id"]), self.repo.list_deal_tasks(opp["id"]),
            self.repo.list_action_queue(opp["id"]), self.repo.list_communications(opportunity_id=opp["id"], limit=5))
        req, off = req_of(opp), offer_of(opp)
        bc, sc = company_of(req), company_of(off)
        contacts_b = contacts_s = []
        if bc or sc:
            contacts_b, contacts_s = await asyncio.gather(
                self.repo.list_contacts(bc["id"]) if bc else asyncio.sleep(0, []),
                self.repo.list_contacts(sc["id"]) if sc else asyncio.sleep(0, []))
        red = Redactor(caller)
        red.company(bc, "[buyer]")
        red.company(sc, "[seller]")
        red.contacts(contacts_b, "[buyer contact]")
        red.contacts(contacts_s, "[seller contact]")
        intel = None
        inbound = next((c for c in comms if c.get("direction") == "inbound" and c.get("channel") == "email"), None)
        if inbound:
            intel = await self.repo.get_email_intelligence(inbound["id"])
        gates = gates_for(opp, evidence)
        readiness, rblockers = matching.readiness_score(bc, sc, off, opp)
        blockers = blockers_for(opp, gates, rblockers, tasks, intel, red)
        return dict(opp=opp, evidence=evidence, tasks=tasks, queue=queue, comms=comms, req=req, off=off, bc=bc, sc=sc,
                    contacts_b=contacts_b, contacts_s=contacts_s, red=red, intel=intel, gates=gates, readiness=readiness,
                    rblockers=rblockers, blockers=blockers)

    async def _crew(self, action: str, depth: str, handoff: dict) -> CrewRunInfo:
        if depth != "deep":
            return CrewRunInfo(used=False, reason="deterministic analysis was sufficient (depth=standard)")
        return await self.crew.run(action, handoff)

    def _snapshot_deal(self, ctx: dict) -> dict[str, Any]:
        """Canonical deal-state voor crews — geen bestand, alleen NorthSea-service data."""
        opp = ctx["opp"]
        red: Redactor = ctx["red"]
        return {
            "deal_id": opp.get("id"),
            "stage": opp.get("stage"),
            "execution_state": opp.get("execution_state"),
            "qualification_status": opp.get("qualification_status"),
            "primary_blocker": red(opp.get("primary_blocker")),
            "approval_required": bool(opp.get("approval_required")),
            "action_owner": opp.get("action_owner"),
            "waiting_since": opp.get("waiting_since"),
            "readiness_score": ctx.get("readiness"),
            "origin": (ctx.get("off") or {}).get("origin"),
            "is_synthetic": bool(opp.get("is_synthetic") or opp.get("internal_testcase")),
            "gates": [g.model_dump() for g in ctx["gates"]],
            "buyer": party_view(ctx["bc"], "buyer", ctx["red"].caller, ctx["contacts_b"]).model_dump(),
            "seller": party_view(ctx["sc"], "supplier", ctx["red"].caller, ctx["contacts_s"]).model_dump(),
            "requirement": summary_requirement(ctx["req"]) if ctx.get("req") else {},
            "offer": summary_offer(ctx["off"]) if ctx.get("off") else {},
            "evidence": [{"evidence_type": e.get("evidence_type"), "verification_status": e.get("verification_status"),
                          "claim": red(e.get("claim")), "source_type": e.get("source_type")} for e in ctx["evidence"]],
            "blockers": [b.model_dump() for b in ctx["blockers"]],
            "tasks": [{"id": t.get("id"), "title": red(t.get("title")), "status": t.get("status"),
                       "task_type": t.get("task_type")} for t in ctx["tasks"]],
            "communications": [{"id": c.get("id"), "direction": c.get("direction"), "channel": c.get("channel"),
                                "subject": red(c.get("subject")), "body": red(c.get("body"))} for c in ctx["comms"]],
        }

    def _snapshot_ops(self, ctx: dict) -> dict[str, Any]:
        deal = self._snapshot_deal(ctx)
        return {
            "communications": deal["communications"],
            "deals": [deal],
            "documents": deal["evidence"],
            "tasks": deal["tasks"],
        }

    async def canonical_handoff(self, caller: Caller, action: str, handoff: dict[str, Any]) -> dict[str, Any]:
        """Zet canonieke deal/ops-state op de MCP-grens. Crews lezen geen files."""
        payload = dict(handoff.get("payload") or {})
        entity_ids = list(handoff.get("entity_ids") or [])
        opp_id = payload.get("opportunity_id") or payload.get("deal_id")
        if not opp_id:
            for e in entity_ids:
                if e:
                    opp_id = e
                    break
        state: dict[str, Any] = {
            "source": "northsea_service",
            "channel": "mcp_boundary",
            "file_read": False,
            "action": action,
            "inputs": payload,
            "deal": None,
            "operations": None,
        }
        if opp_id:
            try:
                ctx = await self._deal_context(str(opp_id), caller)
                state["deal"] = self._snapshot_deal(ctx)
                state["operations"] = self._snapshot_ops(ctx)
            except NotFound:
                state["missing"] = ["opportunity_not_found"]
        out = dict(handoff)
        out["canonical_state"] = state
        out["action"] = action
        return out

    async def handle_event(self, caller: Caller, event: dict[str, Any]) -> orchestration.OrchestrationResult:
        """Canoniek event-instappunt — de deterministische master-orchestratie.

        Eén weg naar binnen voor AXE CORE-events. CrewAI redeneert; deze laag
        valideert, gate't, routeert, redigeert identiteiten, en legt alleen
        gerechtvaardigde provenance vast. Geen send, geen engine_*-mutatie, geen
        verified-promotie. Studio mag down zijn. Dubbele event_id is idempotent.
        """
        from .crews.schemas import market_as_transaction_evidence, parse_typed_result

        event_id = event.get("event_id") if isinstance(event, dict) else None
        if isinstance(event_id, str) and event_id:
            eerder = await self._find_crew_audit(event_id)
            if eerder:
                details = eerder.get("details") or {}
                return orchestration.OrchestrationResult(
                    status=details.get("orchestration_status") or "ok",
                    event_id=event_id, run_id=details.get("run_id"),
                    route=details.get("route"), crew_family=details.get("crew_family"),
                    validation=orchestration.ValidationResult(valid=True, event_type=str(event.get("event_type") or "")),
                    crew=CrewRunInfo(used=True, status=details.get("crew_status") or "ok",
                                     crew=details.get("crew_short"), route=details.get("route"),
                                     backend=details.get("backend"), actual_crew=details.get("actual_crew"),
                                     validation=details.get("validation") or "valid",
                                     analysis=details.get("analysis"),
                                     fallback_used=bool(details.get("fallback_used")),
                                     timings=details.get("timings") or {},
                                     budget_usage=details.get("budget_usage") or {}),
                    reason="idempotent replay of existing crew_run",
                )

        payload = event.get("payload") if isinstance(event, dict) else None
        opp_id = payload.get("opportunity_id") if isinstance(payload, dict) else None
        ctx = None
        if opp_id:
            try:
                ctx = await self._deal_context(str(opp_id), caller)
            except NotFound:
                ctx = None
            if ctx and (ctx["opp"].get("is_synthetic") or ctx["opp"].get("internal_testcase")):
                if isinstance(event, dict):
                    event = dict(event)
                    pl = dict(event.get("payload") or {})
                    pl["is_synthetic"] = True
                    event["payload"] = pl

        service = self

        class CanonicalGateway:
            async def run(self, action: str, handoff: dict) -> CrewRunInfo:
                enriched = await service.canonical_handoff(caller, action, handoff)
                info = await service.crew.run(action, enriched)
                if ctx is not None and info.analysis:
                    red: Redactor = ctx["red"]
                    info = info.model_copy(update={"analysis": red(info.analysis)})
                return info

        result = await orchestration.handle_event(event, CanonicalGateway(), caller.scopes)
        await self._persist_crew_outcome(caller, event, result, ctx)
        return result

    async def _find_crew_audit(self, event_id: str) -> dict | None:
        finder = getattr(self.repo, "find_crew_audit", None)
        if finder:
            return await finder(event_id)
        return None

    async def _persist_crew_outcome(self, caller: Caller, event: dict, result: orchestration.OrchestrationResult,
                                    ctx: dict | None) -> None:
        """Gerechtvaardigde persistence: audit + deal_event + optionele Chase. Nooit send/engine_*/verified."""
        from .crews.schemas import market_as_transaction_evidence, parse_typed_result

        if result.crew is None and result.status not in ("crew_unavailable", "crew_error"):
            return
        payload = event.get("payload") if isinstance(event, dict) else None
        opp_id = payload.get("opportunity_id") if isinstance(payload, dict) else None
        crew = result.crew
        details = {
            "event_id": result.event_id or event.get("event_id"),
            "run_id": result.run_id,
            "route": result.route,
            "crew_family": result.crew_family,
            "orchestration_status": result.status,
            "crew_status": crew.status if crew else None,
            "crew_short": crew.crew if crew else None,
            "backend": crew.backend if crew else None,
            "actual_crew": crew.actual_crew if crew else None,
            "validation": crew.validation if crew else None,
            "fallback_used": crew.fallback_used if crew else False,
            "fallback_reason": crew.fallback_reason if crew else None,
            "timings": crew.timings if crew else {},
            "budget_usage": crew.budget_usage if crew else {},
            "models": crew.models if crew else [],
            "tools": crew.tools if crew else [],
            "skills": crew.skills if crew else [],
            "error": result.reason or (crew.reason if crew else None),
            "approval_required": result.status == "approval_required" or (result.gate.approval_required if result.gate else False),
            "next_action": None,
            "result_type": result.route,
            "source": "northsea_service",
            "engine_columns_written": False,
            "sent": False,
            "analysis": (crew.analysis[:500] if crew and crew.analysis else None),
        }
        nba = None
        if crew and crew.status == "ok":
            typed, fout = parse_typed_result(
                {"analysis": crew.analysis or "ok", "typed_result": {},
                 "tools": crew.tools, "skills": crew.skills, "models": crew.models,
                 "budget_usage": crew.budget_usage},
                specialist_crew=crew.actual_crew or crew.crew or "unknown",
                agents_run=max(1, len(crew.skills) or 1),
            )
            if typed:
                details["approval_required"] = details["approval_required"] or typed.approval_required
                if isinstance(typed.next_best_action, dict):
                    nba = typed.next_best_action.get("action")
                elif isinstance(typed.next_best_action, str):
                    nba = typed.next_best_action
                details["next_action"] = nba or (typed.recommendations[0] if typed.recommendations else None)
                if market_as_transaction_evidence(typed):
                    details["rejected"] = "market_information_not_transaction_evidence"
        try:
            await self.repo.engine_insert("northsea_audit_events", {
                "actor_type": "automation", "actor": "northsea-crew", "action": "crew_run",
                "opportunity_id": opp_id, "details": details,
            })
        except Exception:
            pass
        if opp_id and result.status in ("ok", "crew_unavailable", "crew_error"):
            await self.repo.insert_deal_event({
                "opportunity_id": opp_id,
                "event_type": "crew_run" if result.status == "ok" else f"crew_{result.status}",
                "actor": f"crew:{result.crew_family or 'none'}"[:100],
                "summary": (f"NorthSea {result.crew_family or 'none'} via {result.route} "
                            f"status={result.status} backend={details.get('backend')} "
                            f"fallback={details.get('fallback_used')} (unverified).")[:500],
                "metadata": details,
            })
        # Chase alleen als de crew ok is, de aanbeveling approval/next-action is, en we niet de engine dupliceren.
        if result.status == "ok" and opp_id and details.get("approval_required"):
            try:
                await self.repo.engine_insert(
                    "action_queue",
                    {"opportunity_id": opp_id, "action_type": "approval_required",
                     "title": "Crew recommended an action that requires human approval",
                     "status": "open", "requires_approval": True,
                     "dedupe_key": f"crew-approval:{details.get('event_id')}",
                     "metadata": {"source": "northsea-crew", "execute": False, "event_id": details.get("event_id")}},
                    ignore_duplicates=True,
                )
            except Exception:
                pass
        # Nooit: send, engine_patch opportunities, verified evidence, reply_drafts (P1 engine-pad).
        _ = caller, ctx


    # ── 1. research_counterparty ─────────────────────────────────────────────
    async def research_counterparty(self, caller: Caller, *, objective: str, counterparty_id: str | None = None,
                                    context: str | None = None, priority: str = "P2", depth: str = "standard") -> CounterpartyResearch:
        if not counterparty_id and not (context or "").strip():
            raise ServiceError("invalid_input", "Provide counterparty_id or a safe identifying context.")
        run_id = str(uuid.uuid4())
        company, contacts, checks, offers, reqs = None, [], [], [], []
        if counterparty_id:
            company = await self.repo.get_company(counterparty_id)
            if not company:
                raise NotFound("counterparty")
            contacts, checks, offers, reqs = await asyncio.gather(
                self.repo.list_contacts(company["id"]), self.repo.list_verification_checks(company["id"]),
                self.repo.list_company_offers(company["id"]), self.repo.list_company_requirements(company["id"]))
        role = "supplier" if offers and not reqs else "buyer" if reqs and not offers else (
            (company or {}).get("company_type") if (company or {}).get("company_type") in ("buyer", "supplier") else "counterparty")
        red = Redactor(caller)
        red.company(company, "[counterparty]")
        red.contacts(contacts, "[contact]")
        view = party_view(company, role, caller, contacts) if company else PartyView(
            counterparty_id=None, role="counterparty", descriptor="Candidate counterparty (not in the NorthSea database)")

        claims: list[Claim] = []
        if company:
            for veld in ("country", "company_type", "commodity_focus", "trade_activity"):
                if company.get(veld) not in (None, "", []):
                    claims.append(Claim(field=veld, value=red(company[veld]) if isinstance(company[veld], str) else company[veld],
                                        state="unverified", basis=f"companies.{veld}"))
            claims.append(Claim(field="verification_status", value=company.get("verification_status"),
                                state=company.get("verification_status") if company.get("verification_status") in STATES else "unknown",
                                basis="companies.verification_status (as recorded by NorthSea)"))
            for c in checks[:20]:
                # "positive" is wat AXE Commodities echt schrijft (gemeten 15 sep 2026).
                ok = (c.get("status") or "").lower() in ("positive", "passed", "verified", "confirmed")
                claims.append(Claim(field=f"check:{c.get('check_type')}", value=c.get("status"),
                                    state="verified" if ok else "unverified", basis="verification_checks",
                                    sources=red.sources([SourceRef(url=c["source_url"], provider="verification_check")]) if c.get("source_url") else []))

        budget = Budget.for_priority(priority)
        run = ResearchRun(status="skipped", message="No research budget for this priority.")
        findings, sources = "", []
        if company:
            onderwerp = (f"the company '{company.get('company_name')}'" + (f" in {company.get('country')}" if company.get("country") else "")
                         + (f" (website {company.get('website')})" if company.get("website") else ""))
        else:
            onderwerp = f"the organisation described as: {(context or '').strip()[:600]}"
        focus = ", ".join((company or {}).get("commodity_focus") or []) or "physical commodities (copper cathode focus)"
        vraag = (f"Research {onderwerp} as a potential {role} in physical commodity trade ({focus}). "
                 f"Objective: {objective.strip()[:500]}. Establish the legal entity and registration, official website, "
                 "real trade activity in this commodity, locations and assets, public roles of key people, and any red flags "
                 "(sanctions, fraud warnings, broker chains, fake allocation offers).")
        if budget.take():
            try:
                antwoord = await self.research.ask(vraag, instructions=RESEARCH_INSTRUCTIONS, priority=priority)
                findings = red(antwoord.text)
                sources = red.sources(antwoord.sources)[:15]
                run = ResearchRun(status="completed" if antwoord.text else "partial", provider="perplexity", calls_made=1,
                                  cost_usd=antwoord.cost_usd)
            except ResearchError as e:
                run = ResearchRun(status=e.status, provider="perplexity", message=e.message)

        kant = role if role in ("buyer", "supplier") else "supplier"
        open_questions = list(SUPPLIER_GAPS if kant == "supplier" else BUYER_GAPS)
        blockers: list[Blocker] = []
        if company and company.get("verification_status") != "verified":
            blockers.append(Blocker(code="entity_not_verified", description="Legal entity is not verified by NorthSea.",
                                    researchable=True, source="companies.verification_status"))
        if company and not company.get("website"):
            blockers.append(Blocker(code="no_official_website", description="No official website recorded.", researchable=True,
                                    source="companies.website"))
        if contacts and not any((c.get("verification_status") or "") == "verified" for c in contacts):
            blockers.append(Blocker(code="contacts_unverified", description="No verified contact person.", researchable=False,
                                    source="contacts.verification_status"))
        acties = ["Treat all research findings as unverified until checked against an official registry or the counterparty's documents."]
        if any(b.code == "entity_not_verified" for b in blockers):
            acties.append("Record a verification check (company registry extract) before any introduction.")
        if kant == "supplier":
            acties.append("Request evidence of seller authority (producer, refinery or mandate) and current executable allocation.")
        else:
            acties.append("Confirm the legal buying entity, authorised contact and payment instrument.")
        crew = await self._crew("research_counterparty", depth, {
            "entity_ids": {"counterparty_id": counterparty_id}, "objective": objective,
            "verified_facts": [c.model_dump() for c in claims if c.state == "verified"],
            "unverified_claims": [c.model_dump() for c in claims if c.state != "verified"],
            "research_findings": findings[:4000], "blockers": [b.model_dump() for b in blockers],
            "prohibited_actions": PROHIBITED})
        if crew.analysis:
            crew = crew.model_copy(update={"analysis": red(crew.analysis)})
        return CounterpartyResearch(run_id=run_id, objective=objective, counterparty=view, findings=findings, claims=claims,
                                    sources=sources, verification_state=view.verification_state, open_questions=open_questions,
                                    blockers=blockers, recommended_actions=acties, research=run, crew=crew)

    # ── 2 en 3. find_suppliers / find_buyers ─────────────────────────────────
    async def _find(self, caller: Caller, *, kant: str, anchor: dict, geography: str | None, priority: str) -> CandidateSearch:
        run_id = str(uuid.uuid4())
        red = Redactor(caller)
        red.company(company_of(anchor), "[anchor]")
        anchor_company = company_of(anchor)
        if kant == "supplier":
            rijen = await self.repo.list_active_offers()
            score_fn = lambda r: matching.match_score(anchor, r)  # noqa: E731
            uitleg_fn = lambda r: matching.explain_match(anchor, r)  # noqa: E731
            anchor_view = {**summary_requirement(anchor), "buyer": party_view(anchor_company, "buyer", caller).descriptor}
        else:
            rijen = await self.repo.list_active_requirements()
            score_fn = lambda r: matching.match_score(r, anchor)  # noqa: E731
            uitleg_fn = lambda r: matching.explain_match(r, anchor)  # noqa: E731
            anchor_view = {**summary_offer(anchor), "supplier": party_view(anchor_company, "supplier", caller).descriptor}

        bekend: list[tuple[int, dict]] = []
        for r in rijen:
            if anchor.get("company_id") and r.get("company_id") == anchor.get("company_id"):
                continue
            s = score_fn(r)
            if s >= 40:
                bekend.append((s, r))
        bekend.sort(key=lambda x: -x[0])
        kandidaten: list[CandidateView] = []
        for s, r in bekend[:6]:
            comp = company_of(r)
            uitleg = uitleg_fn(r)
            gaps = [f"{u} unknown" for u in uitleg["unknowns"][:6]]
            if (comp or {}).get("verification_status") != "verified":
                gaps.append("legal entity not verified")
            kandidaten.append(CandidateView(
                descriptor=party_view(comp, kant, caller).descriptor + f" · {r.get('product') or r.get('commodity') or ''}".rstrip(" ·"),
                name=(comp or {}).get("company_name") if caller.identity else None,
                website=(comp or {}).get("website") if caller.identity else None,
                source_type="database_offer" if kant == "supplier" else "database_requirement",
                existing_entity_id=r.get("id"), preliminary_score=s,
                score_basis="commodity-intake matchScore (same rule as the website intake; 60+ creates opportunities)",
                fit_reasons=[f"{m['field']} matches" for m in uitleg["matching_fields"]],
                verification_gaps=gaps,
                verification_state=(comp or {}).get("verification_status") if (comp or {}).get("verification_status") in STATES else "unknown"))

        budget = Budget.for_priority(priority)
        run = ResearchRun(status="skipped", message="Web search not attempted.")
        duplicaten = al_bekend = gevonden = nieuw = 0
        product = anchor.get("product") or anchor.get("commodity")
        geo = geography or (anchor.get("origin_preference") if kant == "supplier" else None) or ""
        if budget.take():
            woord = "producer refinery supplier exporter" if kant == "supplier" else "importer buyer manufacturer end user"
            query = " ".join(x for x in [anchor.get("grade") or "", product or "", woord, geo] if x).strip()
            try:
                zoek = await self.research.search(query, max_results=SEARCH_RESULTS_BY_PRIORITY.get(priority, 6), priority=priority)
                hits = zoek.hits
                gevonden = len(hits)
                bekende_domeinen = set()
                for c in await self.repo.list_company_domains():
                    for veld in ("website", "source_url"):
                        d = domain_of(c.get(veld))
                        if d:
                            bekende_domeinen.add(d)
                gezien: set[str] = set()
                for h in hits:
                    d = domain_of(h.url)
                    if not d or d in gezien:
                        duplicaten += 1
                        continue
                    gezien.add(d)
                    if d in bekende_domeinen:
                        al_bekend += 1
                        continue
                    score, redenen = web_fit(f"{h.title} {h.content}", product, anchor.get("grade"), geo or None, kant)
                    nieuw += 1
                    kandidaten.append(CandidateView(
                        descriptor=f"Web-found {kant} candidate #{nieuw}" + (f" · {geo}" if geo else ""),
                        name=h.title[:200] if caller.identity else None,
                        website=f"https://{d}" if caller.identity else None,
                        source_url=h.url if caller.identity else None,
                        source_type="web_search", preliminary_score=score,
                        score_basis="keyword fit on the search snippet only; capped at 80 because nothing is verified",
                        fit_reasons=redenen, verification_gaps=list(SUPPLIER_GAPS if kant == "supplier" else BUYER_GAPS)))
                run = ResearchRun(status="completed", provider=zoek.provider, calls_made=1 + len(zoek.fallbacks),
                                  message=("fell back after: " + "; ".join(zoek.fallbacks)) if zoek.fallbacks else None)
            except ResearchError as e:
                run = ResearchRun(status=e.status, provider="search-chain", message=e.message)

        kandidaten.sort(key=lambda c: (c.source_type == "web_search", -c.preliminary_score))
        mist = [k for k, v in anchor_view.items() if v in (None, "") and k not in ("id", "status")]
        return CandidateSearch(
            run_id=run_id, anchor_id=anchor["id"], anchor=anchor_view, candidates=kandidaten,
            dedupe=DedupeSummary(found=gevonden + len(bekend[:6]), duplicates_removed=duplicaten,
                                 already_in_database=al_bekend + len(bekend[:6]), new_candidates=nieuw),
            verification_gaps=[f"anchor {m} unknown" for m in mist], research=run)

    async def find_suppliers(self, caller: Caller, *, buyer_requirement_id: str, geography: str | None = None,
                             priority: str = "P2") -> CandidateSearch:
        req = await self.repo.get_requirement(buyer_requirement_id)
        if not req:
            raise NotFound("buyer_requirement")
        return await self._find(caller, kant="supplier", anchor=req, geography=geography, priority=priority)

    async def find_buyers(self, caller: Caller, *, supplier_offer_id: str, geography: str | None = None,
                          priority: str = "P2") -> CandidateSearch:
        off = await self.repo.get_offer(supplier_offer_id)
        if not off:
            raise NotFound("supplier_offer")
        return await self._find(caller, kant="buyer", anchor=off, geography=geography, priority=priority)

    # ── 4. assess_match ──────────────────────────────────────────────────────
    async def assess_match(self, caller: Caller, *, buyer_requirement_id: str, supplier_offer_id: str) -> MatchAssessmentResult:
        req, off = await asyncio.gather(self.repo.get_requirement(buyer_requirement_id), self.repo.get_offer(supplier_offer_id))
        if not req:
            raise NotFound("buyer_requirement")
        if not off:
            raise NotFound("supplier_offer")
        fit = matching.match_score(req, off)
        uitleg = matching.explain_match(req, off)
        paar, bestaand = await asyncio.gather(self.repo.find_opportunity_for_pair(req["id"], off["id"]),
                                              self.repo.get_match_assessment(req["id"], off["id"]))
        opp = await self.repo.get_opportunity(paar["id"]) if paar else None
        readiness, rblockers = matching.readiness_score(company_of(req), company_of(off), off, opp)
        blockers = [Blocker(code=f"conflict_{c['field']}", description=f"{c['field']}: buyer {c['buyer']} vs supplier {c['supplier']}",
                            source="match") for c in uitleg["conflicts"]]
        for veld in ("quantity_mt", "incoterm", "payment_terms"):
            if veld in uitleg["unknowns"]:
                blockers.append(Blocker(code=f"unknown_{veld}", description=f"{veld} is unknown on one or both sides.", source="match"))
        for code in rblockers:
            tekst, onderzoekbaar = READINESS_TEXT.get(code, (code, False))
            blockers.append(Blocker(code=code, description=tekst, researchable=onderzoekbaar, source="readiness"))
        acties = []
        if fit < matching.MATCH_THRESHOLD:
            acties.append(f"Commercial fit {fit} is below the intake threshold ({matching.MATCH_THRESHOLD}); resolve conflicts before treating this as an opportunity.")
        if uitleg["unknowns"]:
            acties.append("Confirm with the counterparties: " + ", ".join(uitleg["unknowns"][:8]) + ".")
        if "seller_authority_not_evidenced" in rblockers:
            acties.append("Request evidence of seller authority and executable allocation before any introduction.")
        if "commission_protection_not_signed" in rblockers:
            acties.append("Secure signed commission protection before introducing the parties.")
        if not paar and fit >= matching.MATCH_THRESHOLD:
            acties.append("Pair scores above the threshold but no opportunity exists yet; create one through the Deal Desk after qualification.")
        return MatchAssessmentResult(
            buyer_requirement_id=req["id"], supplier_offer_id=off["id"], commercial_fit_score=fit,
            transaction_readiness_score=readiness, meets_match_threshold=fit >= matching.MATCH_THRESHOLD,
            matching_fields=uitleg["matching_fields"], conflicts=uitleg["conflicts"], unknowns=uitleg["unknowns"],
            blockers=blockers, recommended_next_actions=acties,
            existing_assessment={k: v for k, v in (bestaand or {}).items() if k not in ("buyer_requirement_id", "supplier_offer_id")} or None,
            existing_opportunity_id=(paar or {}).get("id"),
            method="deterministic: commodity-intake matchScore + field comparison + readiness from verification, mandate, gates and commission protection")

    # ── 5. qualify_opportunity ───────────────────────────────────────────────
    async def qualify_opportunity(self, caller: Caller, *, opportunity_id: str, depth: str = "standard") -> QualificationResult:
        ctx = await self._deal_context(opportunity_id, caller)
        opp, red = ctx["opp"], ctx["red"]
        acties = rank_actions(opp, ctx["tasks"], ctx["queue"], ctx["blockers"], red)[:8]
        open_taken = " ".join((t.get("title") or "").lower() for t in ctx["tasks"] if (t.get("status") or "") in ("open", "waiting", "in_progress"))
        taak_advies = []
        for b in ctx["blockers"]:
            if b.code.startswith("task:"):
                continue
            if b.description.lower()[:40] in open_taken:
                continue
            taak_advies.append({"task_type": "resolve_blocker", "title": f"Resolve: {b.description}"[:200],
                                "priority": 80 if b.researchable else 60, "blocker_code": b.code,
                                "requires_approval": b.code == "commission_protection_not_signed",
                                "create_with": "northsea_create_task"})
        comm_advies = []
        gates = {g.gate: g for g in ctx["gates"]}
        if not gates["seller"].passed and ctx["sc"]:
            comm_advies.append({"template": "supplier_qualification", "recipient": "seller", "approval_required": True,
                                "reason": "Seller gate open: confirm legal entity, authority, allocation, loading point, payment and documents.",
                                "prepare_with": "northsea_prepare_outreach"})
        if not gates["buyer"].passed and ctx["bc"]:
            comm_advies.append({"template": "buyer_qualification", "recipient": "buyer", "approval_required": True,
                                "reason": "Buyer gate open: confirm legal buying entity, exact requirement, destination and payment.",
                                "prepare_with": "northsea_prepare_outreach"})
        wacht = parse_ts(opp.get("waiting_since"))
        if wacht and now() - wacht > timedelta(hours=72):
            comm_advies.append({"template": "follow_up", "recipient": "awaited party", "approval_required": True,
                                "reason": f"Waiting since {wacht.date().isoformat()} (>72h).", "prepare_with": "northsea_prepare_outreach"})
        crew = await self._crew("qualify_opportunity", depth, {
            "entity_ids": {"opportunity_id": opp["id"]}, "stage": opp.get("stage"),
            "gates": [g.model_dump() for g in ctx["gates"]], "evidence_state": evidence_state(ctx["evidence"]),
            "blockers": [b.model_dump() for b in ctx["blockers"]], "required_output": "qualification risks and missing evidence",
            "prohibited_actions": PROHIBITED})
        if crew.analysis:
            crew = crew.model_copy(update={"analysis": red(crew.analysis)})
        return QualificationResult(opportunity_id=opp["id"], stage=opp.get("stage"), gates=ctx["gates"],
                                   evidence_state=evidence_state(ctx["evidence"]), blockers=ctx["blockers"], next_actions=acties,
                                   task_recommendations=taak_advies, communication_recommendations=comm_advies, crew=crew)

    # ── 6. investigate_blockers ──────────────────────────────────────────────
    async def investigate_blockers(self, caller: Caller, *, opportunity_id: str, blocker_codes: list[str] | None = None,
                                   priority: str = "P2", depth: str = "standard") -> BlockerInvestigation:
        ctx = await self._deal_context(opportunity_id, caller)
        opp, red = ctx["opp"], ctx["red"]
        run_id = str(uuid.uuid4())
        gekozen = [b for b in ctx["blockers"] if not blocker_codes or b.code in blocker_codes]
        onbekend = [c for c in (blocker_codes or []) if c not in {b.code for b in ctx["blockers"]}]
        budget = Budget.for_priority(priority)
        opgelost: list[dict] = [{"code": c, "reason": "Not an open blocker on this opportunity (already resolved or never raised)."} for c in onbekend]
        open_: list[dict] = []
        bewijs: list[Claim] = []
        bronnen: list[SourceRef] = []
        runs: list[ResearchRun] = []
        product = ctx["req"].get("product") or ctx["off"].get("product") or ctx["req"].get("commodity") or "the commodity"
        for b in gekozen:
            if not b.researchable:
                open_.append({"code": b.code, "description": b.description, "reason": "Needs human or counterparty action; not researchable."})
                continue
            if not budget.take():
                open_.append({"code": b.code, "description": b.description, "reason": "Research budget for this run is exhausted."})
                continue
            vraag = self._vraag_voor_blocker(b, opp, ctx, product)
            try:
                antwoord = await self.research.ask(vraag, instructions=RESEARCH_INSTRUCTIONS, priority=priority)
                geciteerd = red.sources([s for s in antwoord.sources if s.cited] or antwoord.sources)[:8]
                bewijs.append(Claim(field=b.code, value=red(antwoord.text)[:2000], state="unverified",
                                    basis="Perplexity research answer; requires human verification", sources=geciteerd))
                bronnen.extend(geciteerd)
                open_.append({"code": b.code, "description": b.description, "evidence_index": len(bewijs) - 1,
                              "reason": "Evidence found; a human must verify it (verification check or deal evidence) before the blocker is cleared."})
                runs.append(ResearchRun(status="completed", provider="perplexity", calls_made=1, cost_usd=antwoord.cost_usd))
            except ResearchError as e:
                open_.append({"code": b.code, "description": b.description, "reason": e.message})
                runs.append(ResearchRun(status=e.status, provider="perplexity", message=e.message))
        if not runs:
            run = ResearchRun(status="skipped", message="No researchable blockers selected.")
        elif all(r.status == "completed" for r in runs):
            run = ResearchRun(status="completed", provider="perplexity", calls_made=len(runs), cost_usd=round(sum(r.cost_usd for r in runs), 4))
        elif any(r.status == "completed" for r in runs):
            run = ResearchRun(status="partial", provider="perplexity", calls_made=len(runs), cost_usd=round(sum(r.cost_usd for r in runs), 4),
                              message="; ".join(r.message for r in runs if r.message)[:300])
        else:
            run = runs[0]
        acties = [f"Review the research on '{e.field}' and record a verification check or deal evidence if it holds." for e in bewijs]
        acties += [f"{x['description']} -- {x['reason']}" for x in open_ if "evidence_index" not in x][:5]
        crew = await self._crew("investigate_blockers", depth, {
            "entity_ids": {"opportunity_id": opp["id"]}, "blockers": [b.model_dump() for b in gekozen],
            "new_unverified_evidence": [c.model_dump() for c in bewijs], "prohibited_actions": PROHIBITED})
        if crew.analysis:
            crew = crew.model_copy(update={"analysis": red(crew.analysis)})
        gezien: set[str] = set()
        uniek_bronnen = [s for s in bronnen if not (s.url in gezien or gezien.add(s.url))]
        return BlockerInvestigation(run_id=run_id, opportunity_id=opp["id"], investigated=[b.code for b in gekozen],
                                    resolved=opgelost, unresolved=open_, new_evidence=bewijs, sources=uniek_bronnen,
                                    recommended_next_actions=acties, research=run, crew=crew)

    @staticmethod
    def _vraag_voor_blocker(b: Blocker, opp: dict, ctx: dict, product: str) -> str:
        sc, bc = ctx["sc"] or {}, ctx["bc"] or {}
        if b.code in ("seller_authority_not_evidenced", "gate_seller_open", "supplier_entity_not_verified"):
            return (f"Is '{sc.get('company_name')}' ({sc.get('country') or 'country unknown'}) a registered legal entity and a producer, "
                    f"refinery, or authorised seller of {product}? Look for company registry records, LME brand listings, the official "
                    "website and credible trade press. Report what is confirmed and what is not.")
        if b.code in ("buyer_entity_not_verified", "gate_buyer_open"):
            return (f"Is '{bc.get('company_name')}' ({bc.get('country') or 'country unknown'}) a registered legal entity that genuinely "
                    f"buys or processes {product}? Look for registry records, official website, import records and trade press.")
        if b.code == "primary_blocker":
            q = opp.get("blocker_search_query") or opp.get("primary_blocker") or ""
            return f"{q}. Context: physical trade in {product}. Report only what reliable sources confirm."[:1800]
        return f"{b.description} Context: physical trade in {product}. Report only what reliable sources confirm."

    # ── 7. prepare_outreach ──────────────────────────────────────────────────
    async def prepare_outreach(self, caller: Caller, *, objective: str, opportunity_id: str | None = None,
                               counterparty_id: str | None = None, channel: str = "email", template: str | None = None,
                               save_as_pending_draft: bool = False) -> OutreachDraft:
        if not opportunity_id and not counterparty_id:
            raise ServiceError("invalid_input", "Provide opportunity_id or counterparty_id.")
        opp = req = off = None
        if opportunity_id:
            opp = await self.repo.get_opportunity(opportunity_id)
            if not opp:
                raise NotFound("opportunity")
            req, off = req_of(opp), offer_of(opp)
        template = (template or "auto").strip().lower()
        if counterparty_id:
            company = await self.repo.get_company(counterparty_id)
            if not company:
                raise NotFound("counterparty")
            if opp and company["id"] == (company_of(req) or {}).get("id"):
                kant = "buyer"
            elif opp and company["id"] == (company_of(off) or {}).get("id"):
                kant = "supplier"
            else:
                kant = company.get("company_type") if company.get("company_type") in ("buyer", "supplier") else "supplier"
        else:
            if template.startswith("buyer"):
                kant = "buyer"
            elif template.startswith("supplier"):
                kant = "supplier"
            else:
                kant = "supplier" if not (opp or {}).get("seller_gate_passed") else "buyer"
            company = company_of(off) if kant == "supplier" else company_of(req)
        if company and not req and not off:
            offers, reqs = await asyncio.gather(self.repo.list_company_offers(company["id"]), self.repo.list_company_requirements(company["id"]))
            off = offers[0] if offers else None
            req = reqs[0] if reqs else None
        contacts = await self.repo.list_contacts(company["id"]) if company else []
        contacts = [c for c in contacts if c.get("contact_policy") not in ("do_not_contact",)]
        primair = next((c for c in contacts if c.get("email")), None)
        beleid = await self.repo.outbound_block_reason(company_id=(company or {}).get("id"), contact_id=(primair or {}).get("id"),
                                                       email=(primair or {}).get("email"), opportunity_id=(opp or {}).get("id"))
        if beleid in ("do_not_contact", "synthetic", "bounced_channel"):
            raise PolicyDenied("contact_policy_blocked",
                               f"Outreach is blocked by contact policy ({beleid}). No draft was prepared.")
        if template == "auto":
            gate_open = not (opp or {}).get(f"{'seller' if kant == 'supplier' else 'buyer'}_gate_passed")
            wacht = parse_ts((opp or {}).get("waiting_since"))
            template = "follow_up" if wacht and now() - wacht > timedelta(hours=72) else (
                f"{kant}_qualification" if gate_open else "document_request")
        ALLE_TEMPLATES = ("supplier_qualification", "buyer_qualification", "follow_up", "document_request", "decline_not_executable",
                         "deal_alignment", "controlled_introduction", "tender_specific_request", "delivery_failure", "bounce_handling")
        if template not in ALLE_TEMPLATES:
            raise ServiceError("invalid_input", f"template must be auto or one of {', '.join(ALLE_TEMPLATES)}")

        eigen = (off if kant == "supplier" else req) or {}
        andere = (req if kant == "supplier" else off) or {}
        product = eigen.get("product") or andere.get("product") or eigen.get("commodity") or andere.get("commodity") or "the material"
        feiten: list[Claim] = []
        for veld in ("product", "grade", "purity", "quantity_mt", "incoterm", "payment_terms"):
            if andere.get(veld) not in (None, ""):
                feiten.append(Claim(field=f"counterparty_side.{veld}", value=andere[veld], state="unverified",
                                    basis=f"{'buyer_requirements' if kant == 'supplier' else 'supplier_offers'}.{veld} (stated by the other party)"))
        if kant == "supplier" and req and req.get("destination"):
            feiten.append(Claim(field="counterparty_side.destination_country", value=req.get("destination"), state="unverified",
                                basis="buyer_requirements.destination"))
        gaps = SUPPLIER_GAPS if kant == "supplier" else BUYER_GAPS
        velden_nodig = (("origin", "loading_port", "incoterm", "payment_terms", "mandate_status", "quantity_mt") if kant == "supplier"
                        else ("destination", "incoterm", "payment_terms", "quantity_mt", "required_delivery"))
        onbekend = [v for v in velden_nodig if eigen.get(v) in (None, "")]

        ref = []
        if andere:
            ref = [x for x in [andere.get("product") or andere.get("commodity"), andere.get("grade"),
                               f"{andere['quantity_mt']:g} MT" if isinstance(andere.get("quantity_mt"), (int, float)) else None,
                               andere.get("incoterm")] if x]
        slot = "No counterparty introduction or binding commercial commitment is being made by this message."
        if template == "supplier_qualification":
            onderwerp = f"{product} — supply qualification"
            tekst = ("Thank you for your interest in working with NorthSea Commodity Partners.\n\n"
                     "To progress this opportunity without disclosing the buyer at this stage, please confirm the legal selling entity, "
                     "whether you are the principal or an authorised seller, current executable allocation, origin/refinery/brand, "
                     "loading point, available Incoterms, accepted payment instruments, lead time, and the documents and inspection "
                     "package available for the material.")
        elif template == "buyer_qualification":
            onderwerp = f"{product} — requirement qualification"
            tekst = ("Thank you for your interest in working with NorthSea Commodity Partners.\n\n"
                     "To progress this requirement without disclosing any supplier at this stage, please confirm the legal buying entity "
                     "and authorised contact, exact product/grade and purity, trial and recurring quantity, destination port, Incoterm, "
                     "accepted payment instrument, target shipment timing, and whether NorthSea Commodity Partners may coordinate the "
                     "qualification process on your behalf.")
        elif template == "follow_up":
            onderwerp = f"Re: {product}"
            tekst = f"Following up on our previous message regarding {product}."
            if onbekend:
                tekst += "\n\nTo move forward we still need: " + ", ".join(o.replace("_", " ") for o in onbekend) + "."
        elif template == "decline_not_executable":
            onderwerp = f"Re: {product}"
            tekst = (f"Thank you for the information provided regarding {product}. "
                     "Based on what we currently hold, NorthSea Commodity Partners is not in a position to progress this further at this time.")
        elif template == "deal_alignment":
            onderwerp = f"Re: {product} — confirming alignment"
            tekst = (f"Before we proceed further on {product}, we would like to confirm alignment on the terms discussed so far.")
        elif template == "controlled_introduction":
            onderwerp = f"{product} — proposed introduction"
            tekst = (f"NorthSea Commodity Partners is considering a controlled introduction between the parties on {product}. "
                     "This message does not itself disclose either party's identity, confirm any commercial term, or make any "
                     "commitment on behalf of NorthSea Commodity Partners or either party. An introduction proceeds only after "
                     "commission protection is signed and with explicit human approval.")
        elif template == "tender_specific_request":
            onderwerp = f"{product} — tender/RFT compliance request"
            tekst = (f"This enquiry relates to a formal tender/RFT process for {product}. To assess eligibility, please confirm "
                     "your trading history and references for this material, certification and traceability capability, "
                     "compliance with the stated specification, and your ability to meet the tender's submission method and deadline.")
        elif template == "delivery_failure":
            onderwerp = f"{product} — confirming receipt"
            tekst = (f"A previous message from NorthSea Commodity Partners regarding {product} may not have reached the intended "
                     "recipient. If you are the correct contact for this matter, please confirm receipt; if not, please advise "
                     "who we should address instead.")
        elif template == "bounce_handling":
            onderwerp = f"{product} — alternate contact requested"
            tekst = (f"Our previous message regarding {product} could not be delivered to the address on file. Could you provide "
                     "an alternate, verified contact channel (email, phone or LinkedIn) so we can continue this conversation?")
        else:
            onderwerp = f"{product} — documentation request"
            tekst = (f"To continue our review of {product}, please share the documentation you can provide at this stage "
                     "(company registration, product specification and certificate of analysis, and evidence of "
                     f"{'authority to sell and allocation' if kant == 'supplier' else 'purchasing authority and payment capability'}).")
        NARROW_TEMPLATES = ("decline_not_executable", "deal_alignment", "controlled_introduction", "delivery_failure", "bounce_handling")
        if ref and template in ("supplier_qualification", "buyer_qualification", "deal_alignment"):
            tekst += "\n\nFor reference, the " + ("requirement" if kant == "supplier" else "offer") + " under review concerns: " + ", ".join(map(str, ref)) + "."
        if onbekend and template not in ("follow_up", *NARROW_TEMPLATES):
            tekst += "\n\nFrom the information we hold, the following points are still open: " + ", ".join(o.replace("_", " ") for o in onbekend) + "."
        if template == "decline_not_executable":
            tekst += "\n\nWe appreciate your time and will keep your details on file should this change.\n\nKind regards,\nNorthSea Commodity Partners"
        elif template == "controlled_introduction":
            tekst += "\n\nKind regards,\nNorthSea Commodity Partners"  # eigen, sterkere disclaimer staat al in de hoofdtekst hierboven
        else:
            tekst += f"\n\n{slot}\n\nKind regards,\nNorthSea Commodity Partners"

        gevoelig = is_sensitive_text(objective) or is_sensitive_text(tekst.replace(slot, ""))
        notes = ["Draft only. Nothing was sent.",
                 "Sending requires a human approval (northsea_approve_draft or the Deal Desk), then northsea_send_approved_communication."]
        if beleid == "review_required":
            notes.append("Contact policy is review_required: automation is blocked; only Luka can decide whether to contact this counterparty.")
        if objective.strip():
            notes.append("The objective was used to choose the template; it is not quoted into the message.")
        if gevoelig and (opp or {}).get("commission_agreement_status") != "signed":
            notes.append("Objective touches approval-gated topics (identity, commission, binding terms): approval will be refused until commission protection is signed.")
        saved_id = saved_status = None
        if save_as_pending_draft:
            if channel != "email":
                raise ServiceError("unsupported", "Only email drafts can be saved; other channels are returned as text.")
            if not primair:
                raise ServiceError("no_recipient", "No contact with an email address on record for this counterparty; draft not saved.")
            # reply_drafts.communication_id is NOT NULL in AXE Commodities: een Deal
            # Desk-draft is altijd een antwoord op een bestaande e-mail (en
            # send-approved-reply threadt daarop). Zonder zo'n e-mail van DEZE
            # tegenpartij geen opslag -- de tekst komt wel terug.
            draden = await self.repo.list_communications(opportunity_id=opp["id"], limit=20) if opp else []
            if company and not any(c.get("company_id") == company["id"] for c in draden):
                draden = await self.repo.list_communications(company_id=company["id"], limit=20)
            draad = next((c for c in draden if c.get("channel") == "email" and c.get("direction") == "inbound"
                          and company and c.get("company_id") == company["id"]), None)
            if not draad:
                saved_status = "not_saved_no_email_thread"
                notes.append("Not saved: Deal Desk drafts reply to an existing inbound email from this counterparty, and there is none yet. "
                             "Use the text above for a first message from the NorthSea mailbox.")
            else:
                rij = await self.repo.insert_reply_draft({
                    "communication_id": draad["id"], "company_id": company["id"], "contact_id": primair.get("id"),
                    "opportunity_id": (opp or {}).get("id"), "to_email": primair["email"], "subject": onderwerp[:300],
                    "body": tekst[:10000], "purpose": f"NorthSea MCP outreach: {template}", "approval_status": "pending",
                    "sensitive_action": gevoelig, "generated_by": "northsea-mcp"})
                saved_id, saved_status = rij.get("id"), rij.get("approval_status")
                notes.append("Saved as a pending draft in the Deal Desk, as a reply to the latest inbound email.")
        return OutreachDraft(objective=objective, channel=channel if channel in ("email", "phone", "linkedin", "whatsapp") else "email",
                             template=template, recipient=party_view(company, kant, caller, contacts),
                             to_email=primair.get("email") if (primair and caller.identity) else None,
                             subject=onderwerp, body=tekst, facts_used=feiten, unknowns=[o.replace("_", " ") for o in onbekend] or list(gaps[:3]),
                             sensitive=gevoelig, approval_required=True, sent=False, saved_draft_id=saved_id,
                             saved_status=saved_status, notes=notes)

    # ── 8. process_reply ─────────────────────────────────────────────────────
    async def process_reply(self, caller: Caller, *, communication_id: str) -> ReplyAnalysis:
        comm = await self.repo.get_communication(communication_id)
        if not comm:
            raise NotFound("communication")
        intel, call, drafts = await asyncio.gather(
            self.repo.get_email_intelligence(comm["id"]) if comm.get("channel") == "email" else asyncio.sleep(0, None),
            self.repo.get_call_intelligence(comm["id"]) if comm.get("channel") == "phone" else asyncio.sleep(0, None),
            self.repo.list_drafts_for_communication(comm["id"]))
        company = await self.repo.get_company(comm["company_id"]) if comm.get("company_id") else None
        contacts = await self.repo.list_contacts(company["id"]) if company else []
        red = Redactor(caller)
        red.company(company, "[counterparty]")
        red.contacts(contacts, "[contact]")
        body = comm.get("body") or ""
        if intel:
            bron, klass = "email_intelligence", intel.get("classification") or "unknown"
            termen = intel.get("extracted_terms") if isinstance(intel.get("extracted_terms"), dict) else {}
        elif call:
            bron, klass = "call_intelligence", call.get("caller_type") or "unknown"
            termen = {k: call.get(k) for k in ("commodity", "product", "grade", "quantity_mt", "frequency", "origin", "destination", "incoterm", "payment_terms")}
        else:
            bron = "derived"
            t = body.lower()
            klass = ("supplier" if re.search(r"we can supply|we supply|available stock|monthly capacity|seller mandate", t)
                     else "buyer" if re.search(r"we require|looking to buy|want to buy|purchase|buyer requirement|seeking", t) else "unknown")
            termen = {}
        feiten = [Claim(field=k, value=v, state="unverified", basis=f"{bron} (explicitly stated by the counterparty)")
                  for k, v in termen.items() if v not in (None, "", [], {})]
        vragen = []
        for zin in re.split(r"(?<=[.?!])\s+|\n+", body):
            if "?" in zin and len(zin.strip()) > 8:
                vragen.append(red(zin.strip())[:300])
        gewijzigd = []
        if comm.get("opportunity_id"):
            opp = await self.repo.get_opportunity(comm["opportunity_id"])
            if opp:
                basis = offer_of(opp) if klass == "supplier" else req_of(opp)
                for k, v in termen.items():
                    oud = basis.get(k)
                    if v not in (None, "") and oud not in (None, "") and matching._norm(str(v)) != matching._norm(str(oud)):
                        gewijzigd.append({"field": k, "on_record": oud, "stated_now": v})
        blockers, vlaggen = [], []
        if intel:
            mist = intel.get("missing_information") or []
            if mist:
                blockers.append(Blocker(code="missing_information", description="Not yet provided: " + red("; ".join(map(str, mist))),
                                        source="email_intelligence"))
            vlaggen = [red(x) for x in (intel.get("red_flags") or [])]
        if gewijzigd:
            blockers.append(Blocker(code="terms_changed", description="Stated terms differ from the record: " + ", ".join(g["field"] for g in gewijzigd),
                                    source="process_reply"))
        goedkeuring = bool((intel or {}).get("requires_human_approval")) or is_sensitive_text(body) or bool((call or {}).get("requires_human_review"))
        if drafts:
            d = drafts[0]
            advies = {"draft_id": d.get("id"), "status": d.get("approval_status"), "sent": bool(d.get("sent_at")),
                      "subject": red(d.get("subject")), "sensitive": bool(d.get("sensitive_action"))}
        else:
            advies = {"template": f"{klass}_qualification" if klass in ("buyer", "supplier") else "follow_up",
                      "prepare_with": "northsea_prepare_outreach", "approval_required": True,
                      "note": "No draft exists for this message yet."}
        taken = []
        if (intel or {}).get("recommended_action"):
            taken.append({"task_type": "follow_up", "title": red(intel["recommended_action"])[:200], "requires_approval": goedkeuring,
                          "create_with": "northsea_create_task"})
        if gewijzigd:
            taken.append({"task_type": "review_terms", "title": "Review changed terms: " + ", ".join(g["field"] for g in gewijzigd),
                          "requires_approval": True, "create_with": "northsea_create_task"})
        return ReplyAnalysis(communication_id=comm["id"], channel=comm.get("channel"), direction=comm.get("direction"),
                             classification=klass, analysis_source=bron,
                             counterparty=party_view(company, klass if klass in ("buyer", "supplier") else "counterparty", caller, contacts) if company else None,
                             facts=feiten, questions=vragen[:10], changed_terms=gewijzigd, blockers=blockers, red_flags=vlaggen,
                             recommended_reply=advies, recommended_tasks=taken, requires_human_approval=goedkeuring)

    # ── 9. review_deal ───────────────────────────────────────────────────────
    async def review_deal(self, caller: Caller, *, opportunity_id: str) -> DealReview:
        ctx = await self._deal_context(opportunity_id, caller)
        opp, red, t = ctx["opp"], ctx["red"], now()
        acties = rank_actions(opp, ctx["tasks"], ctx["queue"], ctx["blockers"], red)
        taken = [{"id": x.get("id"), "task_type": x.get("task_type"), "title": red(x.get("title")), "status": x.get("status"),
                  "priority": x.get("priority"), "owner": x.get("owner"), "requires_approval": x.get("requires_approval"),
                  "due_at": x.get("due_at"), "source": "deal_tasks"}
                 for x in ctx["tasks"] if (x.get("status") or "") in ("open", "waiting", "in_progress")]
        taken += [{"id": x.get("id"), "task_type": x.get("action_type"), "title": red(x.get("title")), "status": x.get("status"),
                   "priority": x.get("priority"), "owner": "axe", "requires_approval": x.get("requires_approval"),
                   "due_at": x.get("due_at"), "source": "action_queue"} for x in ctx["queue"]]
        deadlines = []
        for x in taken:
            d = parse_ts(x.get("due_at"))
            if d:
                deadlines.append({"what": x["title"], "due_at": x["due_at"], "overdue": d < t, "source": x["source"]})
        if parse_ts(opp.get("next_action_at")):
            deadlines.append({"what": red(opp.get("next_action") or "Next action"), "due_at": opp["next_action_at"],
                              "overdue": parse_ts(opp["next_action_at"]) < t, "source": "opportunity.next_action_at"})
        deadlines.sort(key=lambda d: d["due_at"])
        code = opp.get("deal_priority") if isinstance(opp.get("deal_priority"), str) and DEAL_CODE.match(opp["deal_priority"].strip()) else None
        return DealReview(
            opportunity_id=opp["id"], code=code, stage=opp.get("stage"), execution_state=opp.get("execution_state"),
            qualification_status=opp.get("qualification_status"),
            product=ctx["req"].get("product") or ctx["off"].get("product") or ctx["req"].get("commodity"),
            buyer=party_view(ctx["bc"], "buyer", caller, ctx["contacts_b"]),
            seller=party_view(ctx["sc"], "supplier", caller, ctx["contacts_s"]),
            buyer_requirement=summary_requirement(ctx["req"]), supplier_offer=summary_offer(ctx["off"]), gates=ctx["gates"],
            commercial_fit_score=matching.match_score(ctx["req"], ctx["off"]) if ctx["req"] and ctx["off"] else int(opp.get("match_score") or 0),
            transaction_readiness_score=ctx["readiness"], commission_protection=opp.get("commission_agreement_status"),
            latest_communications=[{"id": c.get("id"), "direction": c.get("direction"), "channel": c.get("channel"),
                                    "occurred_at": c.get("occurred_at"), "subject": red(c.get("subject")),
                                    "summary": red(c.get("body"))[:280], "delivery_status": c.get("delivery_status")} for c in ctx["comms"]],
            open_blockers=ctx["blockers"],
            evidence=[{"id": e.get("id"), "party_side": e.get("party_side"), "evidence_type": e.get("evidence_type"),
                       "claim": red(e.get("claim"))[:300], "verification_status": e.get("verification_status"),
                       "source_type": e.get("source_type"), "verified_at": e.get("verified_at")} for e in ctx["evidence"][:25]],
            tasks=taken, deadlines=deadlines, next_best_actions=acties[:5], approval_required=bool(opp.get("approval_required")),
            updated_at=opp.get("updated_at"))

    # ── 10. get_next_actions ─────────────────────────────────────────────────
    async def get_next_actions(self, caller: Caller, *, opportunity_id: str) -> NextActions:
        ctx = await self._deal_context(opportunity_id, caller)
        return NextActions(opportunity_id=ctx["opp"]["id"],
                           actions=rank_actions(ctx["opp"], ctx["tasks"], ctx["queue"], ctx["blockers"], ctx["red"]),
                           ranking="impact x3 + urgency x2 - 1 if approval required - dependencies; duplicates removed")

    # ── Schrijven ────────────────────────────────────────────────────────────
    # Dezelfde woorden als de rest van NorthSea: resend-lifecycle telt open/in_progress
    # als open, en action_queue sluit met completed/cancelled (check-constraint).
    TASK_STATUSES = ("open", "waiting", "in_progress", "completed", "cancelled")

    async def create_task(self, caller: Caller, *, opportunity_id: str, title: str, description: str | None = None,
                          task_type: str = "follow_up", priority: int = 50, due_at: str | None = None,
                          requires_approval: bool = False, owner: str = "axe") -> TaskResult:
        title = (title or "").strip()
        if not 3 <= len(title) <= 200:
            raise ServiceError("invalid_input", "title must be 3-200 characters")
        if not re.fullmatch(r"[a-z_]{3,40}", task_type or ""):
            raise ServiceError("invalid_input", "task_type must be lowercase letters and underscores")
        if not 0 <= int(priority) <= 100:
            raise ServiceError("invalid_input", "priority must be 0-100")
        if due_at and not parse_ts(due_at):
            raise ServiceError("invalid_input", "due_at must be an ISO 8601 timestamp")
        if owner not in ("axe", "luka"):
            raise ServiceError("invalid_input", "owner must be axe or luka")
        opp = await self.repo.get_opportunity(opportunity_id)
        if not opp:
            raise NotFound("opportunity")
        if task_type not in REVIEW_TASK_TYPES:
            beleid = await self.repo.outbound_block_reason(opportunity_id=opp["id"])
            if beleid in ("do_not_contact", "synthetic", "bounced_channel"):
                raise PolicyDenied("contact_policy_blocked",
                                   f"This deal is blocked by contact policy ({beleid}); only review tasks ({', '.join(sorted(REVIEW_TASK_TYPES))}) can be created.")
        for t in await self.repo.list_deal_tasks(opp["id"], open_only=True):
            if (t.get("task_type") == task_type) and (t.get("title") or "").strip().casefold() == title.casefold():
                return TaskResult(task_id=t["id"], opportunity_id=opp["id"], status=t.get("status") or "open", title=t["title"],
                                  created=False, duplicate_of_existing=True, updated_at=t.get("updated_at"))
        rij = await self.repo.insert_deal_task({
            "opportunity_id": opp["id"], "task_type": task_type, "title": title, "description": (description or "")[:4000] or None,
            "status": "open", "priority": int(priority), "owner": owner, "requires_approval": bool(requires_approval),
            "due_at": due_at, "auto_execute": False})
        await self.repo.insert_deal_event({"opportunity_id": opp["id"], "event_type": "task_created", "actor": f"mcp:{caller.client_id}"[:100],
                                           "summary": f"Task created via NorthSea MCP: {title[:120]}", "metadata": {"task_id": rij.get("id")}})
        return TaskResult(task_id=rij["id"], opportunity_id=opp["id"], status=rij.get("status") or "open", title=rij.get("title") or title,
                          created=True, updated_at=rij.get("updated_at"))

    async def update_task(self, caller: Caller, *, task_id: str, status: str | None = None, result_note: str | None = None,
                          due_at: str | None = None, priority: int | None = None, expected_updated_at: str | None = None) -> TaskResult:
        taak = await self.repo.get_task(task_id)
        if not taak:
            raise NotFound("task")
        patch: dict[str, Any] = {"updated_at": now().isoformat()}
        if status is not None:
            if status not in self.TASK_STATUSES:
                raise ServiceError("invalid_input", f"status must be one of {', '.join(self.TASK_STATUSES)}")
            if taak.get("status") in ("completed", "cancelled", "done") and status != taak.get("status"):
                raise PolicyDenied("task_closed", "A closed task cannot be reopened through MCP; create a new task instead.")
            if status == "completed" and taak.get("requires_approval") and "northsea.admin" not in caller.scopes:
                raise PolicyDenied("approval_required", "This task requires approval; completing it needs northsea.admin.")
            patch["status"] = status
            if status == "completed":
                patch["completed_at"] = now().isoformat()
        if result_note is not None:
            patch["result"] = {**(taak.get("result") if isinstance(taak.get("result"), dict) else {}),
                               "note": result_note[:2000], "by": caller.principal}
        if due_at is not None:
            if not parse_ts(due_at):
                raise ServiceError("invalid_input", "due_at must be an ISO 8601 timestamp")
            patch["due_at"] = due_at
        if priority is not None:
            if not 0 <= int(priority) <= 100:
                raise ServiceError("invalid_input", "priority must be 0-100")
            patch["priority"] = int(priority)
        if len(patch) == 1:
            raise ServiceError("invalid_input", "Nothing to update.")
        rij = await self.repo.update_deal_task(taak["id"], expected_updated_at or taak.get("updated_at"), patch)
        if not rij:
            raise PolicyDenied("conflict", "The task changed since it was read. Reload it and try again.")
        if taak.get("opportunity_id"):
            await self.repo.insert_deal_event({"opportunity_id": taak["opportunity_id"], "event_type": "task_updated",
                                               "actor": f"mcp:{caller.client_id}"[:100],
                                               "summary": f"Task updated via NorthSea MCP: {', '.join(k for k in patch if k != 'updated_at')}",
                                               "metadata": {"task_id": taak["id"], "status": patch.get("status")}})
        return TaskResult(task_id=rij["id"], opportunity_id=rij.get("opportunity_id"), status=rij.get("status") or "", title=rij.get("title") or "",
                          created=False, updated_at=rij.get("updated_at"))

    async def approve_draft(self, caller: Caller, *, draft_id: str, expected_updated_at: str | None = None) -> DraftApprovalResult:
        d = await self.repo.get_draft(draft_id)
        if not d:
            raise NotFound("draft")
        if d.get("sent_at") or d.get("resend_email_id") or d.get("approval_status") == "sent":
            raise PolicyDenied("already_sent", "This draft has already been sent.")
        if d.get("approval_status") == "approved":
            return DraftApprovalResult(draft_id=d["id"], approval_status="approved", approved_at=d.get("approved_at"),
                                       sensitive=bool(d.get("sensitive_action")), message="Draft was already approved.")
        if d.get("approval_status") != "pending":
            raise PolicyDenied("not_pending", "Only pending drafts can be approved.")
        if not caller.is_human:
            raise PolicyDenied("human_approval_required",
                               "Draft approval must come from a signed-in human user; a service credential cannot approve.")
        opp = await self.repo.get_opportunity(d["opportunity_id"]) if d.get("opportunity_id") else None
        check_sensitive_draft(d, opp)
        beleid = await self.repo.outbound_block_reason(company_id=d.get("company_id"), contact_id=d.get("contact_id"),
                                                       email=d.get("to_email"), opportunity_id=d.get("opportunity_id"))
        if beleid in ("do_not_contact", "synthetic", "bounced_channel"):
            raise PolicyDenied("contact_policy_blocked", f"This draft cannot be approved: contact policy ({beleid}).")
        tijd = now().isoformat()
        rij = await self.repo.update_draft_if(d["id"], expected_updated_at or d["updated_at"],
                                              {"approval_status": "approved", "approved_at": tijd, "updated_at": tijd,
                                               "approved_by": caller.principal, "approval_actor_type": "human",
                                               "approval_channel": "northsea_mcp", "lifecycle_state": "human_approved"})
        if not rij:
            raise PolicyDenied("conflict", "The draft changed since it was read. Reload it and review it again.")
        if opp:
            await self.repo.insert_deal_event({"opportunity_id": opp["id"], "event_type": "draft_approved", "actor": caller.principal[:100],
                                               "summary": "Reply draft approved via NorthSea MCP.", "metadata": {"draft_id": d["id"]}})
        return DraftApprovalResult(draft_id=d["id"], approval_status="approved", approved_at=tijd,
                                   sensitive=bool(d.get("sensitive_action")), message="Draft approved. It has not been sent.")

    async def send_approved_communication(self, caller: Caller, *, draft_id: str, confirm: bool) -> SendResult:
        if confirm is not True:
            raise PolicyDenied("confirmation_required", "Sending requires confirm=true after a human reviewed the approved draft.")
        d = await self.repo.get_draft(draft_id)
        if not d:
            raise NotFound("draft")
        if d.get("sent_at") or d.get("resend_email_id") or d.get("approval_status") == "sent":
            return SendResult(draft_id=d["id"], submitted=False, duplicate=True, communication_id=None,
                              provider_message_id=d.get("resend_email_id"), message="This draft was already sent; nothing was sent again.")
        if d.get("approval_status") != "approved":
            raise PolicyDenied("draft_not_approved", "A human must approve the draft first (northsea_approve_draft or the Deal Desk).")
        if d.get("approval_actor_type") != "human" or not str(d.get("approved_by") or "").strip():
            raise PolicyDenied("human_approval_provenance_missing",
                               "This draft has no recorded human approval (approver unknown). Reject and re-approve it before sending.")
        opp = await self.repo.get_opportunity(d["opportunity_id"]) if d.get("opportunity_id") else None
        check_sensitive_draft(d, opp)
        beleid = await self.repo.outbound_block_reason(company_id=d.get("company_id"), contact_id=d.get("contact_id"),
                                                       email=d.get("to_email"), opportunity_id=d.get("opportunity_id"))
        if beleid in ("do_not_contact", "synthetic", "bounced_channel"):
            raise PolicyDenied("contact_policy_blocked", f"Sending is blocked by contact policy ({beleid}). Nothing was sent.")
        res = await self.repo.send_approved_reply(d["id"], requested_by=caller.principal)
        if res.get("ok"):
            if opp and not res.get("duplicate"):
                await self.repo.insert_deal_event({"opportunity_id": opp["id"], "event_type": "approved_email_sent",
                                                   "actor": caller.principal[:100], "summary": "Approved reply sent via NorthSea MCP.",
                                                   "metadata": {"draft_id": d["id"], "resend_email_id": res.get("resend_email_id")}})
            return SendResult(draft_id=d["id"], submitted=not res.get("duplicate"), duplicate=bool(res.get("duplicate")),
                              communication_id=res.get("communication_id"), provider_message_id=res.get("resend_email_id"),
                              message="Email submitted to the provider. Delivery is not yet confirmed." if not res.get("duplicate")
                              else "This draft was already sent; nothing was sent again.")
        code = str(res.get("error") or "send_failed")
        veilig = {"draft_not_approved": "The draft is not approved.", "draft_incomplete": "The draft is missing recipient, subject or body.",
                  "resend_not_configured": "Email sending is not configured.", "resend_send_failed": "The email provider rejected the message.",
                  "forbidden": "The send function refused the server credentials.",
                  "contact_policy_blocked": "Contact policy blocks sending to this counterparty. Nothing was sent.",
                  "human_approval_provenance_missing": "The draft has no recorded human approval. Nothing was sent.",
                  "commission_protection_required": "Signed commission protection is required for this sensitive draft. Nothing was sent."}
        raise ServiceError(code if code in veilig else "send_failed",
                           veilig.get(code, "Sending could not be confirmed. Check the draft in the Deal Desk before retrying."))

    # ── Gezondheid ────────────────────────────────────────────────────────────
    async def health(self) -> dict:
        uit: dict[str, Any] = {}
        try:
            uit["supabase"] = await self.repo.ping()
        except Exception as e:  # noqa: BLE001
            uit["supabase"] = False
            uit["supabase_error"] = type(e).__name__
        ok, reden = self.crew.available()
        uit["crewai"] = ok
        uit["crewai_detail"] = reden
        if hasattr(self.crew, "status"):
            uit["crewai_backends"] = self.crew.status()
        uit["research_perplexity"] = self.research.perplexity_configured
        uit["research_search"] = self.research.search_configured
        return uit
