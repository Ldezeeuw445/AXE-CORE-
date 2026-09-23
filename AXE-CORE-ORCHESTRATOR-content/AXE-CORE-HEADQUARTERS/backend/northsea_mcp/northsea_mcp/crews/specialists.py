"""Deterministische specialist-logica voor de drie echte crews.

Dit is de lokale production-runtime zonder live LLM: dezelfde agents/tasks
als de YAML-export, gevoed door canonical NorthSea-state. CrewAI (optioneel)
wrapt dezelfde definities; golden tests gebruiken deze functies + mock tools.
"""
from __future__ import annotations

from typing import Any

from .tools import CanonicalStateTool, MockExaTool, MockMarketTool, MockScrapeTool

COMMERCIAL_DIMS = (
    "product", "grade", "quantity", "incoterm", "payment",
    "origin", "timing", "price",
)
DOC_CATS = (
    "kyc", "mandate", "coa", "inspection", "spa", "ncnda", "insurance", "bl",
)
RISK_CATS = (
    "authority", "payment_mismatch", "origin", "allocation", "kyc",
    "logistics", "docs", "comms_sla", "exclusivity",
)

FACT_LEVELS = ("VERIFIED", "SELF-CLAIMED", "INFERRED", "UNKNOWN", "CONFLICTING")


def _dump(model: Any) -> Any:
    if model is None:
        return None
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if isinstance(model, list):
        return [_dump(x) for x in model]
    return model


def _state(handoff: dict[str, Any]) -> dict[str, Any]:
    return CanonicalStateTool(handoff).read()


def _deal(state: dict[str, Any]) -> dict[str, Any]:
    return state.get("deal") or {}


def _req(deal: dict[str, Any]) -> dict[str, Any]:
    return deal.get("requirement") or {}


def _offer(deal: dict[str, Any]) -> dict[str, Any]:
    return deal.get("offer") or {}


def _status(ok: bool, missing: bool = False, failed: bool = False) -> str:
    if failed:
        return "FAILED"
    if missing:
        return "MISSING"
    if ok:
        return "OK"
    return "PARTIAL"


