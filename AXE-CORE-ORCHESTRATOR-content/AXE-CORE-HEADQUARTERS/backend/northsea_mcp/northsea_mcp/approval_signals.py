"""Vlaggen voor de AXE-inbox, zonder identiteit te lekken.

De lijst `northsea_list_pending_approvals` mag geen ontvanger-email tonen
zonder northsea.identity. Deze vlaggen zijn genoeg voor het beleid in
AXE Core (chase vs prijs vs generieke qualification) en blijven boolean.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from .engine_rules import (
    banned_outbound_claims,
    has_generic_salutation,
    is_named_contact,
    is_role_mailbox,
)

PRIJS = re.compile(
    r"(?:\b\d[\d,.]{0,12}\s*(?:usd|eur|gbp|us\$|\$|€|£|%))"
    r"|(?:(?:usd|eur|gbp|us\$|\$|€|£)\s*\d[\d,.]{0,12})"
    r"|(?:\b\d[\d,.]{0,12}\s*(?:per\s*mt|/\s*mt|pmt)\b)"
    r"|(?:\bcommission\b|\bfee\b|\bmargin\b|\bdiscount\b)",
    re.I,
)
CONTRACT = re.compile(r"\b(ncnda|ncnnda|imfpa|spa\b|loi\b|fee agreement|mandate|legal-document|contract)\b", re.I)
COMMITMENT = re.compile(
    r"\b(\d[\d,.]{0,12}\s*mt\b|exclusiv(?:e|ity)|(?:we\s+)?can (?:ship|deliver|supply)|delivery guarante|lme registered|cif\s+[a-z]|fob\s+[a-z])",
    re.I,
)
IDENTITEIT = re.compile(r"\b(introduce you to the (?:buyer|seller)|buyer identity|seller identity|we will introduce)\b", re.I)
ROLE_LOCAL = frozenset({"sales", "info", "contact", "enquiries", "inquiry", "office", "hello"})
RISK_NAAM = ("harcros",)


def _ts(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _local(email: str) -> str:
    return (email or "").split("@", 1)[0].strip().lower()


def signals_for_draft(
    d: dict,
    *,
    companies: list[dict],
    contacts: list[dict],
    communications: list[dict],
    drafts: list[dict],
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    body = f"{d.get('subject') or ''}\n{d.get('body') or ''}"
    to = (d.get("to_email") or "").strip().lower()
    local = _local(to)
    contact = next((c for c in contacts if c.get("id") == d.get("contact_id")), None)
    company = next((c for c in companies if c.get("id") == d.get("company_id")), None)
    naam = (company or {}).get("company_name") or ""
    comm_id = d.get("communication_id")
    has_thread = bool(comm_id) and any(c.get("id") == comm_id for c in communications)
    inbound = [c for c in communications if c.get("id") == comm_id and c.get("direction") == "inbound"]
    inbound_offer = bool(inbound) and bool(PRIJS.search(str(inbound[0].get("body") or "")) or COMMITMENT.search(str(inbound[0].get("body") or "")))
    geverifieerd = ((contact or {}).get("verification_status") == "verified") or ((company or {}).get("verification_status") == "verified")
    # 25 nov: full_name op het record was niet genoeg — de brief opende met
    # 'Dear Sir or Madam' en ging toch door de named-recipient-poort.
    named = is_named_contact(full_name=(contact or {}).get("full_name"), email=to)
    role_box = local in ROLE_LOCAL or is_role_mailbox(to)
    dnc = ((company or {}).get("contact_policy") == "do_not_contact") or ((contact or {}).get("contact_policy") == "do_not_contact")
    bounced = ((contact or {}).get("email_status") in ("bounced", "complained")) or ((d.get("to_email_status") == "bounced"))
    risk = any(n in (naam or "").lower() for n in RISK_NAAM)
    subject = d.get("subject") or ""
    generated = d.get("generated_by") or ""
    generic = "supply qualification" in subject.lower() and ("northsea" in generated.lower() or d.get("generic_template") is True)

    chases = 0
    first_today = 0
    last_contact_days = None
    cid = d.get("contact_id")
    for other in drafts:
        if other.get("contact_id") != cid:
            continue
        t = _ts(other.get("created_at") or other.get("sent_at"))
        if not t:
            continue
        if other.get("communication_id") and (now - t) <= timedelta(days=14) and other.get("id") != d.get("id"):
            chases += 1
        if other.get("sent_at"):
            dagen = (now - t).days
            if last_contact_days is None or dagen < last_contact_days:
                last_contact_days = dagen
    for other in drafts:
        t = _ts(other.get("created_at"))
        if t and t.date() == now.date() and not other.get("communication_id"):
            first_today += 1

    personalized = bool(naam) and naam.lower() in body.lower() and len(body.strip()) > 80
    generic_salutation = has_generic_salutation(body)
    claims = banned_outbound_claims(body)

    return {
        "has_thread": has_thread,
        "address_verified": bool(geverifieerd),
        "named_recipient": bool(named) and not generic_salutation,
        "is_role_mailbox": bool(role_box),
        "personalized": personalized,
        "generic_template": generic,
        "generic_salutation": generic_salutation,
        "banned_claim": bool(claims),
        "generated_by": generated or None,
        "dnc": bool(dnc),
        "bounced": bool(bounced),
        "risk_counterparty": risk,
        "inbound_has_offer": inbound_offer,
        "legal_attachment": bool(d.get("has_attachment") or d.get("legal_attachment")),
        "identity_disclosure": bool(IDENTITEIT.search(body)),
        "deal_stage_move": bool(d.get("deal_stage_move")),
        "policy_change": bool(d.get("policy_change")),
        "internal_housekeeping": bool(d.get("internal_housekeeping")),
        "thread_id": d.get("communication_id"),
        "message_id": d.get("id"),
        "chases_14d": chases,
        "first_contacts_today": first_today,
        "contacted_within_days": last_contact_days,
        "price_signal": bool(PRIJS.search(body)),
        "legal_signal": bool(CONTRACT.search(body)),
        "commitment_signal": bool(COMMITMENT.search(body)),
    }
