"""Bestaande NorthSea-desk-lus afmaken.

De drie live cron-paden (Deal & Operations, Discovery & Sourcing, Communication
Engine) draaiden de crews wel, maar zetten daarna geen stap. Dit module voert
de stappen uit die `evaluate_deal()` al toewijst:

- axe: kwalificeren, bronnen, opvolgen, en versturen via het bestaande
  goedkeuren + `send_approved_reply`-pad (Desk Manager);
- luka: contactbeleid, bescherming, introductie, historische concepten.

Geen tweede goedkeuringssysteem, geen blanket `auto_send_*`. Alleen concepten
die déze run zelf maakte mogen de Desk Manager vrijgeven. Een run die niets
vindt schrijft dat op dezelfde plek als een ja-vraag.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import engine_rules as rules
from .policy import PolicyDenied
from .service import (
    Caller,
    NotFound,
    ServiceError,
    company_of,
    offer_of,
    req_of,
)

DESK_MANAGER = "northsea-desk-manager"
OORSPRONG = "northsea-crew-loop"

# Bronnen van de drie bestaande roosters. Handmatige MCP-calls blijven analyse.
SCHEDULED_SOURCES = frozenset({
    "northsea_operations_loop",
    "northsea_discovery_loop",
    "northsea_engine",
})

# Niet-bindende sjablonen die het plan de crews al laat versturen na een ja
# van Luka of de Desk Manager. Geen introductie, geen termen, geen legal.
SAFE_TEMPLATES = frozenset({
    "supplier_qualification",
    "buyer_qualification",
    "follow_up",
    "document_request",
})

AXE_ACTIONS = frozenset({
    "qualify_seller",
    "qualify_buyer",
    "reply_to_counterparty",
    "follow_up",
    "find_verified_channel",
})

LUKA_ACTIONS = frozenset({
    "close_out",
    "review_contact_policy",
    "review_draft",
    "secure_protection",
    "human_review",
})

DESK_SCOPES = frozenset({
    "northsea.read",
    "northsea.deal.read",
    "northsea.deal.write",
    "northsea.research",
    "northsea.communications.draft",
    "northsea.communications.send",
    "northsea.identity",
    "northsea.admin",
})


def desk_manager_caller() -> Caller:
    """De NorthSea Desk Manager in AXE Core: mag ja zeggen, geen service-token."""
    return Caller(principal=DESK_MANAGER, client_id="axe-core-northsea-desk", scopes=DESK_SCOPES)


def is_scheduled(event: dict[str, Any] | None) -> bool:
    if not isinstance(event, dict):
        return False
    if event.get("source") in SCHEDULED_SOURCES:
        return True
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    return bool(payload.get("automated_sweep"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tekst_commissie(kaart: dict[str, Any]) -> str:
    c = kaart.get("commission") or {}
    status = c.get("status") or "not_started"
    delen = [f"status {status}"]
    if c.get("rate") not in (None, ""):
        delen.append(f"rate {c['rate']}")
    if c.get("amount") not in (None, ""):
        delen.append(f"amount {c['amount']}")
    if c.get("type") not in (None, ""):
        delen.append(str(c["type"]))
    if len(delen) == 1 and status == "not_started":
        return "not recorded — status not_started"
    return ", ".join(delen)


def notice_body(kaart: dict[str, Any], *, what_yes_does: str, extra: str | None = None) -> str:
    """Eén bericht: deal, twee kanten, commissie, wat ja doet. Geen jacht-opdracht."""
    qty = kaart.get("quantity_mt")
    volume = f" ({qty:g} MT)" if isinstance(qty, (int, float)) else ""
    buyer_land = f" ({kaart['buyer_country']})" if kaart.get("buyer_country") else ""
    seller_land = f" ({kaart['seller_country']})" if kaart.get("seller_country") else ""
    regels = [
        f"Deal: {kaart.get('deal_code') or kaart.get('deal_id')} — {kaart.get('product') or 'product unknown'}{volume}",
        f"Buyer: {kaart.get('buyer') or 'buyer unknown'}{buyer_land}",
        f"Seller: {kaart.get('seller') or 'seller unknown'}{seller_land}",
        f"Commission: {_tekst_commissie(kaart)}",
        f"What yes does: {what_yes_does}",
    ]
    if extra:
        regels.append(extra)
    return "\n".join(regels)


def deal_card(opp: dict[str, Any]) -> dict[str, Any]:
    req, off = req_of(opp), offer_of(opp)
    buyer, seller = company_of(req), company_of(off)
    product = (off.get("product") or req.get("product") or off.get("commodity")
               or req.get("commodity") or "unknown product")
    return {
        "deal_id": opp.get("id"),
        "deal_code": opp.get("deal_priority") or opp.get("id"),
        "product": product,
        "quantity_mt": off.get("quantity_mt") or req.get("quantity_mt"),
        "buyer": (buyer or {}).get("company_name") or "buyer unknown",
        "buyer_country": (buyer or {}).get("country"),
        "seller": (seller or {}).get("company_name") or "seller unknown",
        "seller_country": (seller or {}).get("country"),
        "commission": {
            "status": opp.get("commission_agreement_status") or "not_started",
            "rate": opp.get("commission_rate"),
            "amount": opp.get("commission_amount"),
            "type": opp.get("commission_type"),
        },
    }


def what_yes_does(eval_: rules.DealEvaluation, *, to_email: str | None = None,
                  subject: str | None = None) -> str:
    code = eval_.next_action_code
    aan = f" to {to_email}" if to_email else ""
    onderwerp = f" ({subject})" if subject else ""
    if code == "review_draft":
        return f"Yes sends the pending mail{aan}{onderwerp}."
    if code == "secure_protection":
        return "Yes starts commission protection for this deal. The crews will not introduce the two sides without that."
    if code == "human_review":
        return "Yes means this deal is good enough to introduce the two sides. The crews stop here."
    if code == "review_contact_policy":
        return "Yes means NorthSea may contact this counterparty at all."
    if code == "close_out":
        return "Yes archives this do-not-contact file. No mail goes out."
    return eval_.next_action


def _template_voor(eval_: rules.DealEvaluation) -> str:
    if eval_.next_action_code == "qualify_seller":
        return "supplier_qualification"
    if eval_.next_action_code == "qualify_buyer":
        return "buyer_qualification"
    if eval_.next_action_code == "follow_up":
        return "follow_up"
    if eval_.next_action_code == "reply_to_counterparty":
        return "auto"
    return "document_request"


def _auto_send_flags(policy: dict[str, Any] | None) -> dict[str, bool]:
    p = policy or {}
    return {
        "auto_send_qualification": bool(p.get("auto_send_qualification")),
        "auto_reply_nonbinding": bool(p.get("auto_reply_nonbinding")),
        "auto_send_followups": bool(p.get("auto_send_followups")),
    }


async def _policy(repo: Any) -> dict[str, Any]:
    getter = getattr(repo, "get_policy", None)
    if getter:
        rij = await getter()
        return rij or {}
    return {}


async def _drafts_voor(repo: Any, opp_id: str, comms: list[dict]) -> list[dict]:
    drafts: list[dict] = []
    seen: set[str] = set()
    for c in comms:
        for d in await repo.list_drafts_for_communication(c["id"]):
            if d.get("id") and d["id"] not in seen:
                drafts.append(d)
                seen.add(d["id"])
    fetch = getattr(repo, "fetch_all", None)
    if fetch:
        alle, _ = await fetch("reply_drafts")
        for d in alle:
            if d.get("opportunity_id") == opp_id and d.get("id") not in seen:
                drafts.append(d)
                seen.add(d["id"])
    return drafts


async def evaluate_live(service: Any, opp_id: str) -> tuple[dict[str, Any] | None, rules.DealEvaluation | None]:
    opp = await service.repo.get_opportunity(opp_id)
    if not opp:
        return None, None
    comms = await service.repo.list_communications(opportunity_id=opp_id, limit=50)
    drafts = await _drafts_voor(service.repo, opp_id, comms)
    followups: list[dict] = []
    fetch = getattr(service.repo, "fetch_all", None)
    if fetch:
        fus, _ = await fetch("northsea_followups")
        followups = [f for f in fus if f.get("opportunity_id") == opp_id]
    req, off = req_of(opp), offer_of(opp)
    partijen = [c for c in (company_of(req), company_of(off)) if c]
    policies = [c.get("contact_policy") for c in partijen]
    contact_policy = ("do_not_contact" if "do_not_contact" in policies
                      else "review_required" if "review_required" in policies else None)
    bounced = any((c.get("delivery_status") or "") == "bounced"
                  and c.get("direction") == "outbound" for c in comms)
    ev = rules.evaluate_deal(
        opp, contact_policy=contact_policy, comms=comms, drafts=drafts,
        followups=followups, bounced_channel=bounced, now=_now(),
    )
    return opp, ev


async def _schrijf_taak(service: Any, *, opportunity_id: str, title: str, description: str,
                        owner: str, requires_approval: bool, task_type: str,
                        priority: int = 70) -> dict[str, Any] | None:
    try:
        uit = await service.create_task(
            desk_manager_caller(),
            opportunity_id=opportunity_id, title=title[:200], description=description[:4000],
            task_type=task_type, priority=priority, requires_approval=requires_approval,
            owner=owner,
        )
        return {"task_id": uit.task_id, "created": uit.created, "duplicate": uit.duplicate_of_existing}
    except (ServiceError, PolicyDenied, NotFound):
        return None


async def _schrijf_chase(repo: Any, *, dedupe_key: str, title: str, description: str,
                         opportunity_id: str | None, owner: str, requires_approval: bool,
                         action_type: str, extra: dict[str, Any] | None = None) -> None:
    insert = getattr(repo, "engine_insert", None)
    if not insert:
        return
    meta = {"source": OORSPRONG, "owner": owner, "origin": OORSPRONG, "execute": False}
    if extra:
        meta.update(extra)
    try:
        await insert("action_queue", {
            "dedupe_key": dedupe_key, "action_type": action_type,
            "opportunity_id": opportunity_id, "priority": 80 if requires_approval else 40,
            "title": title[:200], "description": description[:4000],
            "status": "open", "requires_approval": requires_approval, "metadata": meta,
        }, ignore_duplicates=True)
    except Exception:
        pass


async def _lege_run(repo: Any, *, kind: str, title: str, description: str,
                    extra: dict[str, Any] | None = None) -> dict[str, Any]:
    dag = _now().date().isoformat()
    await _schrijf_chase(
        repo, dedupe_key=f"desk-run:{kind}:{dag}", title=title, description=description,
        opportunity_id=None, owner="axe", requires_approval=False,
        action_type="desk_run_note", extra=extra,
    )
    return {
        "notice": {
            "soort": "leeg", "titel": title, "tekst": description,
            "eigenaar": "axe", "oorsprong": OORSPRONG, "akkoord_nodig": False,
        },
        "sent": 0, "approved": 0,
    }


def _kaart_notice(kaart: dict[str, Any], eval_: rules.DealEvaluation, *,
                  to_email: str | None = None, subject: str | None = None,
                  extra: str | None = None) -> dict[str, Any]:
    yes = what_yes_does(eval_, to_email=to_email, subject=subject)
    tekst = notice_body(kaart, what_yes_does=yes, extra=extra)
    titel = f"Yes needed: {kaart.get('deal_code')} — {kaart.get('product')}"
    return {
        "soort": "ja", "titel": titel, "tekst": tekst, "eigenaar": "luka",
        "oorsprong": OORSPRONG, "akkoord_nodig": True,
        "deal_id": kaart.get("deal_id"), "deal_code": kaart.get("deal_code"),
        "buyer": kaart.get("buyer"), "seller": kaart.get("seller"),
        "commission": kaart.get("commission"), "what_yes_does": yes,
        "blocker": eval_.blocker_code, "next_action": eval_.next_action_code,
    }


async def _ja_vraag(service: Any, opp: dict[str, Any], eval_: rules.DealEvaluation, *,
                    to_email: str | None = None, subject: str | None = None,
                    extra: str | None = None) -> dict[str, Any]:
    kaart = deal_card(opp)
    notice = _kaart_notice(kaart, eval_, to_email=to_email, subject=subject, extra=extra)
    await _schrijf_taak(
        service, opportunity_id=opp["id"], title=notice["titel"],
        description=notice["tekst"], owner="luka", requires_approval=True,
        task_type="manual_review", priority=90,
    )
    await _schrijf_chase(
        service.repo, dedupe_key=f"desk-yes:{opp['id']}:{eval_.next_action_code}",
        title=notice["titel"], description=notice["tekst"], opportunity_id=opp["id"],
        owner="luka", requires_approval=True, action_type="approval_required",
        extra={"what_yes_does": notice["what_yes_does"], "blocker": eval_.blocker_code},
    )
    return {"notice": notice, "sent": 0, "approved": 0, "owner": "luka"}


async def _vrijgeven(service: Any, draft_id: str) -> dict[str, Any]:
    """Bestaande approve + send. Geen nieuwe sender, geen auto_send-vlag."""
    manager = desk_manager_caller()
    goed = await service.approve_draft(manager, draft_id=draft_id)
    if goed.sensitive:
        return {"sent": 0, "approved": 0, "reason": "sensitive_stays_with_luka"}
    verzonden = await service.send_approved_communication(manager, draft_id=draft_id, confirm=True)
    return {
        "sent": 1 if verzonden.submitted and not verzonden.duplicate else 0,
        "approved": 1,
        "draft_id": draft_id,
        "duplicate": verzonden.duplicate,
        "communication_id": verzonden.communication_id,
    }


async def _axe_stap(service: Any, opp: dict[str, Any], eval_: rules.DealEvaluation,
                    event: dict[str, Any]) -> dict[str, Any]:
    kaart = deal_card(opp)
    if eval_.next_action_code == "find_verified_channel":
        tekst = notice_body(
            kaart, what_yes_does="No mail. The crews look for a verified channel; the bounced address is not retried.",
            extra="This is desk work, not a yes.",
        )
        await _schrijf_taak(
            service, opportunity_id=opp["id"],
            title=f"Find verified channel — {kaart.get('deal_code')}",
            description=tekst, owner="axe", requires_approval=False,
            task_type="find_channel", priority=80,
        )
        return {"notice": None, "sent": 0, "approved": 0, "owner": "axe",
                "missing": "verified_channel", "deal_id": opp["id"]}

    template = _template_voor(eval_)
    doel = eval_.next_action
    await _schrijf_taak(
        service, opportunity_id=opp["id"],
        title=f"{eval_.next_action_code} — {kaart.get('deal_code')}"[:200],
        description=notice_body(kaart, what_yes_does="No yes. The crews do this step.", extra=doel),
        owner="axe", requires_approval=False, task_type="follow_up", priority=60,
    )
    try:
        draft = await service.prepare_outreach(
            desk_manager_caller(), objective=doel[:500], opportunity_id=opp["id"],
            template=template, save_as_pending_draft=True,
        )
    except PolicyDenied as e:
        return await _ja_vraag(service, opp, eval_, extra=f"Outreach blocked ({e.code}).")
    except (ServiceError, NotFound) as e:
        reden = getattr(e, "message", str(e))
        return await _lege_run(
            service.repo, kind=f"missing:{opp['id']}",
            title=f"Desk run: missing input — {kaart.get('deal_code')}",
            description=notice_body(kaart, what_yes_does="No yes. A crew step stopped on missing input.",
                                    extra=reden),
            extra={"missing": reden, "deal_id": opp["id"]},
        )

    if draft.saved_status == "not_saved_no_email_thread" or not draft.saved_draft_id:
        extra = (
            f"First-touch cannot use the reply-only send path: no inbound mail from this counterparty. "
            f"Draft subject: {draft.subject}. The crews keep this as text; nothing was sent."
        )
        await _schrijf_taak(
            service, opportunity_id=opp["id"],
            title=f"First-touch waiting on inbound — {kaart.get('deal_code')}"[:200],
            description=notice_body(kaart, what_yes_does="No yes. The crews cannot send a first mail on the reply path.",
                                    extra=extra),
            owner="axe", requires_approval=False, task_type="follow_up", priority=50,
        )
        return {
            "notice": None, "sent": 0, "approved": 0, "owner": "axe",
            "missing": "inbound_email_thread", "draft_subject": draft.subject,
            "draft_body": draft.body, "deal_id": opp["id"],
        }

    if draft.sensitive or draft.template not in SAFE_TEMPLATES:
        return await _ja_vraag(
            service, opp, eval_, to_email=draft.to_email, subject=draft.subject,
            extra="This draft is not a safe non-binding qualification/follow-up.",
        )

    try:
        vrij = await _vrijgeven(service, draft.saved_draft_id)
    except (PolicyDenied, ServiceError) as e:
        return await _ja_vraag(
            service, opp, eval_, to_email=draft.to_email, subject=draft.subject,
            extra=f"Desk Manager could not release this mail ({getattr(e, 'code', type(e).__name__)}).",
        )
    if vrij.get("reason") == "sensitive_stays_with_luka":
        return await _ja_vraag(service, opp, eval_, to_email=draft.to_email, subject=draft.subject)

    await _schrijf_taak(
        service, opportunity_id=opp["id"],
        title=f"Sent {draft.template} — {kaart.get('deal_code')}"[:200],
        description=notice_body(
            kaart, what_yes_does="Already sent by the Desk Manager on the existing approve+send path.",
            extra=f"To {draft.to_email or 'the counterparty'}: {draft.subject}",
        ),
        owner="axe", requires_approval=False, task_type="follow_up", priority=40,
    )
    return {
        "notice": None, "sent": vrij.get("sent", 0), "approved": vrij.get("approved", 0),
        "owner": "axe", "draft_id": draft.saved_draft_id, "template": draft.template,
        "to": draft.to_email, "deal_id": opp["id"],
        "event_id": event.get("event_id"),
    }


async def finish_after_event(service: Any, event: dict[str, Any], result: Any) -> dict[str, Any]:
    """Na een geplande Deal/Operations-crew: de stap die evaluate_deal al noemt."""
    if not is_scheduled(event):
        return {"skipped": True, "reason": "not a scheduled desk loop", "sent": 0, "approved": 0}
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    opp_id = payload.get("opportunity_id")
    flags = _auto_send_flags(await _policy(service.repo))
    if not opp_id:
        leeg = await _lege_run(
            service.repo, kind="no-opportunity",
            title="Desk run: no opportunity on this event",
            description="A scheduled crew ran without an opportunity id. Nothing was sent.",
            extra={"event_type": event.get("event_type"), "flags": flags},
        )
        leeg["flags"] = flags
        return leeg
    opp, ev = await evaluate_live(service, str(opp_id))
    if not opp or ev is None:
        leeg = await _lege_run(
            service.repo, kind=f"missing-opp:{opp_id}",
            title="Desk run: opportunity not found",
            description=f"Scheduled crew pointed at {opp_id}; the deal is gone. Nothing was sent.",
            extra={"flags": flags},
        )
        leeg["flags"] = flags
        return leeg
    if ev.owner == "none" or ev.next_action_code in ("none", "wait"):
        kaart = deal_card(opp)
        tekst = notice_body(
            kaart, what_yes_does="No yes. The crews wait or this file is closed.",
            extra=f"Blocker: {ev.blocker}. Next: {ev.next_action}",
        )
        leeg = await _lege_run(
            service.repo, kind=f"wait:{opp['id']}:{ev.blocker_code}",
            title=f"Desk run: nothing to decide — {kaart.get('deal_code')}",
            description=tekst, extra={"blocker": ev.blocker_code, "flags": flags},
        )
        leeg["flags"] = flags
        leeg["blocker"] = ev.blocker_code
        return leeg
    if ev.owner == "luka" or ev.next_action_code in LUKA_ACTIONS:
        pending = None
        if ev.next_action_code == "review_draft":
            comms = await service.repo.list_communications(opportunity_id=opp["id"], limit=50)
            drafts = [d for d in await _drafts_voor(service.repo, opp["id"], comms)
                      if d.get("approval_status") == "pending" and not d.get("sent_at")]
            pending = drafts[0] if drafts else None
        uit = await _ja_vraag(
            service, opp, ev,
            to_email=(pending or {}).get("to_email"),
            subject=(pending or {}).get("subject"),
        )
        uit["flags"] = flags
        return uit
    if ev.owner == "axe" and ev.next_action_code in AXE_ACTIONS:
        uit = await _axe_stap(service, opp, ev, event)
        uit["flags"] = flags
        return uit
    uit = await _ja_vraag(service, opp, ev)
    uit["flags"] = flags
    return uit


async def finish_idle_operations(repo: Any, *, active: int, recent: int) -> dict[str, Any]:
    return await _lege_run(
        repo, kind="ops-idle",
        title="Desk run: operations sweep found nothing new",
        description=(
            f"Deal & Operations selected 0 new deals. "
            f"{active} active deals; {recent} already had a crew pass in the last 12 hours. "
            "No yes needed. The crews keep the existing files."
        ),
        extra={"active_deals": active, "reviewed_recently": recent},
    )


async def finish_discovery(repo: Any, sweep: dict[str, Any]) -> dict[str, Any]:
    """Discovery mag geen mail. 0 nieuwe paren verdwijnt niet."""
    created = int(sweep.get("created") or 0)
    overwogen = sweep.get("considered_pairs")
    kandidaten = sweep.get("candidates_found")
    if created > 0:
        return {"notice": None, "sent": 0, "created": created}
    waarom = (
        f"Discovery & Sourcing considered {overwogen} pairs and created 0. "
        f"Candidates above the match threshold: {kandidaten}. "
        "No new pairing cleared the existing rule (or every pair already has a deal). "
        "What yes does: nothing — this is not a hunt request."
    )
    return await _lege_run(
        repo, kind="discovery",
        title="Desk run: discovery found no new match",
        description=waarom,
        extra={"considered_pairs": overwogen, "candidates_found": kandidaten, "created": 0,
               "outreach": False},
    )


async def finish_engine_tick(service: Any, tick: dict[str, Any]) -> dict[str, Any]:
    """Follow-ups van DÉZE tick: Desk Manager mag veilige concepten vrijgeven.

    Historische pending drafts blijven een ja-vraag. `auto_send_followups` blijft
    wat hij is; de engine gebruikt die vlag in P1 niet.
    """
    flags = _auto_send_flags(await _policy(service.repo))
    plan = tick.get("plan") if isinstance(tick.get("plan"), dict) else {}
    followups = list(plan.get("followups") or [])
    verzonden = 0
    goedgekeurd = 0
    notices: list[dict[str, Any]] = []
    for item in followups:
        draft_id = item.get("draft_id")
        if item.get("result") != "draft_created" or not draft_id:
            continue
        d = await service.repo.get_draft(draft_id)
        if not d or d.get("sensitive_action") or d.get("sent_at"):
            continue
        purpose = str(d.get("purpose") or "").lower()
        if "follow-up" not in purpose and "follow_up" not in purpose:
            continue
        try:
            vrij = await _vrijgeven(service, draft_id)
        except (PolicyDenied, ServiceError):
            continue
        verzonden += int(vrij.get("sent") or 0)
        goedgekeurd += int(vrij.get("approved") or 0)
    if not followups:
        leeg = await _lege_run(
            service.repo, kind="engine",
            title="Desk run: communication engine had 0 follow-ups",
            description=(
                "Communication Engine planned 0 follow-ups. "
                "Follow-ups need an overdue outbound mail as an anchor; first-touch is the deal crew. "
                "What yes does: nothing — no mail is waiting."
            ),
            extra={"followups": 0, "flags": flags},
        )
        leeg["flags"] = flags
        return leeg
    return {"notice": notices[0] if notices else None, "sent": verzonden,
            "approved": goedgekeurd, "flags": flags, "followups": len(followups)}