def run_deal_execution(handoff: dict[str, Any]) -> dict[str, Any]:
    state = _state(handoff)
    deal = _deal(state)
    req, off = _req(deal), _offer(deal)
    buyer, seller = deal.get("buyer") or {}, deal.get("seller") or {}
    evidence = deal.get("evidence") or []
    blockers = deal.get("blockers") or []
    origin = (off.get("origin") or deal.get("origin") or "").strip()
    origin_ok = bool(origin)
    payment_req = (req.get("payment_terms") or "").lower()
    payment_off = (off.get("payment_terms") or "").lower()
    mandate = (off.get("mandate_status") or "").lower()
    loading_port = off.get("loading_port")
    buyer_v = (buyer.get("verification_state") or "unknown").lower()
    seller_v = (seller.get("verification_state") or "unknown").lower()

    ingested = {
        "deal_id": deal.get("deal_id") or deal.get("id"),
        "stage": deal.get("stage") or "SEARCH",
        "execution_state": deal.get("execution_state"),
        "gates": deal.get("gates") or [],
        "source": state.get("source"),
        "file_read": False,
    }

    buyer_missing_legal = buyer_v in ("unknown", "unverified", "") or not buyer.get("counterparty_id")
    buyer_missing_pay = not payment_req
    buyer_items = {
        "legal_entity": _status(not buyer_missing_legal, missing=buyer_missing_legal),
        "authority": _status(buyer_v == "verified", missing=buyer_v != "verified"),
        "payment_instrument": _status(bool(payment_req), missing=not payment_req),
        "spec": _status(bool(req.get("product") or req.get("grade"))),
    }
    buyer_score = sum(10 if v == "OK" else 4 if v == "PARTIAL" else 0 for v in buyer_items.values())
    buyer_score = min(20, buyer_score)
    if buyer_missing_legal or buyer_missing_pay or buyer_items["authority"] in ("MISSING", "FAILED"):
        buyer_score = min(buyer_score, 10)
    buyer_blockers = [k for k, v in buyer_items.items() if v in ("MISSING", "FAILED")]

    seller_missing_principal = "unverified" in mandate or "claimed" in mandate or seller_v != "verified"
    seller_missing_alloc = not off.get("monthly_capacity_mt") and not off.get("quantity_mt")
    seller_missing_spec = not (off.get("product") or off.get("grade"))
    seller_items = {
        "principal_or_authorized": _status(not seller_missing_principal, missing=seller_missing_principal),
        "allocation": _status(not seller_missing_alloc, missing=seller_missing_alloc),
        "spec": _status(not seller_missing_spec, missing=seller_missing_spec),
        "origin": _status(origin_ok, missing=not origin_ok),
    }
    seller_score = sum(10 if v == "OK" else 4 if v == "PARTIAL" else 0 for v in seller_items.values())
    seller_score = min(20, seller_score)
    if seller_missing_principal or seller_missing_alloc or seller_missing_spec:
        seller_score = min(seller_score, 10)
    seller_blockers = [k for k, v in seller_items.items() if v in ("MISSING", "FAILED")]

    def gap(dim: str) -> dict[str, str]:
        def colour(ok: bool, confirmed: bool) -> str:
            if not confirmed:
                return "RED"
            return "GREEN" if ok else "AMBER"

        if dim == "product":
            confirmed = bool(req.get("product") and off.get("product"))
            ok = (req.get("product") or "").lower() == (off.get("product") or "").lower() if confirmed else False
            return {"dimension": dim, "status": colour(ok, confirmed), "note": "unconfirmed" if not confirmed else "aligned" if ok else "mismatch"}
        if dim == "grade":
            confirmed = bool(req.get("grade") and off.get("grade"))
            ok = confirmed and str(req.get("grade")).lower() in str(off.get("grade")).lower()
            return {"dimension": dim, "status": colour(ok, confirmed), "note": "unconfirmed" if not confirmed else "aligned" if ok else "mismatch"}
        if dim == "quantity":
            confirmed = req.get("quantity_mt") is not None and (off.get("quantity_mt") or off.get("monthly_capacity_mt")) is not None
            rq, oq = req.get("quantity_mt") or 0, off.get("quantity_mt") or off.get("monthly_capacity_mt") or 0
            ok = confirmed and oq >= rq
            return {"dimension": dim, "status": colour(ok, confirmed), "note": "capacity vs requirement"}
        if dim == "incoterm":
            confirmed = bool(req.get("incoterm") and off.get("incoterm"))
            ok = confirmed and str(req.get("incoterm")).upper() == str(off.get("incoterm")).upper()
            return {"dimension": dim, "status": colour(ok, confirmed), "note": "unconfirmed" if not confirmed else "aligned" if ok else "mismatch"}
        if dim == "payment":
            confirmed = bool(payment_req and payment_off)
            ok = confirmed and ("lc" in payment_req and "letter of credit" in payment_off or payment_req[:2] == payment_off[:2])
            # email TT vs LC is a drift signal, not assumed aligned
            if "tt" in payment_off and "lc" in payment_req:
                ok = False
            return {"dimension": dim, "status": colour(ok, confirmed), "note": "unconfirmed" if not confirmed else "aligned" if ok else "mismatch"}
        if dim == "origin":
            return {"dimension": dim, "status": "GREEN" if origin_ok else "RED",
                    "note": origin if origin_ok else "ORIGIN UNCONFIRMED"}
        if dim == "timing":
            confirmed = bool(req.get("required_delivery") or req.get("frequency"))
            return {"dimension": dim, "status": "AMBER" if confirmed else "RED", "note": "window not fully evidenced"}
        if dim == "price":
            confirmed = bool(off.get("price_basis") or req.get("price_basis"))
            return {"dimension": dim, "status": "AMBER" if confirmed else "RED", "note": "unconfirmed" if not confirmed else "indicative only"}
        return {"dimension": dim, "status": "RED", "note": "UNCONFIRMED"}

    commercial_gaps = [gap(d) for d in COMMERCIAL_DIMS]
    evidence_types = {(e.get("evidence_type") or "").lower() for e in evidence}
    evidence_status = []
    for cat in DOC_CATS:
        if cat in evidence_types or any(cat in (e.get("evidence_type") or "").lower() for e in evidence):
            ver = next((e.get("verification_status") for e in evidence if cat in (e.get("evidence_type") or "").lower()), "unverified")
            mark = "PARTIAL" if ver != "verified" else "COMPLETE"
        else:
            mark = "MISSING"
        evidence_status.append({"category": cat, "status": mark})

    logistics_score = 8 if origin_ok and loading_port else (4 if origin_ok else 2)
    if not origin_ok:
        logistics_score = min(logistics_score, 5)
    logistics = {
        "origin": origin or "ORIGIN UNCONFIRMED",
        "origin_status": "CONFIRMED" if origin_ok else "ORIGIN UNCONFIRMED",
        "loading_port": loading_port or "UNKNOWN",
        "incoterm": off.get("incoterm") or req.get("incoterm"),
        "logistics_score": logistics_score,
    }

    risk_flags = []
    if seller_missing_principal:
        risk_flags.append({"category": "authority", "rating": "CRITICAL", "note": "seller authority/mandate unverified"})
    if commercial_gaps[4]["status"] == "RED":
        risk_flags.append({"category": "payment_mismatch", "rating": "HIGH", "note": "payment terms unconfirmed or mismatched"})
    if not origin_ok:
        risk_flags.append({"category": "origin", "rating": "HIGH", "note": "ORIGIN UNCONFIRMED"})
    if seller_missing_alloc:
        risk_flags.append({"category": "allocation", "rating": "HIGH", "note": "executable allocation not evidenced"})
    if buyer_v != "verified":
        risk_flags.append({"category": "kyc", "rating": "MEDIUM", "note": "buyer KYC/verification incomplete"})
    if not loading_port:
        risk_flags.append({"category": "logistics", "rating": "MEDIUM", "note": "loading port UNKNOWN"})
    if any(x["status"] == "MISSING" for x in evidence_status):
        risk_flags.append({"category": "docs", "rating": "MEDIUM", "note": "protection documents missing"})
    waiting = deal.get("waiting_since")
    if waiting:
        risk_flags.append({"category": "comms_sla", "rating": "MEDIUM", "note": "deal has been waiting on a counterparty"})
    risk_flags.append({"category": "exclusivity", "rating": "LOW", "note": "no exclusivity commitment may be made by this crew"})

    docs_pts = round(15 * (sum(1 for x in evidence_status if x["status"] != "MISSING") / len(DOC_CATS)))
    gap_pts = round(15 * (sum(1 for g in commercial_gaps if g["status"] == "GREEN") / len(COMMERCIAL_DIMS)))
    risk_penalty = 15 if any(r["rating"] == "CRITICAL" for r in risk_flags) else (8 if any(r["rating"] == "HIGH" for r in risk_flags) else 0)
    readiness = max(0, min(100, buyer_score + seller_score + docs_pts + gap_pts + logistics_score - risk_penalty))

    current_blocker = None
    if blockers:
        current_blocker = blockers[0].get("description") or blockers[0].get("code")
    elif seller_blockers:
        current_blocker = "seller:" + seller_blockers[0]
    elif buyer_blockers:
        current_blocker = "buyer:" + buyer_blockers[0]
    else:
        current_blocker = "unspecified_gap"

    critical = [r for r in risk_flags if r["rating"] == "CRITICAL"]
    nba_focus = critical[0]["note"] if critical else current_blocker
    approval_required = bool(deal.get("approval_required")) or any(r["rating"] == "CRITICAL" for r in risk_flags)
    next_best_action = {
        "action": f"Obtain source-supported evidence for: {nba_focus}",
        "owner": deal.get("action_owner") or "axe",
        "deadline_days": 3 if critical else 7,
        "missing_evidence": seller_blockers + buyer_blockers,
        "approval_type": "human_review" if approval_required else None,
        "approval_required": approval_required,
    }

    analysis = (
        f"Deal {ingested['deal_id'] or '(unknown)'} readiness {readiness}/100. "
        f"Primary blocker: {current_blocker}. "
        f"Origin: {logistics['origin_status']}. "
        "No documents signed or commercial terms committed."
    )
    return {
        "analysis": analysis,
        "deal_state": ingested,
        "buyer_qualification": {"items": buyer_items, "buyer_score": buyer_score, "buyer_blockers": buyer_blockers},
        "seller_qualification": {"items": seller_items, "seller_score": seller_score, "seller_blockers": seller_blockers},
        "commercial_gaps": commercial_gaps,
        "evidence_status": evidence_status,
        "logistics_assessment": logistics,
        "risk_flags": risk_flags,
        "readiness_score": readiness,
        "current_blocker": current_blocker,
        "next_best_action": next_best_action,
        "claims": [],
        "blockers": [{"code": current_blocker, "description": current_blocker}],
        "recommendations": [next_best_action["action"]],
        "tools": ["canonical_state"],
        "skills": [{"name": t, "version": 1} for t in (
            "deal_state_ingestion", "buyer_qualification", "seller_qualification",
            "commercial_alignment", "evidence_protection", "logistics", "deal_risk", "next_best_action",
        )],
        "agents_run": 8,
        "committed": False,
        "signed": False,
    }


