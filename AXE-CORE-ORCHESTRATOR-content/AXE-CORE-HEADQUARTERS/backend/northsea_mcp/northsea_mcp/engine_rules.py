"""NorthSea Communication Engine — de regels (P1). Puur: geen database, geen netwerk, geen LLM.

De keten: INBOUND → CLASSIFY → MAP → EXTRACT → QUALIFY → UPDATE → NEXT ACTION → DRAFT →
APPROVAL/POLICY → SEND → DELIVERY → FOLLOW-UP → REPLY → RE-EVALUATE.

Wat hier staat is deterministisch en uitlegbaar: elke beslissing geeft `reasons` terug,
zodat de audit laat zien WAAROM. Niets wordt afgeleid dat niet letterlijk in de tekst of
de database staat: onbekend blijft onbekend. Mapping (welke deal) doet resend-inbound al
deterministisch (P0.7); de engine wijzigt nooit een deal bij een dubbelzinnige koppeling.

CrewAI mag later redeneren, onderzoeken en samenvatten via de CrewGateway, maar beslist
hier niets: beleid, veiligheid en koppeling blijven buiten de LLM-grens.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Any, Optional

ENGINE_VERSION = "ns-engine-1.1"  # 1.1: nieuwsbrieven zijn spam_noise, niet rejection (productie 16 sep)

CATEGORIES = ("buyer", "supplier", "reply", "qualification", "documents_evidence", "commercial_terms", "logistics",
              "payment", "rejection", "bounce_failure", "spam_noise", "ambiguous")

# ── 1. Classificatie ─────────────────────────────────────────────────────────
_RULES: dict[str, tuple[str, ...]] = {
    "buyer": (r"\bwe (?:require|need|are looking (?:to buy|for))\b", r"\blooking to (?:buy|purchase|source)\b", r"\bpurchase (?:order|requirement)\b",
              r"\bbuyer requirement\b", r"\bour requirement\b", r"\bwe (?:want|wish) to (?:buy|purchase)\b", r"\bRFQ\b", r"\brequest for quotation\b"),
    "supplier": (r"\bwe (?:can )?supply\b", r"\bavailable (?:stock|allocation|quantity)\b", r"\bmonthly capacity\b", r"\bwe (?:can )?offer\b",
                 r"\bseller(?:'s)? mandate\b", r"\bour offer\b", r"\bproducer\b.{0,30}\b(?:offer|allocation)\b", r"\bFCO\b", r"\bfull corporate offer\b"),
    "qualification": (r"\blegal (?:entity|name)\b", r"\bcompany registration\b", r"\bKYC\b", r"\bauthori[sz]ed\b", r"\bmandate\b", r"\bprincipal\b",
                      r"\bproof of (?:funds|product)\b", r"\bPOF\b", r"\bPOP\b"),
    "documents_evidence": (r"\battached\b", r"\bplease find\b", r"\bcertificate of (?:analysis|origin)\b", r"\bCOA\b", r"\bSGS\b", r"\bbill of lading\b",
                           r"\bB/L\b", r"\bLOI\b", r"\bICPO\b", r"\bSPA\b", r"\bNCNDA\b", r"\bIMFPA\b", r"\binspection report\b", r"\bpacking list\b"),
    "commercial_terms": (r"\bprice\b", r"\bpricing\b", r"\bLME\b", r"\bdiscount\b", r"\bpremium\b", r"\bUSD\s?[\d,.]+", r"\$\s?[\d,.]+", r"\bper (?:MT|metric ton|tonne)\b",
                         r"\bvalidity\b", r"\bvalid (?:until|for)\b", r"\bcommission\b"),
    "logistics": (r"\bport of (?:loading|discharge)\b", r"\bPOL\b", r"\bPOD\b", r"\bshipment\b", r"\bvessel\b", r"\bcontainer", r"\bETA\b", r"\bETD\b",
                  r"\bIncoterms?\b", r"\b(?:CIF|FOB|CFR|DAP|DDP|EXW|FCA)\b", r"\bdelivery\b", r"\bloading\b"),
    "payment": (r"\bletter of credit\b", r"\bL/?C\b", r"\bDLC\b", r"\bSBLC\b", r"\bT/?T\b", r"\bwire transfer\b", r"\bbank guarantee\b", r"\bescrow\b",
                r"\bpayment terms?\b", r"\badvance payment\b"),
    # Alleen expliciete afwijzing door de tegenpartij. Een losse "unsubscribe"-voettekst of "not able to offer FOB" is dat niet.
    "rejection": (r"\bnot interested\b", r"\bno longer (?:interested|required)\b", r"\b(?:we|i) (?:must|have to|will|would like to) decline\b",
                  r"\bdeclined? (?:your|the|this) (?:offer|request|inquiry|enquiry|proposal)\b", r"\bdo not contact\b",
                  r"\bremove (?:us|me) from\b", r"\bplease (?:unsubscribe|remove) (?:us|me)\b", r"\bwe (?:do not|don't) work with (?:brokers|intermediaries|agents)\b",
                  r"\bno (?:brokers|intermediaries)\b", r"\bdirect (?:sellers|buyers) only\b",
                  r"\bnot (?:able|in a position) to (?:proceed|help|assist|work with you|cooperate)\b"),
    "bounce_failure": (r"\bdelivery (?:status notification|has failed|failure)\b", r"\bundeliverable\b", r"\bmailer-daemon\b", r"\baddress not found\b",
                       r"\bmailbox (?:unavailable|full)\b", r"\bmessage (?:not delivered|blocked)\b"),
    "spam_noise": (r"\bnewsletter\b", r"\bwebinar\b", r"\bSEO\b", r"\bweb design\b", r"\blottery\b", r"\bcrypto (?:investment|opportunity)\b",
                   r"\bclick here\b", r"\blimited time offer\b", r"\bguest post\b",
                   # platform- en marketingmail
                   r"\bunsubscribe\b", r"\bview (?:this email )?in (?:your )?browser\b", r"mandrillapp\.com", r"list-manage\.com", r"\bwelcome to\b",
                   r"\bthanks? (?:you )?for (?:joining|signing up|registering)\b", r"\bverify your email\b", r"\bmanage (?:your )?(?:email )?preferences\b"),
}
_COMPILED = {k: [re.compile(p, re.I) for p in v] for k, v in _RULES.items()}
_SENSITIVE = re.compile(r"\b(?:introduce (?:us|me)|introduction|buyer(?:'s)? identity|seller(?:'s)? identity|bank account|banking instructions|beneficiary|"
                        r"swift|iban|sign(?:ed|ature)?|SPA|fee agreement|commission|IMFPA|NCN?DA|accept (?:the )?(?:price|offer|terms)|binding|exclusiv)", re.I)
_URGENT = re.compile(r"\b(?:urgent|asap|immediately|today|within 24 hours|deadline|expires?)\b", re.I)


@dataclass
class Classification:
    primary: str
    categories: list[str]
    urgency: str
    risk: str
    sensitive: bool
    reasons: list[str] = field(default_factory=list)


def classify(subject: Optional[str], body: Optional[str], *, sender_domain: Optional[str] = None, is_reply: bool = False,
             internal_domains: tuple[str, ...] = ("northseacommodity.com", "axeheadquarters.com")) -> Classification:
    tekst = f"{subject or ''}\n{body or ''}"
    hits: dict[str, list[str]] = {}
    for cat, pats in _COMPILED.items():
        gevonden = [p.pattern for p in pats if p.search(tekst)]
        if gevonden:
            hits[cat] = gevonden
    reasons = [f"{k}: {', '.join(v[:3])}" for k, v in hits.items()]
    cats = [c for c in CATEGORIES if c in hits]
    if is_reply or re.match(r"^\s*(?:re|aw|antw)\s*:", subject or "", re.I):
        cats.insert(0, "reply")
        reasons.append("reply: subject/thread")
    primary: str
    marketing = "spam_noise" in hits and not ({"buyer", "supplier"} & set(hits))
    if "bounce_failure" in hits:
        primary = "bounce_failure"
    elif marketing and len(hits["spam_noise"]) >= 2:
        primary = "spam_noise"  # duidelijke marketing/platformmail wint van een toevallige afwijzingsformule
        if "rejection" in hits:
            reasons.append("spam_noise over rejection: marketing markers")
    elif "rejection" in hits:
        primary = "rejection"
    elif "spam_noise" in hits and not ({"buyer", "supplier"} & set(hits)):
        primary = "spam_noise"
    elif "buyer" in hits and "supplier" in hits:
        primary = "ambiguous"
        reasons.append("ambiguous: both buyer and supplier signals")
    elif "buyer" in hits:
        primary = "buyer"
    elif "supplier" in hits:
        primary = "supplier"
    elif cats:
        rang = ("documents_evidence", "commercial_terms", "payment", "logistics", "qualification", "reply")
        primary = next((r for r in rang if r in cats), cats[0])
    else:
        primary = "ambiguous"
        reasons.append("ambiguous: no recognisable signal")
    if sender_domain and sender_domain.lower() in internal_domains and primary in ("ambiguous",):
        reasons.append("internal sender")
    if primary == "ambiguous" and "ambiguous" not in cats:
        cats.append("ambiguous")
    sensitive = bool(_SENSITIVE.search(tekst))
    urgency = "high" if _URGENT.search(tekst) else "normal"
    if primary in ("bounce_failure", "rejection"):
        urgency = "high"
    risk = "high" if sensitive else ("review" if primary in ("ambiguous", "rejection") else "low")
    return Classification(primary=primary, categories=list(dict.fromkeys(cats)), urgency=urgency, risk=risk, sensitive=sensitive, reasons=reasons)


# ── 2. Extractie: alleen wat er letterlijk staat ─────────────────────────────
_INCOTERM = re.compile(r"\b(CIF|FOB|CFR|DAP|DDP|DPU|EXW|FCA|CPT|CIP|FAS)\b")
_QTY = re.compile(r"(\d{1,3}(?:[,.]\d{3})+|\d{1,7}(?:[.,]\d+)?)\s*(?:\+/?-\s*\d+\s*%\s*)?(MT|metric tons?|metric tonnes?|tonnes?|tons?)\b", re.I)
_PURITY = re.compile(r"(9\d(?:[.,]\d{1,4})?)\s*%")
_GRADE = re.compile(r"\b(LME (?:registered |)Grade A|Grade A|Grade 1|ASTM B115|BS EN 1978)\b", re.I)
_PRICE = re.compile(r"(?:(USD|EUR|US\$|\$|€)\s?(\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,2})?)\s?(USD|EUR))"
                    r"\s*(?:/|per)\s*(MT|ton|tonne|metric ton)", re.I)
_BASIS = re.compile(r"\b(LME(?: official)?(?: cash)?(?: settlement)?(?: price)?\s*(?:minus|less|-|plus|\+)\s*\d+(?:[.,]\d+)?\s*%?|LME\s*(?:minus|less|-|plus|\+)\s*(?:USD|\$)?\s?\d+|discount of \d+(?:[.,]\d+)?\s*%|premium of (?:USD|\$)?\s?\d+)", re.I)
_PAYMENT = [("DLC", re.compile(r"\bDLC\b|\bdocumentary letter of credit\b", re.I)), ("SBLC", re.compile(r"\bSBLC\b", re.I)),
            ("LC", re.compile(r"\bletter of credit\b|\bL/C\b|\bLC\b(?! ?at sight)|\bLC at sight\b", re.I)), ("TT", re.compile(r"\bT/T\b|\bTT\b|\bwire transfer\b", re.I)),
            ("escrow", re.compile(r"\bescrow\b", re.I)), ("bank guarantee", re.compile(r"\bbank guarantee\b|\bBG\b", re.I))]
_RECURRING = re.compile(r"\b(\d[\d,.]*\s*(?:MT|tons?|tonnes?)\s*(?:per|/|a)\s*month|monthly|per month|recurring|12[- ]month contract|annual contract|long[- ]term)\b", re.I)
_SPOT = re.compile(r"\b(spot|one[- ]off|single shipment|trial (?:order|shipment|lot))\b", re.I)
_PORT = re.compile(r"\b(?:port of (?:loading|discharge|destination)|POL|POD|destination(?: port)?|delivery (?:to|port)|discharge port|loading port)\s*[:\-]?\s*([A-Z][A-Za-z .'-]{2,40}?)(?=[,.;\n]|$| port\b)", re.I)
_ORIGIN = re.compile(r"\b(?:origin|country of origin)\s*[:\-]?\s*([A-Z][A-Za-z .'-]{2,30}?)(?=[,.;\n]|$)", re.I)
_VALIDITY = re.compile(r"\b(valid (?:until|till|for) [^.,;\n]{2,30}|validity\s*[:\-]?\s*[^.,;\n]{2,30}|offer expires? [^.,;\n]{2,30})", re.I)
_TIMING = re.compile(r"\b(shipment (?:in|within|by|from) [^.,;\n]{2,30}|ETA [^.,;\n]{2,20}|ETD [^.,;\n]{2,20}|delivery (?:in|within|by) [^.,;\n]{2,30}|lead time [^.,;\n]{2,20})", re.I)
_AUTHORITY = re.compile(r"\b(sole (?:and exclusive )?(?:mandate|agent)|(?:direct )?mandate(?:d)?|authori[sz]ed (?:seller|buyer|agent|representative)|principal|end[- ]buyer|end[- ]user|producer|refinery owner|trading house)\b", re.I)
_DOCS = re.compile(r"\b(SGS|COA|certificate of analysis|certificate of origin|bill of lading|B/L|packing list|LOI|ICPO|FCO|SPA|NCNDA|IMFPA|proof of funds|POF|proof of product|POP|BCL|inspection report|assay)\b", re.I)
_COMMODITY = re.compile(r"\b(copper cathodes?|copper wire|copper scrap|millberry|aluminium ingots?|aluminum ingots?|zinc ingots?|nickel cathodes?|lead ingots?|cobalt|gold|silver|"
                        r"urea|DAP fertili[sz]er|sugar ICUMSA ?\d*|rice|soybeans?|diesel|EN590|jet fuel|JP54|LNG|coal)\b", re.I)


def _num(s: str) -> Optional[float]:
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?", s):
        s = s.replace(",", "")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", s):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _uniq(xs: list[str]) -> list[str]:
    return list(dict.fromkeys(x.strip() for x in xs if x and x.strip()))


def extract_terms(subject: Optional[str], body: Optional[str]) -> dict[str, Any]:
    """Expliciete commerciële termen. Een veld dat niet in de tekst staat is None, nooit geraden."""
    t = f"{subject or ''}\n{body or ''}"
    qty = [(m.group(0), _num(m.group(1))) for m in _QTY.finditer(t)]
    prijzen = []
    for m in _PRICE.finditer(t):
        valuta = (m.group(1) or m.group(4) or "").upper().replace("US$", "USD").replace("$", "USD").replace("€", "EUR")
        waarde = _num(m.group(2) or m.group(3) or "")
        prijzen.append({"text": m.group(0), "value": waarde, "currency": valuta or None, "unit": "MT"})
    payment = [naam for naam, pat in _PAYMENT if pat.search(t)]
    return {
        "commodity": (m.group(1) if (m := _COMMODITY.search(t)) else None),
        "grade": (m.group(1) if (m := _GRADE.search(t)) else None),
        "purity_pct": (_num(m.group(1)) if (m := _PURITY.search(t)) else None),
        "quantity_mt": qty[0][1] if qty else None,
        "quantity_text": qty[0][0] if qty else None,
        "quantities_mentioned": [q for q, _ in qty][:5],
        "recurring": bool(_RECURRING.search(t)) if (_RECURRING.search(t) or _SPOT.search(t)) else None,
        "recurring_text": (m.group(1) if (m := _RECURRING.search(t)) else (m2.group(1) if (m2 := _SPOT.search(t)) else None)),
        "origin": (m.group(1).strip() if (m := _ORIGIN.search(t)) else None),
        "destination_or_port": _uniq([m.group(1) for m in _PORT.finditer(t)])[:3] or None,
        "incoterms": _uniq([m.group(1).upper() for m in _INCOTERM.finditer(t)]) or None,
        "payment_instruments": payment or None,
        "pricing_basis": _uniq([m.group(1) for m in _BASIS.finditer(t)])[:3] or None,
        "prices": prijzen[:3] or None,
        "validity": _uniq([m.group(1) for m in _VALIDITY.finditer(t)])[:2] or None,
        "timing": _uniq([m.group(1) for m in _TIMING.finditer(t)])[:3] or None,
        "authority_claims": _uniq([m.group(1) for m in _AUTHORITY.finditer(t)])[:5] or None,
        "documents_mentioned": _uniq([m.group(1).upper() if len(m.group(1)) <= 6 else m.group(1).lower() for m in _DOCS.finditer(t)])[:10] or None,
        "_note": "Explicit mentions only. Claims by the counterparty are UNVERIFIED until evidenced.",
    }


_NEEDED = {
    "buyer": [("commodity", "product/grade"), ("quantity_mt", "quantity (trial and recurring)"), ("destination_or_port", "destination port"),
              ("incoterms", "Incoterm"), ("payment_instruments", "payment instrument"), ("timing", "target shipment timing"),
              ("authority_claims", "legal buying entity and authority")],
    "supplier": [("commodity", "product/grade"), ("quantity_mt", "available quantity / allocation"), ("origin", "origin/refinery"),
                 ("destination_or_port", "loading point"), ("incoterms", "Incoterm"), ("payment_instruments", "accepted payment instrument"),
                 ("prices", "price or pricing basis"), ("authority_claims", "seller authority (principal or mandate)"), ("documents_mentioned", "document/inspection package")],
}


def missing_information(role: str, terms: dict[str, Any]) -> list[str]:
    if role not in _NEEDED:
        return []
    uit = []
    for veld, label in _NEEDED[role]:
        if veld == "prices" and (terms.get("prices") or terms.get("pricing_basis")):
            continue
        if not terms.get(veld):
            uit.append(label)
    return uit


# ── 3. Deal: huidige blokkade en beste volgende actie ────────────────────────
@dataclass
class DealEvaluation:
    blocker_code: str
    blocker: str
    next_action_code: str
    next_action: str
    owner: str  # 'luka' | 'axe' | 'counterparty' | 'none'
    reasons: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {"blocker_code": self.blocker_code, "blocker": self.blocker, "next_action_code": self.next_action_code,
                "next_action": self.next_action, "owner": self.owner, "reasons": self.reasons, "engine_version": ENGINE_VERSION,
                "loop_stop_category": loop_stop_category(self.blocker_code)}


def _ts(v: Any) -> Optional[datetime]:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


def evaluate_deal(opp: dict, *, contact_policy: Optional[str], comms: list[dict], drafts: list[dict], followups: list[dict],
                  bounced_channel: bool, now: datetime, interval_hours: int = 48) -> DealEvaluation:
    """De ENE belangrijkste blokkade en actie voor een deal, met redenen. Volgorde = ernst."""
    r: list[str] = []
    if opp.get("is_synthetic"):
        return DealEvaluation("synthetic", "Internal test record — not a live deal.", "none", "No action on test data.", "none", ["is_synthetic"])
    if opp.get("stage") in ("lost", "won"):
        return DealEvaluation("closed", f"Deal is {opp.get('stage')}.", "none", "No action.", "none", [f"stage={opp.get('stage')}"])
    if contact_policy == "do_not_contact":
        return DealEvaluation("do_not_contact", "Counterparty is do-not-contact.", "close_out", "Close or archive this opportunity; do not contact.", "luka", ["contact_policy=do_not_contact"])
    if contact_policy == "review_required":
        return DealEvaluation("contact_policy_review", "Contact policy requires Luka's review before any NorthSea contact.", "review_contact_policy",
                              "Luka: decide whether NorthSea may approach this counterparty at all.", "luka", ["contact_policy=review_required"])
    if bounced_channel:
        return DealEvaluation("channel_bounced", "The counterparty email address bounced; it must not be retried.", "find_verified_channel",
                              "Find and verify an alternative commercial contact channel (do not retry the bounced address).", "axe", ["delivery_status=bounced"])
    pending = [d for d in drafts if d.get("approval_status") == "pending" and not d.get("sent_at")]
    if pending:
        r.append(f"{len(pending)} draft(s) pending approval")
        return DealEvaluation("approval_pending", "A prepared message is waiting for approval.", "review_draft",
                              f"Luka: review and approve or reject the pending draft ({pending[0].get('subject') or 'untitled'}).", "luka", r)
    email = sorted([c for c in comms if c.get("channel") == "email" and not c.get("is_synthetic")], key=lambda c: str(c.get("occurred_at") or ""))
    laatste = email[-1] if email else None
    if laatste and laatste.get("direction") == "inbound":
        return DealEvaluation("reply_needed", "The counterparty's latest email has not been answered.", "reply_to_counterparty",
                              "Prepare a reply addressing the counterparty's latest message.", "axe", [f"last email inbound {laatste.get('occurred_at')}"])
    if laatste and laatste.get("direction") == "outbound":
        verzonden = _ts(laatste.get("occurred_at"))
        open_plan = [f for f in followups if f.get("status") in ("scheduled", "draft_created")]
        if verzonden and now - verzonden >= timedelta(hours=interval_hours):
            return DealEvaluation("awaiting_reply_overdue", f"No reply for {int((now - verzonden).total_seconds() // 3600)}h after our last email.",
                                  "follow_up", "Prepare a follow-up on the open qualification points (requires approval).", "axe",
                                  [f"last outbound {laatste.get('occurred_at')}", f"open follow-up plans: {len(open_plan)}"])
        return DealEvaluation("awaiting_reply", "Waiting for the counterparty to reply.", "wait", "Wait for the reply; follow-up becomes due after the policy interval.",
                              "counterparty", [f"last outbound {laatste.get('occurred_at')}"])
    if not opp.get("seller_gate_passed"):
        return DealEvaluation("seller_unqualified", "Seller legal entity, authority and live allocation are not evidenced.", "qualify_seller",
                              "Request seller legal entity, principal/mandate evidence and current allocation.", "axe", ["seller_gate_passed=false", "no email history"])
    if not opp.get("buyer_gate_passed"):
        return DealEvaluation("buyer_unqualified", "Buyer legal entity, authority and requirement are not evidenced.", "qualify_buyer",
                              "Request buyer legal entity, purchasing authority and exact requirement.", "axe", ["buyer_gate_passed=false"])
    if not opp.get("protection_gate_passed") or (opp.get("commission_agreement_status") or "") != "signed":
        return DealEvaluation("protection_missing", "Commission protection (NCNDA/IMFPA) is not signed.", "secure_protection",
                              "Luka: decide on and secure commission protection before any introduction.", "luka", ["protection not signed"])
    return DealEvaluation("ready_for_review", "Qualification gates passed; next step needs a human decision.", "human_review",
                          "Luka: review the deal for a controlled introduction.", "luka", ["gates passed"])


# ── 3c. Waarom de lus hier stopt/wacht/doorgaat: één label per blocker_code ──
# Verplicht voor de closed-loop: elke tick moet EXPLICIET kunnen zeggen waarom een
# deal niet verder komt, in plaats van dat een mens dat uit de tekst van `blocker`
# moet raden. Geen nieuwe staatsmachine: dit hertaalt alleen de bestaande
# blocker_code's uit evaluate_deal() (hierboven) naar de vaste stopcategorieën.
LOOP_STOP_CATEGORY: dict[str, str] = {
    "synthetic": "terminal_state",
    "closed": "terminal_state",
    "do_not_contact": "terminal_state",
    "contact_policy_review": "approval_required",
    "approval_pending": "approval_required",
    "protection_missing": "approval_required",
    "ready_for_review": "approval_required",
    "channel_bounced": "missing_evidence",
    "seller_unqualified": "missing_evidence",
    "buyer_unqualified": "missing_evidence",
    "awaiting_reply": "external_wait",
    "reply_needed": "continuing",
    "awaiting_reply_overdue": "continuing",  # de tick plant zelf al een follow-up (stap 3)
}


def loop_stop_category(blocker_code: str) -> str:
    """`continuing` als de tick zelf al de volgende stap zet (follow-up plannen,
    een reply-blocker markeren); elke andere waarde is een expliciete, geldige
    reden om NIET verder te gaan zonder een mens of een extern signaal."""
    return LOOP_STOP_CATEGORY.get(blocker_code, "unknown")


# ── 3b. Deadlines: naderend of verstreken, per open taak ─────────────────────
def deadline_chase_items(tasks: list[dict], *, now: datetime, warn_hours: int = 48) -> list[dict]:
    """Eén Chase-kandidaat per open taak met een due_at binnen warn_hours, of al voorbij.

    Puur: geeft alleen kandidaten terug, met dezelfde dedupe_key vorm als de andere
    Chase-paden in engine.py (`f"{prefix}:{task_id}"`); de aanroeper filtert tegen
    open_keys precies zoals de rest van de tick al doet. Een taak zonder due_at
    (de meeste) levert nooit een item op -- geen deadline geraden die er niet is."""
    uit: list[dict] = []
    for t in tasks:
        if t.get("status") not in ("open", "in_progress", "waiting"):
            continue
        due = _ts(t.get("due_at"))
        if not due:
            continue
        rest_h = (due - now).total_seconds() / 3600
        if rest_h > warn_hours:
            continue
        verstreken = rest_h < 0
        titel = t.get("title") or t.get("type") or "task"
        uit.append({
            "dedupe_key": f"{'deadline_overdue' if verstreken else 'deadline_approaching'}:{t.get('id')}",
            "action_type": "deadline_overdue" if verstreken else "deadline_approaching",
            "company_id": None,
            "opportunity_id": t.get("opportunity_id"),
            "priority": 95 if verstreken else 70,
            "title": f"{'Overdue' if verstreken else 'Deadline approaching'}: {titel}",
            "description": f"Task due {t.get('due_at')} is "
                           f"{'overdue' if verstreken else f'due within {warn_hours}h'}.",
        })
    return uit


# ── 4. Follow-ups: duurzaam, idempotent, zonder stormen ──────────────────────
@dataclass
class FollowupPlan:
    anchor_communication_id: str
    opportunity_id: Optional[str]
    company_id: Optional[str]
    contact_id: Optional[str]
    attempt: int
    due_at: datetime
    reasons: list[str]


def plan_followups(outbound: list[dict], inbound: list[dict], plans: list[dict], *, interval_hours: int, max_followups: int,
                   now: datetime, max_per_run: int = 10, anchor_ok: Optional[Callable[[dict], Optional[str]]] = None) -> list[FollowupPlan]:
    """Welke follow-ups moeten NU gepland worden. Nooit meer dan max_followups per ankerbericht, nooit twee per deal
    in één interval, nooit meer dan max_per_run per run (stormrem)."""
    if max_followups <= 0 or interval_hours <= 0:
        return []
    uit: list[FollowupPlan] = []
    per_anker: dict[str, list[dict]] = {}
    for p in plans:
        per_anker.setdefault(str(p.get("anchor_communication_id")), []).append(p)
    deals_deze_run: set[str] = set()
    recent_deal_plan: set[str] = {str(p.get("opportunity_id")) for p in plans if p.get("opportunity_id")
                                  and (_ts(p.get("created_at")) or now) > now - timedelta(hours=interval_hours)}
    for o in sorted(outbound, key=lambda c: str(c.get("occurred_at") or "")):
        if len(uit) >= max_per_run:
            break
        if o.get("direction") != "outbound" or o.get("channel") != "email" or o.get("is_synthetic"):
            continue
        if (o.get("delivery_status") or "") in ("bounced", "failed", "suppressed", "complained"):
            continue
        verzonden = _ts(o.get("occurred_at"))
        if not verzonden or now - verzonden < timedelta(hours=interval_hours):
            continue
        partij = o.get("company_id")
        if not partij:
            continue
        beantwoord = any(i.get("company_id") == partij and (_ts(i.get("occurred_at")) or verzonden) > verzonden for i in inbound)
        if beantwoord:
            continue
        # Alleen het LAATSTE uitgaande bericht naar deze partij is een anker; oudere zijn al opgevolgd.
        later_uit = any(x.get("company_id") == partij and x.get("direction") == "outbound" and (_ts(x.get("occurred_at")) or verzonden) > verzonden
                        for x in outbound)
        if later_uit:
            continue
        # Pas NA de "laatste bericht"-regel: een later bericht zonder bruikbare herkomst houdt een ouder anker ook tegen.
        if anchor_ok is not None and anchor_ok(o):
            continue
        bestaand = per_anker.get(str(o["id"]), [])
        if len(bestaand) >= max_followups:
            continue
        if any(p.get("status") in ("scheduled", "draft_created") for p in bestaand):
            continue
        deal = str(o.get("opportunity_id")) if o.get("opportunity_id") else None
        if deal and (deal in deals_deze_run or deal in recent_deal_plan):
            continue
        poging = len(bestaand) + 1
        uit.append(FollowupPlan(anchor_communication_id=str(o["id"]), opportunity_id=deal, company_id=partij, contact_id=o.get("contact_id"),
                                attempt=poging, due_at=verzonden + timedelta(hours=interval_hours * poging),
                                reasons=[f"no reply since {o.get('occurred_at')}", f"attempt {poging}/{max_followups}"]))
        if deal:
            deals_deze_run.add(deal)
    return uit


# ── 5. Concept op basis van de echte blokkade ────────────────────────────────
_BLOCKER_ASKS = {
    "seller_unqualified": ["the legal selling entity and whether you act as principal or under a mandate (with evidence)",
                           "the current executable allocation for this material", "origin/refinery or brand", "loading point and available Incoterms",
                           "accepted payment instruments", "the documents and inspection package available (e.g. COA, SGS)"],
    "buyer_unqualified": ["the legal buying entity and the authorised contact", "the exact product, grade and purity", "trial and recurring quantity",
                          "destination port and Incoterm", "the payment instrument you can issue", "target shipment timing"],
    "awaiting_reply_overdue": [],
    "reply_needed": [],
}


def followup_draft(*, blocker_code: str, role: str, missing: list[str], product: Optional[str], attempt: int, original_subject: Optional[str]) -> dict[str, str]:
    """Een professioneel NorthSea-concept dat de ECHTE open punten noemt. Noemt nooit een tegenpartij, accepteert niets."""
    onderwerp = original_subject or (f"{product} — qualification" if product else "Qualification")
    if not onderwerp.lower().startswith("re:"):
        onderwerp = f"Re: {onderwerp}"
    punten = [m for m in missing if m] or _BLOCKER_ASKS.get(blocker_code) or (
        _BLOCKER_ASKS["seller_unqualified"] if role == "supplier" else _BLOCKER_ASKS["buyer_unqualified"])
    opening = ("Following up on our previous message" if attempt == 1 else "A brief reminder regarding our earlier messages") + \
              (f" about {product}." if product else ".")
    tekst = (f"Dear Sir or Madam,\n\n{opening}\n\n"
             "To assess whether we can progress this without disclosing any counterparty at this stage, could you confirm:\n"
             + "\n".join(f"- {p[0].upper() + p[1:]}" for p in punten[:6]) +
             "\n\nIf this is no longer relevant for you, a short reply is appreciated and we will close the file.\n\n"
             "No counterparty introduction or binding commercial commitment is being made by this email.\n\n"
             "Kind regards,\nNorthSea Commodity Partners\ntrade@northseacommodity.com")
    return {"subject": onderwerp[:300], "body": tekst}