def run_intelligence_operations(handoff: dict[str, Any], *, market: MockMarketTool | None = None) -> dict[str, Any]:
    state = _state(handoff)
    deal = _deal(state)
    ops = state.get("operations") or {}
    payload = state.get("inputs") or handoff.get("payload") or {}
    comms = ops.get("communications") or payload.get("communications") or []
    documents = ops.get("documents") or payload.get("documents") or []
    deals = ops.get("deals") or ([deal] if deal else [])
    topics = payload.get("market_topics") or []
    if isinstance(topics, str):
        topics = [topics] if topics.strip() else []
    market = market or MockMarketTool()

    comm_intel = []
    for c in comms if isinstance(comms, list) else []:
        if not isinstance(c, dict):
            continue
        body = str(c.get("body") or c.get("subject") or "")
        ambiguous = "?" in body or "maybe" in body.lower()
        comm_intel.append({
            "communication_id": c.get("id") or c.get("communication_id"),
            "classification": c.get("classification") or "inbound",
            "intent": "qualification" if "allocation" in body.lower() or "confirm" in body.lower() else "unknown",
            "urgency": "high" if "tt only" in body.lower() else "normal",
            "risk": "term_drift" if "tt" in body.lower() else "none",
            "ambiguous": ambiguous,
            "propose_deal_mutation": False,
            "requires_human_review": ambiguous or True,
        })

    deal_health = []
    for d in deals if isinstance(deals, list) else []:
        if not isinstance(d, dict):
            continue
        stale = bool(d.get("waiting_since") or d.get("primary_blocker"))
        deal_health.append({
            "deal_id": d.get("deal_id") or d.get("id"),
            "stale": stale,
            "blocker": d.get("primary_blocker") or (d.get("blockers") or [None])[0],
            "closed": False,
            "approved": False,
        })

    document_findings = []
    for doc in documents if isinstance(documents, list) else []:
        if not isinstance(doc, dict):
            doc = {"name": str(doc)}
        document_findings.append({
            "document": doc.get("name") or doc.get("evidence_type") or "unknown",
            "received": True,
            "verification_status": "PENDING",
            "verified": False,
        })
    # deal evidence rows are received, not verified
    for e in (deal.get("evidence") or []):
        document_findings.append({
            "document": e.get("evidence_type") or "evidence",
            "received": True,
            "verification_status": "PENDING",
            "verified": False,
        })

    market_context = market.gather(topics)
    for row in market_context:
        row["proof_of_delivery"] = False
        row["classification"] = "context_only"

    chase_items = []
    for b in (deal.get("blockers") or []):
        chase_items.append({
            "title": b.get("description") or b.get("code"),
            "priority": "critical" if "author" in str(b).lower() else "normal",
            "execute": False,
        })
    for t in (deal.get("tasks") or ops.get("tasks") or []):
        if (t.get("status") or "open") in ("open", "waiting", "in_progress"):
            chase_items.append({"title": t.get("title"), "priority": "communication_failure" if "follow" in str(t.get("title") or "").lower() else "normal", "execute": False})

    approval_requests = []
    if any(d.get("approval_required") for d in deals if isinstance(d, dict)) or any(c.get("requires_human_review") for c in comm_intel):
        approval_requests.append({
            "kind": "human_review",
            "reason": "ambiguous communication and/or deal approval flag",
            "granted": False,
            "assumed": False,
        })

    exceptions = []
    if any(c.get("ambiguous") for c in comm_intel):
        exceptions.append({"severity": "medium", "category": "ambiguous_comms", "resolution": "human review; do not mutate deal"})
    if any(not d.get("verified") for d in document_findings):
        exceptions.append({"severity": "low", "category": "unverified_document", "resolution": "keep PENDING; receipt is not verification"})

    red = [d for d in deal_health if d.get("stale")]
    traffic = "rood" if red else ("amber" if chase_items else "groen")
    recommended = [{"action": c["title"], "execute": False} for c in chase_items[:3]]
    operational_state = {
        "alerts": [{"level": "warning", "text": d.get("blocker")} for d in red if d.get("blocker")],
        "communication_intelligence": comm_intel,
        "deal_health": deal_health,
        "chase_items": chase_items,
        "tasks": [{"title": c["title"], "status": "open", "executed": False} for c in chase_items],
        "approval_requests": approval_requests,
        "market_context": market_context,
        "document_findings": document_findings,
        "exceptions": exceptions,
        "recommended_actions": recommended,
        "summary": {"traffic_light": traffic, "approval_granted_by_crew": False, "deals_mutated": False},
    }
    analysis = (
        f"Intelligence/operations cycle: {traffic}. "
        f"{len(chase_items)} chase item(s). "
        "Crew did not grant approval and did not mutate deals."
    )
    return {
        "analysis": analysis,
        "operational_state": operational_state,
        "claims": [],
        "blockers": [{"code": c["title"], "description": c["title"]} for c in chase_items[:5]],
        "recommendations": [r["action"] for r in recommended],
        "tools": ["canonical_state", "mock_market"],
        "skills": [{"name": n, "version": 1} for n in (
            "communications", "deal_watch", "documents", "market", "chase", "approvals", "exceptions", "ops_compile",
        )],
        "agents_run": 8,
        "approval_granted": False,
        "deals_mutated": False,
    }


def _classify_fact(hit: dict[str, Any]) -> str:
    url = (hit.get("url") or "").lower()
    title = (hit.get("title") or "").lower()
    if "self" in (hit.get("provenance") or "") or hit.get("self_published"):
        return "SELF-CLAIMED"
    if hit.get("independent") and hit.get("url"):
        return "VERIFIED"
    if url and ("about" in url or "registry" in url or "gov" in url):
        return "VERIFIED" if hit.get("independent") else "SELF-CLAIMED"
    if title:
        return "INFERRED"
    return "UNKNOWN"


def run_counterparty_sourcing(
    handoff: dict[str, Any],
    *,
    exa: MockExaTool | None = None,
    scrape: MockScrapeTool | None = None,
) -> dict[str, Any]:
    state = _state(handoff)
    payload = state.get("inputs") or handoff.get("payload") or {}
    direction = str(payload.get("direction") or payload.get("sourcing_direction") or "").lower()
    # map gateway actions
    action = str(handoff.get("action") or payload.get("action") or "")
    if not direction:
        if action in ("find_buyers", "buyer_signal", "new_signal"):
            direction = "find_buyer"
        elif action in ("find_suppliers", "supplier_signal"):
            direction = "find_supplier"
        else:
            direction = "both"
    commodity = payload.get("commodity") or payload.get("product") or "UNKNOWN"
    geography = payload.get("geography") or payload.get("search_geographies") or "UNKNOWN"
    blockers = payload.get("current_blockers") or payload.get("blockers") or []
    protected = {str(x).lower() for x in (payload.get("protected_counterparties") or [])}
    exclusions = {str(x).lower() for x in (payload.get("exclusions") or [])}

    strategy = {
        "direction": direction if direction in ("find_buyer", "find_supplier", "both") else "UNKNOWN",
        "commodity": commodity if commodity else "UNKNOWN",
        "geography": geography if geography else "UNKNOWN",
        "blockers": blockers,
        "unknown_fields": [k for k, v in (("commodity", commodity), ("geography", geography), ("direction", direction)) if not v or v == "UNKNOWN"],
    }

    scrape = scrape or MockScrapeTool()
    query = f"{commodity} {direction} {geography}"
    # Echte hits gaan VOOR exa: de bestaande Tavily/Zenserp/Perplexity-keten (research.py, al gebruikt door
    # find_suppliers/find_buyers) haalt echt op vóórdat de deterministische runtime draait -- exa_search is
    # nooit live geïmplementeerd (raise op live=True) en zou anders een tweede, stille zoekweg zijn.
    voorgehaald = payload.get("web_hits")
    if voorgehaald is not None:
        hits = list(voorgehaald)
        warning = payload.get("web_hits_warning")
    else:
        exa = exa or MockExaTool()
        raw = exa.search(query)
        hits = list(raw.get("hits") or [])
        warning = raw.get("warning")

    buyers_raw: list[dict[str, Any]] = []
    suppliers_raw: list[dict[str, Any]] = []
    if direction in ("find_buyer", "both"):
        for h in hits:
            role = (h.get("role") or "buyer").lower()
            if role in ("buyer", "both", ""):
                buyers_raw.append(h)
    if direction in ("find_supplier", "both"):
        for h in hits:
            role = (h.get("role") or "supplier").lower()
            if role in ("supplier", "producer", "exporter", "both", ""):
                suppliers_raw.append(h)
    if direction == "find_supplier":
        buyers_raw = []
    if direction == "find_buyer":
        suppliers_raw = []

    def enrich(h: dict[str, Any], role: str) -> dict[str, Any]:
        name = h.get("name") or h.get("title") or "UNKNOWN"
        url = h.get("url")
        page = scrape.read(url) if url else {"text": "", "status": "unavailable"}
        level = _classify_fact(h)
        # never fabricate email
        email = h.get("email") if h.get("email") and "@" in str(h.get("email")) else None
        lc = h.get("lc_acceptance")
        if lc is None:
            lc = "UNKNOWN"
        return {
            "name": name,
            "role": role,
            "url": url,
            "email": email,
            "lc_acceptance": lc,
            "facts": [
                {"field": "identity", "value": name, "level": level if url else "UNKNOWN", "source": url},
                {"field": "lc_acceptance", "value": lc, "level": "UNKNOWN" if lc == "UNKNOWN" else "SELF-CLAIMED", "source": url},
            ],
            "page_status": page.get("status"),
            "protected": name.lower() in protected,
        }

    verified = [enrich(h, "buyer") for h in buyers_raw] + [enrich(h, "supplier") for h in suppliers_raw]
    verified = [v for v in verified if not v["protected"]]

    def fit(v: dict[str, Any]) -> dict[str, Any]:
        score = 50
        if any(f["level"] == "VERIFIED" for f in v["facts"]):
            score += 20
        if v.get("url"):
            score += 10
        if v["lc_acceptance"] == "UNKNOWN":
            score -= 10  # partial only
        if "broker" in (v.get("name") or "").lower() or "marketplace" in (v.get("name") or "").lower():
            score = 0  # critical incompatibility
        score = max(0, min(100, score))
        return {**v, "fit_score": score, "priority": "A" if score >= 75 else "B" if score >= 50 else "C"}

    scored = [fit(v) for v in verified]
    rejected = [s for s in scored if s["fit_score"] == 0 or s["name"].lower() in exclusions]
    kept = [s for s in scored if s not in rejected]
    # dedupe by name
    seen: set[str] = set()
    ranked = []
    for s in sorted(kept, key=lambda x: -x["fit_score"]):
        key = s["name"].lower()
        if key in seen:
            continue
        seen.add(key)
        ranked.append(s)

    evidence = []
    for s in ranked:
        for f in s["facts"]:
            if f["level"] == "VERIFIED" and not f.get("source"):
                f["level"] = "INFERRED"  # never VERIFIED without source
            evidence.append(f)

    if warning:
        bron_omschrijving = warning
    elif voorgehaald is not None:
        provider = payload.get("web_hits_provider")
        bron_omschrijving = f"Source: {provider} search ({len(hits)} raw hit(s))." if provider else "Web search ran; no provider recorded."
    else:
        bron_omschrijving = "Mock/local research only; no live search."
    analysis = (
        f"Sourcing {strategy['direction']} for {strategy['commodity']}: "
        f"{len(ranked)} ranked candidate(s), {len(rejected)} rejected. " + bron_omschrijving
    )
    return {
        "analysis": analysis,
        "strategy": strategy,
        "candidates": ranked,
        "rejected": rejected,
        "gaps": strategy["unknown_fields"],
        "warnings": [w for w in [warning] if w],
        "evidence": evidence,
        "claims": [{"field": e["field"], "value": e["value"], "state": "unverified" if e["level"] != "VERIFIED" else "unverified",
                    "basis": e.get("source") or "no source"} for e in evidence[:12]],
        "blockers": [{"code": "unknown_field", "description": g} for g in strategy["unknown_fields"]],
        "recommendations": [f"Qualify {c['name']} independently before any outreach" for c in ranked[:3]],
        "tools": ["canonical_state", "exa_search", "scrape_website"],
        "skills": [{"name": n, "version": 1} for n in (
            "strategy", "buyer_hunter", "supplier_hunter", "verifier", "fit", "evidence", "supervisor",
        )],
        "agents_run": 7,
        "outreach": False,
        "protected_disclosed": False,
    }


SPECIALIST_RUNNERS = {
    "deal_execution": run_deal_execution,
    "intelligence_operations": run_intelligence_operations,
    "counterparty_sourcing": run_counterparty_sourcing,
}
