"""NorthSea Communication Engine — de uitvoerder (P1).

Eén `tick()`: lees de canonieke NorthSea-data, pas `engine_rules` toe, schrijf alleen wat
gerechtvaardigd is, en leg elke materiële beslissing vast in `northsea_audit_events`.

Wat de engine WEL doet (alles idempotent):
  - inbound e-mail classificeren en termen extraheren → email_intelligence.engine_*;
  - door de tegenpartij genoemde termen vastleggen als bewijs van een CLAIM (counterparty_stated,
    nooit verified), alleen bij een deterministisch gekoppelde, niet-synthetische deal;
  - een bounced/complained verzending → contacts.email_status (herkomst: communicatie-id);
  - per open deal de huidige blokkade en beste volgende actie → opportunities.engine_*;
  - follow-ups plannen (northsea_followups) en een PENDING concept maken dat een mens moet goedkeuren;
  - Chase-items (action_queue, dedupe_key) voor dubbelzinnige koppeling, afwijzing, bounce en herstel.

Wat de engine NOOIT doet: versturen, goedkeuren, een gate laten slagen, een stage wijzigen, een
deal verliezen/winnen, contactbeleid wijzigen, een dubbelzinnige koppeling oplossen. De P0-guards
in de database gelden ook voor de engine: een concept naar DNC/synthetisch/bounced faalt daar.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from . import engine_rules as rules
from .repository import RepositoryError
from .research import ResearchError
from .service import RESEARCH_INSTRUCTIONS

log = logging.getLogger("northsea_mcp.engine")

OPEN_TASK = ("open", "in_progress", "waiting")
LEGACY_CLASS = {"buyer": "buyer", "supplier": "supplier", "spam_noise": "spam", "logistics": "logistics"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _lower(v: Any) -> str:
    return str(v or "").strip().lower()


CANONICAL_MAILBOX = "trade@northseacommodity.com"
BLOCKING_POLICIES = ("do_not_contact", "review_required")


def _adres(v: Any) -> str:
    """'Naam <a@b>' of 'a@b' -> 'a@b' (lowercase); alles zonder @ -> ''."""
    t = _lower(v)
    if "<" in t and ">" in t:
        t = t[t.index("<") + 1:t.index(">")].strip()
    return t if "@" in t else ""


def _metadata_ontvangers(o: dict) -> list[str]:
    """Ontvangers zoals de provider ze vastlegde (provider_metadata.to / last_event.to). Feit, geen gok."""
    md = o.get("provider_metadata") or {}
    if not isinstance(md, dict):
        return []
    uit: list[str] = []
    for bron in (md.get("to"), (md.get("last_event") or {}).get("to") if isinstance(md.get("last_event"), dict) else None):
        for x in (bron if isinstance(bron, list) else [bron] if bron else []):
            a = _adres(x)
            if a and a not in uit:
                uit.append(a)
    return uit


class EngineService:
    def __init__(self, repo: Any, *, now=_now, max_followups_per_run: int = 10, sleep=None, max_write_attempts: int = 3,
                research: Any = None):
        self.repo = repo
        self.now = now
        self.max_followups_per_run = max_followups_per_run
        self._sleep = sleep or asyncio.sleep
        self.max_write_attempts = max_write_attempts
        # Optioneel: zonder research blijft de gate op 'approved_ready_to_execute' staan (nooit
        # geslaagd doen alsof) -- zo blijven tests en omgevingen zonder sleutel veilig.
        self.research = research

    async def _resilient(self, fn):
        """Voer één schrijfactie uit met begrensde retries en backoff, alleen bij een
        aantoonbaar tijdelijke fout (rules.is_transient_repository_error). Een P0-guard
        of 4xx is een beslissing van de database, geen storing: die gaat direct door
        naar de aanroeper, die 'm al afhandelt zoals voorheen (bv. blocked_by_guard)."""
        laatste: RepositoryError | None = None
        for poging in range(1, self.max_write_attempts + 1):
            try:
                return await fn()
            except RepositoryError as e:
                laatste = e
                if poging >= self.max_write_attempts or not rules.is_transient_repository_error(str(e)):
                    raise
                await self._sleep(0.25 * (2 ** (poging - 1)))
        raise laatste  # type: ignore[misc]  -- onbereikbaar: de lus raise't of return't altijd

    async def _load(self) -> dict[str, list[dict]]:
        namen = ["communications", "email_intelligence", "opportunities", "buyer_requirements", "supplier_offers", "companies",
                 "contacts", "reply_drafts", "northsea_followups", "deal_automation_policy", "action_queue", "deal_tasks", "deal_evidence"]
        rijen = await asyncio.gather(*(self.repo.fetch_all(n) for n in namen))
        return {n: r[0] for n, r in zip(namen, rijen)}

    async def tick(self, *, dry_run: bool = False) -> dict[str, Any]:
        nu = self.now()
        d = await self._load()
        plan: dict[str, list] = {"intelligence": [], "evidence": [], "contacts_bounced": [], "evaluations": [], "followups": [],
                                 "followups_replied": [], "chase": [], "chase_cancelled": []}
        fouten: list[str] = []

        companies = {c["id"]: c for c in d["companies"]}
        contacts = {c["id"]: c for c in d["contacts"]}
        drafts = d["reply_drafts"]
        req = {r["id"]: r for r in d["buyer_requirements"]}
        off = {o["id"]: o for o in d["supplier_offers"]}
        intel = {i.get("communication_id"): i for i in d["email_intelligence"]}
        policy = (d["deal_automation_policy"] or [None])[0] or {}
        interval = policy.get("followup_interval_hours")
        max_fu = policy.get("max_auto_followups")
        policy_ok = isinstance(interval, int) and isinstance(max_fu, int) and interval > 0

        opp_by_id = {o["id"]: o for o in d["opportunities"]}

        def partijen(opp_id: Any) -> list[str]:
            """De bedrijven die deze deal echt zijn: koper (requirement) en verkoper (offer). Niets anders."""
            o = opp_by_id.get(opp_id) or {}
            return [x for x in ((req.get(o.get("buyer_requirement_id")) or {}).get("company_id"),
                                (off.get(o.get("supplier_offer_id")) or {}).get("company_id")) if x]

        def deal_van(c: dict, *, gekoppeld: bool) -> Optional[str]:
            """Een bericht telt alleen voor een deal als zijn bedrijf een partij van die deal is; een oude
            campagnekoppeling naar een kandidaat-leverancier is geen deal-feit. gekoppeld=True eist bovendien
            een deterministische koppeling (mapping_status='mapped'), voor alles wat als bewijs wordt vastgelegd."""
            opp_id = c.get("opportunity_id")
            if not opp_id or c.get("company_id") not in partijen(opp_id):
                return None
            if gekoppeld and c.get("mapping_status") != "mapped":
                return None
            return opp_id

        comms = [c for c in d["communications"] if not c.get("is_synthetic")]
        email = [c for c in comms if c.get("channel") == "email"]
        inbound = [c for c in email if c.get("direction") == "inbound"]
        outbound = [c for c in email if c.get("direction") == "outbound"]

        # ── 1. Inbound: classificeren + extraheren ───────────────────────────
        for c in inbound:
            i = intel.get(c["id"])
            if i and i.get("engine_version") == rules.ENGINE_VERSION:
                continue
            co = companies.get(c.get("company_id")) or {}
            k = rules.classify(c.get("subject"), c.get("body"), is_reply=bool(c.get("mapping_basis") == "thread"))
            terms = rules.extract_terms(c.get("subject"), c.get("body"))
            rol = k.primary if k.primary in ("buyer", "supplier") else (co.get("company_type") if co.get("company_type") in ("buyer", "supplier") else "")
            missing = rules.missing_information(rol, terms)
            velden = {"engine_primary": k.primary, "engine_categories": k.categories, "engine_terms": terms, "engine_missing": missing,
                      "engine_urgency": k.urgency, "engine_risk": k.risk, "engine_reasons": k.reasons, "engine_version": rules.ENGINE_VERSION,
                      "engine_evaluated_at": nu.isoformat()}
            plan["intelligence"].append({"communication_id": c["id"], "primary": k.primary, "update": bool(i)})
            # Herclassificatie (nieuwe engineversie): een open Chase-item van de engine dat bij de OUDE uitkomst hoorde
            # en nu niet meer klopt, wordt geannuleerd met reden. Nooit verwijderd; menselijke items blijven onaangeroerd.
            verwacht = {f"review_mapping:{c['id']}" if c.get("mapping_status") == "ambiguous" else None,
                        f"review_rejection:{c['id']}" if k.primary == "rejection" else None,
                        f"review_bounce_email:{c['id']}" if k.primary == "bounce_failure" else None}
            for q in d["action_queue"]:
                sleutel = q.get("dedupe_key") or ""
                if (q.get("status") in OPEN_TASK and (q.get("metadata") or {}).get("source") == "northsea-engine"
                        and sleutel.endswith(f":{c['id']}") and sleutel.split(":")[0] in ("review_mapping", "review_rejection", "review_bounce_email")
                        and sleutel not in verwacht):
                    plan["chase_cancelled"].append({"dedupe_key": sleutel, "reason": f"reclassified as {k.primary} by {rules.ENGINE_VERSION}"})
                    q["status"] = "cancelled"
                    if not dry_run:
                        try:
                            await self.repo.engine_patch("action_queue", {"id": f"eq.{q['id']}"}, {
                                "status": "cancelled", "completed_at": nu.isoformat(), "updated_at": nu.isoformat(),
                                "metadata": {**(q.get("metadata") or {}), "cancelled_by": "northsea-engine", "cancelled_at": nu.isoformat(),
                                             "cancelled_reason": f"message reclassified as {k.primary} by {rules.ENGINE_VERSION}"}})
                        except RepositoryError as e:
                            fouten.append(f"chase cancel {sleutel}: {e}")
            if c.get("mapping_status") == "ambiguous":
                plan["chase"].append({"dedupe_key": f"review_mapping:{c['id']}", "action_type": "review_mapping", "company_id": c.get("company_id"),
                                      "opportunity_id": None, "priority": 80, "title": "Review ambiguous email mapping",
                                      "description": f"Inbound email could belong to several deals ({', '.join((c.get('mapping_candidates') or [])[:4])}). "
                                                     "The engine did not change any deal; choose the right one."})
            if k.primary == "rejection":
                plan["chase"].append({"dedupe_key": f"review_rejection:{c['id']}", "action_type": "review_rejection", "company_id": c.get("company_id"),
                                      "opportunity_id": deal_van(c, gekoppeld=False), "priority": 85, "title": "Counterparty signals rejection",
                                      "description": "Review the email; decide on contact policy or closing the deal. The engine changes neither."})
            if k.primary == "bounce_failure":
                plan["chase"].append({"dedupe_key": f"review_bounce_email:{c['id']}", "action_type": "review_bounce", "company_id": c.get("company_id"),
                                      "opportunity_id": deal_van(c, gekoppeld=False), "priority": 75, "title": "Delivery failure notice received",
                                      "description": "A bounce/failure notice arrived by email. Verify which address failed."})
            opp_id = deal_van(c, gekoppeld=True)
            belangrijk = {k2: v for k2, v in terms.items() if v and not k2.startswith("_") and k2 != "quantities_mentioned"}
            if opp_id and belangrijk and co.get("contact_policy", "allowed") != "do_not_contact" and not co.get("is_synthetic"):
                zijde = "buyer" if rol == "buyer" else ("seller" if rol == "supplier" else ("buyer" if co.get("company_type") == "buyer" else "seller"))
                eerder_bewijs = [ev for ev in d["deal_evidence"] if ev.get("opportunity_id") == opp_id and ev.get("party_side") == zijde
                                 and ev.get("evidence_type") == "stated_terms"]
                tegenstrijdig = rules.contradicted_fields(belangrijk, eerder_bewijs)
                plan["evidence"].append({"opportunity_id": opp_id, "party_side": zijde, "evidence_type": "stated_terms", "source_type": "email",
                                         "source_reference": c["id"],
                                         "verification_status": "contradicted" if tegenstrijdig else "counterparty_stated",
                                         "claim": "Terms stated by the counterparty in email: " + ", ".join(sorted(belangrijk))[:900],
                                         "metadata": {"terms": belangrijk, "engine_version": rules.ENGINE_VERSION, "communication_id": c["id"],
                                                     **({"contradicts_fields": tegenstrijdig} if tegenstrijdig else {})}})
                if tegenstrijdig:
                    plan["chase"].append({"dedupe_key": f"evidence_contradicted:{c['id']}", "action_type": "review_contradiction",
                                          "company_id": c.get("company_id"), "opportunity_id": opp_id, "priority": 85,
                                          "title": f"Contradicts earlier stated terms: {', '.join(tegenstrijdig)}",
                                          "description": "The counterparty's latest email states different values for "
                                                         f"{', '.join(tegenstrijdig)} than an earlier message. Review before relying on either."})
            if not dry_run:
                try:
                    if i:
                        await self.repo.engine_patch("email_intelligence", {"communication_id": f"eq.{c['id']}"}, {**velden, "updated_at": nu.isoformat()})
                    else:
                        await self.repo.engine_insert("email_intelligence", {
                            "communication_id": c["id"], "company_id": c.get("company_id"), "contact_id": c.get("contact_id"),
                            "opportunity_id": opp_id, "classification": LEGACY_CLASS.get(k.primary, "unknown"), "urgency": k.urgency,
                            "risk_level": k.risk, "summary": (c.get("body") or c.get("subject") or "")[:1000], "extracted_terms": terms,
                            "missing_information": missing, "requires_human_approval": True, "status": "analyzed",
                            "analyzed_at": nu.isoformat(), **velden}, on_conflict="communication_id", ignore_duplicates=True)
                except RepositoryError as e:
                    fouten.append(f"intelligence {c['id']}: {e}")

        # ── 2. Aflevering: bounced adres is een feit ─────────────────────────
        per_email: dict[str, list[dict]] = {}
        for k2 in d["contacts"]:
            if k2.get("email"):
                per_email.setdefault(_lower(k2["email"]), []).append(k2)
        draft_by_id = {x["id"]: x for x in drafts}

        def ontvangers(o: dict) -> list[str]:
            uit = [a for a in (_adres((draft_by_id.get(o.get("reply_draft_id")) or {}).get("to_email")),
                               _adres((contacts.get(o.get("contact_id")) or {}).get("email"))) if a]
            return uit + [a for a in _metadata_ontvangers(o) if a not in uit]

        # Adressen met een vastgelegde bounce. Alleen een contact met hetzelfde adres dat een mens als 'valid'
        # heeft herbevestigd heft dat op (zelfde regel als northsea_outbound_block_reason in de database).
        bounced_adressen: set[str] = set()
        for o in outbound:
            if (o.get("delivery_status") or "") not in ("bounced", "complained"):
                continue
            for adres in ontvangers(o):
                if not any(k2.get("email_status") == "valid" for k2 in per_email.get(adres, [])):
                    bounced_adressen.add(adres)
            if not any(per_email.get(a) for a in ontvangers(o)):
                # Geen contactrecord voor dit adres: de database-guard blokkeert het toch; Chase vraagt om een geverifieerd kanaal.
                plan["chase"].append({"dedupe_key": f"repair_channel_address:{o['id']}", "action_type": "repair_contact_channel",
                                      "company_id": o.get("company_id"), "opportunity_id": deal_van(o, gekoppeld=False), "priority": 90,
                                      "title": "Email address bounced — find a verified channel",
                                      "description": "The recorded recipient address bounced and will not be retried automatically. "
                                                     "Find and verify an alternative commercial contact."})
            for adres in ontvangers(o):
                for k2 in per_email.get(adres, []):
                    if k2.get("email_status") in ("bounced", "complained"):
                        continue
                    if k2.get("email_status") == "valid" and str(k2.get("email_status_at") or "") >= str(o.get("occurred_at") or ""):
                        continue  # na deze bounce door een mens herbevestigd: niet overschrijven
                    status = "complained" if o.get("delivery_status") == "complained" else "bounced"
                    plan["contacts_bounced"].append({"contact_id": k2["id"], "status": status, "communication_id": o["id"]})
                    plan["chase"].append({"dedupe_key": f"repair_channel:{k2['id']}", "action_type": "repair_contact_channel", "company_id": k2.get("company_id"),
                                          "opportunity_id": deal_van(o, gekoppeld=False), "priority": 90, "title": "Email address bounced — find a verified channel",
                                          "description": "The address bounced and will not be retried automatically. Find and verify an alternative commercial contact."})
                    k2["email_status"] = status  # voor de evaluatie hieronder
                    if not dry_run:
                        try:
                            await self.repo.engine_patch("contacts", {"id": f"eq.{k2['id']}"}, {
                                "email_status": status, "email_status_at": nu.isoformat(),
                                "email_status_reason": f"communication {o['id']} delivery_status={o.get('delivery_status')}"})
                        except RepositoryError as e:
                            fouten.append(f"contact {k2['id']}: {e}")

        # ── 3. Follow-ups ─────────────────────────────────────────────────────
        plans = d["northsea_followups"]
        for p in plans:
            if p.get("status") not in ("scheduled", "draft_created"):
                continue
            anker = next((c for c in outbound if c["id"] == p.get("anchor_communication_id")), None)
            if anker and any(i.get("company_id") == anker.get("company_id") and str(i.get("occurred_at")) > str(anker.get("occurred_at")) for i in inbound):
                plan["followups_replied"].append(p["id"])
                if not dry_run:
                    try:
                        await self.repo.engine_patch("northsea_followups", {"id": f"eq.{p['id']}"}, {"status": "replied", "updated_at": nu.isoformat()})
                    except RepositoryError as e:
                        fouten.append(f"followup {p['id']}: {e}")
        plan["followups_skipped"] = []

        def anker_bezwaar(o: dict) -> Optional[str]:
            """Waarom dit uitgaande bericht GEEN follow-up krijgt; None = mag (als pending concept)."""
            reden = None
            co = companies.get(o.get("company_id")) or {}
            ct = contacts.get(o.get("contact_id")) or {}
            adressen = [a for a in ontvangers(o) if a not in bounced_adressen]
            if CANONICAL_MAILBOX not in _lower(o.get("from_address")):
                reden = "provenance_unknown"  # P0.9: niet opvolgen namens trade@ wat niet aantoonbaar van trade@ kwam
            elif co.get("is_synthetic"):
                reden = "synthetic"
            elif co.get("contact_policy") in BLOCKING_POLICIES or ct.get("contact_policy") in BLOCKING_POLICIES:
                reden = f"contact_policy:{co.get('contact_policy') if co.get('contact_policy') in BLOCKING_POLICIES else ct.get('contact_policy')}"
            elif not adressen:
                reden = "bounced_channel" if ontvangers(o) else "no_recipient"
            if reden:
                plan["followups_skipped"].append({"anchor": o["id"], "company_id": o.get("company_id"), "reason": reden})
            return reden

        if policy_ok:
            nieuw = rules.plan_followups(outbound, inbound, plans, interval_hours=interval, max_followups=max_fu, now=nu,
                                         max_per_run=self.max_followups_per_run, anchor_ok=anker_bezwaar)
        else:
            nieuw = []
            fouten.append("follow-ups skipped: deal_automation_policy interval/max missing or invalid (fail closed)")
        for f in nieuw:
            anker = next(c for c in outbound if c["id"] == f.anchor_communication_id)
            co = companies.get(f.company_id) or {}
            ct = contacts.get(f.contact_id) or {}
            adres = next((a for a in ontvangers(anker) if a not in bounced_adressen), None)
            opp = next((o for o in d["opportunities"] if o["id"] == f.opportunity_id), None) or {}
            laatste_intel = [intel[c["id"]] for c in inbound if c.get("company_id") == f.company_id and c["id"] in intel]
            missing = next((i.get("engine_missing") or i.get("missing_information") for i in reversed(laatste_intel) if i), []) or []
            rol = co.get("company_type") if co.get("company_type") in ("buyer", "supplier") else "supplier"
            product = (off.get(opp.get("supplier_offer_id")) or req.get(opp.get("buyer_requirement_id")) or {}).get("product")
            concept = rules.followup_draft(blocker_code=opp.get("engine_blocker_code") or ("seller_unqualified" if rol == "supplier" else "buyer_unqualified"),
                                           role=rol, missing=list(missing) if isinstance(missing, list) else [], product=product,
                                           attempt=f.attempt, original_subject=anker.get("subject"))
            item = {"anchor": f.anchor_communication_id, "attempt": f.attempt, "opportunity_id": f.opportunity_id, "to": bool(adres), "reasons": f.reasons}
            plan["followups"].append(item)
            if dry_run:
                continue
            try:
                rij = await self.repo.engine_insert("northsea_followups", {
                    "anchor_communication_id": f.anchor_communication_id, "opportunity_id": f.opportunity_id, "company_id": f.company_id,
                    "contact_id": f.contact_id, "attempt": f.attempt, "due_at": f.due_at.isoformat(), "status": "scheduled",
                    "reason": "; ".join(f.reasons), "engine_version": rules.ENGINE_VERSION}, on_conflict="anchor_communication_id,attempt", ignore_duplicates=True)
                if not rij:
                    item["result"] = "already_planned"
                    continue
                fu_id = rij[0]["id"]
                if not adres:
                    await self.repo.engine_patch("northsea_followups", {"id": f"eq.{fu_id}"}, {"status": "blocked", "reason": "no recipient address", "updated_at": nu.isoformat()})
                    item["result"] = "blocked_no_recipient"
                    continue
                try:
                    dr = await self.repo.engine_insert("reply_drafts", {
                        "communication_id": f.anchor_communication_id, "company_id": f.company_id, "contact_id": f.contact_id, "opportunity_id": f.opportunity_id,
                        "to_email": adres, "subject": concept["subject"], "body": concept["body"], "purpose": f"Follow-up {f.attempt} (engine)",
                        "approval_status": "pending", "lifecycle_state": "approval_required", "sensitive_action": False, "generated_by": "northsea-engine",
                        "policy_decision": {"allowed": False, "action": "followup_send", "reasons": ["human approval required",
                                            "auto_send_followups is not used by the engine in P1"], "engine_version": rules.ENGINE_VERSION}})
                    await self.repo.engine_patch("northsea_followups", {"id": f"eq.{fu_id}"}, {"status": "draft_created", "draft_id": dr[0]["id"], "updated_at": nu.isoformat()})
                    item["result"] = "draft_created"
                except RepositoryError as e:
                    reden = str(e)
                    await self.repo.engine_patch("northsea_followups", {"id": f"eq.{fu_id}"}, {"status": "blocked", "reason": reden[-200:], "updated_at": nu.isoformat()})
                    item["result"] = "blocked_by_guard" if "NS_" in reden else "error"
                await self._audit("followup_" + item["result"], opportunity_id=f.opportunity_id, company_id=f.company_id, contact_id=f.contact_id,
                                  communication_id=f.anchor_communication_id, details={"attempt": f.attempt, "reasons": f.reasons})
            except RepositoryError as e:
                fouten.append(f"followup {f.anchor_communication_id}: {e}")

        # ── 4. Deal-evaluatie ─────────────────────────────────────────────────
        per_opp_comm: dict[str, list[dict]] = {}
        for c in comms:
            opp_id = deal_van(c, gekoppeld=False)
            if opp_id:
                per_opp_comm.setdefault(opp_id, []).append(c)
        chase_by_key = {q.get("dedupe_key"): q for q in d["action_queue"] if q.get("dedupe_key")}
        onderzoek_beleid = bool(policy.get("auto_investigate_blockers"))
        plan["research_gate"] = []
        # Lopende teller binnen DEZE tick: d["action_queue"] is één keer geladen, dus als twee
        # deals in dezelfde tick allebei mogen uitvoeren, moet de tweede de aanroep van de eerste
        # al meetellen -- anders omzeilt een enkele tick het dagbudget met het aantal open deals.
        onderzoek_budget_gebruikt = rules.research_calls_used_today(d["action_queue"], nu)

        for opp in d["opportunities"]:
            if opp.get("stage") == "lost" and not opp.get("engine_blocker_code"):
                continue
            partijen = [x for x in ((req.get(opp.get("buyer_requirement_id")) or {}).get("company_id"),
                                    (off.get(opp.get("supplier_offer_id")) or {}).get("company_id")) if x]
            beleid = None
            for pid in partijen:
                cp = (companies.get(pid) or {}).get("contact_policy") or "allowed"
                if cp == "do_not_contact":
                    beleid = "do_not_contact"
                elif cp == "review_required" and beleid is None:
                    beleid = "review_required"
            # Kanaal kwijt: een partij waarvan ELK bekend e-mailadres bounced is (de andere partij kan prima bereikbaar zijn).
            bounced = False
            for pid in partijen:
                adressen = [k2 for k2 in d["contacts"] if k2.get("company_id") == pid and k2.get("email")]
                if adressen and all(k2.get("email_status") in ("bounced", "complained") for k2 in adressen):
                    bounced = True
            uitkomst = rules.evaluate_deal(
                opp, contact_policy=beleid, comms=per_opp_comm.get(opp["id"], []),
                drafts=[x for x in drafts if x.get("opportunity_id") == opp["id"]],
                followups=[p for p in plans if p.get("opportunity_id") == opp["id"]], bounced_channel=bounced, now=nu,
                interval_hours=interval if policy_ok else 48)
            # ── Governed research gate: nooit stilzwijgend betalen ────────────────────
            # Vóór de veranderd-check: een Chase-goedkeuring kan zijn afgerond zonder dat
            # de blokkade zelf deze tick verandert, en dat moet dan alsnog opgepakt worden.
            gate = rules.research_gate(uitkomst.blocker_code, opportunity_id=opp["id"], policy_allows=onderzoek_beleid,
                                       existing_chase=chase_by_key.get(rules.research_gate_dedupe_key(opp["id"], uitkomst.blocker_code)))
            plan["research_gate"].append({"opportunity_id": opp["id"], "blocker_code": uitkomst.blocker_code, "state": gate.state})
            if not dry_run and gate.dedupe_key:
                bestaand = chase_by_key.get(gate.dedupe_key)
                try:
                    if gate.create_chase:
                        rij = await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate: self.repo.engine_insert("action_queue", {
                            "dedupe_key": gate.dedupe_key, "action_type": "research_approval", "opportunity_id": opp["id"], "company_id": None,
                            "priority": 65, "title": f"Approve external research: {uitkomst.blocker}"[:200],
                            "description": "The engine wants to run one bounded, paid research call to resolve this blocker. Mark this "
                                          "item done to approve it once for this deal, or set deal_automation_policy."
                                          "auto_investigate_blockers to allow it automatically for every deal.",
                            "status": "open", "requires_approval": True,
                            "metadata": {"source": "northsea-engine", "kind": "research_approval", "blocker_code": uitkomst.blocker_code}},
                                                                                        ignore_duplicates=True))
                        if rij:
                            chase_by_key[gate.dedupe_key] = rij[0]
                            await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate: self.repo.engine_insert("deal_events", {
                                "opportunity_id": opp["id"], "event_type": "research_approval_requested", "actor": "northsea-engine",
                                "summary": f"Research approval requested for blocker: {uitkomst.blocker}"[:900],
                                "metadata": {"blocker_code": uitkomst.blocker_code, "dedupe_key": gate.dedupe_key}}))
                    elif gate.state == "approved_ready_to_execute":
                        # De ene echte, begrensde uitvoering. Nooit stilzwijgend geld uitgeven:
                        # goedkeuring alleen mag een geconfigureerd dagbudget niet omzeilen (dus
                        # eerst het budget checken), begrensde pogingen (MAX_RESEARCH_ATTEMPTS) zodat
                        # een falende aanroep niet voor altijd elke 15 minuten opnieuw probeert, en
                        # nooit tweemaal voor dezelfde deal+blokkade als het ooit lukte (executed_at).
                        goedgekeurd_via = "policy" if onderzoek_beleid and bestaand is None else "chase_item"
                        meta_bestaand = (bestaand or {}).get("metadata") or {}
                        call_log = list(meta_bestaand.get("call_log") or [])
                        if len(call_log) >= rules.MAX_RESEARCH_ATTEMPTS:
                            stempel = {"executed_at": nu.isoformat(), "execution_result": "failed_permanently",
                                      "blocker_code": uitkomst.blocker_code, "kind": "research_approval", "approved_via": goedgekeurd_via,
                                      "call_log": call_log, "last_error": meta_bestaand.get("last_error")}
                            if bestaand is not None:
                                await self._resilient(lambda bestaand=bestaand, stempel=stempel, call_log=call_log: self.repo.engine_patch(
                                    "action_queue", {"id": f"eq.{bestaand['id']}"},
                                    {"status": "open", "requires_approval": True,
                                     "description": f"Research for '{uitkomst.blocker}' failed {len(call_log)} time(s) and the engine will not "
                                                    "retry automatically; investigate manually (northsea_investigate_blockers) or resolve "
                                                    "this blocker without research."[:2000],
                                     "metadata": {**meta_bestaand, **stempel}}))
                            await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, call_log=call_log: self.repo.engine_insert(
                                "deal_events", {"opportunity_id": opp["id"], "event_type": "research_execution_failed_permanently",
                                               "actor": "northsea-engine",
                                               "summary": f"Research for '{uitkomst.blocker}' failed after {len(call_log)} attempt(s); "
                                                         "needs human attention."[:900],
                                               "metadata": {"blocker_code": uitkomst.blocker_code, "dedupe_key": gate.dedupe_key,
                                                           "attempts": len(call_log)}}))
                        elif self.research is None:
                            # Geen research-service aangesloten in DIT proces (alleen mogelijk als iemand
                            # EngineService rechtstreeks bouwt zonder research= -- create_app geeft hem
                            # altijd mee). execution_result blijft eerlijk 'not_wired', nooit 'completed':
                            # geen fake/stub-succes. Wel executed_at, zoals vóór deze wijziging: dit is een
                            # constante van het PROCES, niet iets wat een volgende tick kan oplossen, dus
                            # elke tick opnieuw proberen is alleen ruis. Een proces MET research (de normale
                            # productiepad) belandt hieronder, nooit in deze tak.
                            stempel = {"executed_at": nu.isoformat(), "blocker_code": uitkomst.blocker_code, "kind": "research_approval",
                                      "approved_via": goedgekeurd_via, "execution_result": "not_wired", "call_log": call_log}
                            if bestaand is None:
                                await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, stempel=stempel: self.repo.engine_insert(
                                    "action_queue", {"dedupe_key": gate.dedupe_key, "action_type": "research_approval", "opportunity_id": opp["id"],
                                                     "company_id": None, "priority": 65,
                                                     "title": f"Research approved, no research service: {uitkomst.blocker}"[:200],
                                                     "description": "Approved, but this engine process has no research service configured.",
                                                     "status": "completed", "requires_approval": False, "metadata": stempel}, ignore_duplicates=True))
                            else:
                                await self._resilient(lambda bestaand=bestaand, stempel=stempel: self.repo.engine_patch(
                                    "action_queue", {"id": f"eq.{bestaand['id']}"},
                                    {"status": "completed", "requires_approval": False, "metadata": {**meta_bestaand, **stempel}}))
                            await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, goedgekeurd_via=goedgekeurd_via: self.repo.engine_insert(
                                "deal_events", {"opportunity_id": opp["id"], "event_type": "research_approved_execution_not_wired",
                                               "actor": "northsea-engine",
                                               "summary": f"Research for '{uitkomst.blocker}' is approved but this engine process has no "
                                                         "research service configured."[:900],
                                               "metadata": {"blocker_code": uitkomst.blocker_code, "dedupe_key": gate.dedupe_key,
                                                           "approved_via": goedgekeurd_via}}))
                        else:
                            max_per_dag = int(policy.get("auto_investigate_blockers_max_calls_per_day") or 0)
                            gebruikt_vandaag = onderzoek_budget_gebruikt
                            if max_per_dag <= 0 or gebruikt_vandaag >= max_per_dag:
                                # Goedkeuring alleen (beleid of een mens) mag een geconfigureerd hard
                                # kostenplafond nooit omzeilen: wachten tot het dagbudget weer ruimte heeft.
                                stempel = {"blocker_code": uitkomst.blocker_code, "kind": "research_approval", "approved_via": goedgekeurd_via,
                                          "execution_result": "budget_exhausted_today", "call_log": call_log, "checked_at": nu.isoformat()}
                                if bestaand is None:
                                    await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, stempel=stempel: self.repo.engine_insert(
                                        "action_queue", {"dedupe_key": gate.dedupe_key, "action_type": "research_approval",
                                                         "opportunity_id": opp["id"], "company_id": None, "priority": 65,
                                                         "title": f"Research approved, budget exhausted today: {uitkomst.blocker}"[:200],
                                                         "description": "Approved, but today's configured research budget "
                                                                        "(auto_investigate_blockers_max_calls_per_day) is used up; will "
                                                                        "retry once the daily budget resets.",
                                                         "status": "completed", "requires_approval": False, "metadata": stempel}, ignore_duplicates=True))
                                else:
                                    # Een chase-item van vóór het beleid AAN ging kan hier nog op "open,
                                    # requires_approval" staan van zijn allereerste aanmaak -- dat is stale
                                    # zodra het beleid het al heeft goedgekeurd; niets voor Luka om te doen.
                                    await self._resilient(lambda bestaand=bestaand, stempel=stempel: self.repo.engine_patch(
                                        "action_queue", {"id": f"eq.{bestaand['id']}"},
                                        {"status": "completed", "requires_approval": False, "metadata": {**meta_bestaand, **stempel}}))
                                await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, max_per_dag=max_per_dag,
                                                      gebruikt_vandaag=gebruikt_vandaag: self.repo.engine_insert("deal_events", {
                                    "opportunity_id": opp["id"], "event_type": "research_budget_exhausted_today", "actor": "northsea-engine",
                                    "summary": f"Research for '{uitkomst.blocker}' is approved but today's research budget is used up."[:900],
                                    "metadata": {"blocker_code": uitkomst.blocker_code, "dedupe_key": gate.dedupe_key,
                                                "max_calls_per_day": max_per_dag, "used_today": gebruikt_vandaag}}))
                            else:
                                r_req, r_off = req.get(opp.get("buyer_requirement_id")) or {}, off.get(opp.get("supplier_offer_id")) or {}
                                zijde_bedrijf = (companies.get(r_off.get("company_id")) if uitkomst.blocker_code == "seller_unqualified"
                                                else companies.get(r_req.get("company_id")))
                                product = (r_off.get("product") or r_req.get("product") or r_off.get("commodity")
                                          or r_req.get("commodity") or "the commodity")
                                vraag = rules.research_question(uitkomst.blocker_code, company_name=(zijde_bedrijf or {}).get("company_name"),
                                                                country=(zijde_bedrijf or {}).get("country"), product=product)
                                nieuw_log = call_log + [nu.isoformat()]
                                onderzoek_budget_gebruikt += 1  # vóór de aanroep: telt ook mee als hij zo dadelijk faalt
                                try:
                                    antwoord = await self.research.ask(vraag, instructions=RESEARCH_INSTRUCTIONS, priority="P2")
                                except ResearchError as e:
                                    stempel = {"blocker_code": uitkomst.blocker_code, "kind": "research_approval", "approved_via": goedgekeurd_via,
                                              "call_log": nieuw_log, "last_error": e.message[:300], "last_error_status": e.status}
                                    beschrijving = f"Research attempt {len(nieuw_log)}/{rules.MAX_RESEARCH_ATTEMPTS} failed: {e.message}"[:2000]
                                    if bestaand is None:
                                        await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, stempel=stempel,
                                                              beschrijving=beschrijving: self.repo.engine_insert(
                                            "action_queue", {"dedupe_key": gate.dedupe_key, "action_type": "research_approval",
                                                             "opportunity_id": opp["id"], "company_id": None, "priority": 65,
                                                             "title": f"Research approved, attempt failed: {uitkomst.blocker}"[:200],
                                                             "description": beschrijving, "status": "completed", "requires_approval": False,
                                                             "metadata": stempel}, ignore_duplicates=True))
                                    else:
                                        await self._resilient(lambda bestaand=bestaand, stempel=stempel, beschrijving=beschrijving: self.repo.engine_patch(
                                            "action_queue", {"id": f"eq.{bestaand['id']}"},
                                            {"status": "completed", "requires_approval": False, "description": beschrijving,
                                             "metadata": {**meta_bestaand, **stempel}}))
                                    await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, e=e, nieuw_log=nieuw_log: self.repo.engine_insert(
                                        "deal_events", {"opportunity_id": opp["id"], "event_type": "research_execution_failed_retryable",
                                                       "actor": "northsea-engine",
                                                       "summary": f"Research for '{uitkomst.blocker}' failed (attempt {len(nieuw_log)}/"
                                                                 f"{rules.MAX_RESEARCH_ATTEMPTS}): {e.message}"[:900],
                                                       "metadata": {"blocker_code": uitkomst.blocker_code, "dedupe_key": gate.dedupe_key,
                                                                   "status": e.status}}))
                                else:
                                    bronnen = [s.model_dump() for s in antwoord.sources]
                                    stempel = {"executed_at": nu.isoformat(), "execution_result": "completed", "provider": "perplexity",
                                              "cost_usd": antwoord.cost_usd, "sources": bronnen, "result_text": antwoord.text[:2000],
                                              "blocker_code": uitkomst.blocker_code, "kind": "research_approval",
                                              "approved_via": goedgekeurd_via, "call_log": nieuw_log}
                                    if bestaand is None:
                                        await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, stempel=stempel: self.repo.engine_insert(
                                            "action_queue", {"dedupe_key": gate.dedupe_key, "action_type": "research_approval",
                                                             "opportunity_id": opp["id"], "company_id": None, "priority": 65,
                                                             "title": f"Research completed: {uitkomst.blocker}"[:200],
                                                             "description": "Research completed by the engine; a human must still verify "
                                                                            "this evidence before the blocker is cleared.",
                                                             "status": "completed", "requires_approval": False, "metadata": stempel},
                                                                                                    ignore_duplicates=True))
                                    else:
                                        await self._resilient(lambda bestaand=bestaand, stempel=stempel: self.repo.engine_patch(
                                            "action_queue", {"id": f"eq.{bestaand['id']}"},
                                            {"status": "completed", "metadata": {**meta_bestaand, **stempel}}))
                                    zijde = "seller" if uitkomst.blocker_code == "seller_unqualified" else "buyer"
                                    await self._resilient(lambda opp=opp, zijde=zijde, antwoord=antwoord, bronnen=bronnen,
                                                          uitkomst=uitkomst: self.repo.engine_insert("deal_evidence", {
                                        "opportunity_id": opp["id"], "party_side": zijde, "evidence_type": f"engine_research:{uitkomst.blocker_code}",
                                        "claim": antwoord.text[:2000], "verification_status": "unverified", "source_type": "web",
                                        "metadata": {"provider": "perplexity", "cost_usd": antwoord.cost_usd, "sources": bronnen,
                                                    "generated_by": "northsea-engine", "blocker_code": uitkomst.blocker_code}}))
                                    await self._resilient(lambda opp=opp, uitkomst=uitkomst, gate=gate, antwoord=antwoord,
                                                          bronnen=bronnen: self.repo.engine_insert("deal_events", {
                                        "opportunity_id": opp["id"], "event_type": "research_executed", "actor": "northsea-engine",
                                        "summary": f"Research for '{uitkomst.blocker}' completed (cost ${antwoord.cost_usd:.4f}); a human "
                                                  "must verify it."[:900],
                                        "metadata": {"blocker_code": uitkomst.blocker_code, "dedupe_key": gate.dedupe_key,
                                                    "cost_usd": antwoord.cost_usd, "provider": "perplexity", "source_count": len(bronnen)}}))
                except RepositoryError as e:
                    fouten.append(f"research_gate {opp['id']}: {e}")

            veranderd = (opp.get("engine_blocker_code"), opp.get("engine_next_action_code")) != (uitkomst.blocker_code, uitkomst.next_action_code)
            if not veranderd:
                continue
            plan["evaluations"].append({"opportunity_id": opp["id"], "from": opp.get("engine_blocker_code"), "to": uitkomst.blocker_code,
                                        "next": uitkomst.next_action_code})
            if dry_run:
                continue
            try:
                await self._resilient(lambda: self.repo.engine_patch("opportunities", {"id": f"eq.{opp['id']}"}, {
                    "engine_blocker_code": uitkomst.blocker_code, "engine_blocker": uitkomst.blocker,
                    "engine_next_action_code": uitkomst.next_action_code, "engine_next_action": uitkomst.next_action,
                    "engine_owner": uitkomst.owner, "engine_reasons": uitkomst.reasons, "engine_evaluated_at": nu.isoformat()}))
                gewijzigd = rules.changed_since_last_evaluation(req.get(opp.get("buyer_requirement_id")), off.get(opp.get("supplier_offer_id")),
                                                                opp.get("engine_evaluated_at"))
                await self._resilient(lambda gewijzigd=gewijzigd: self.repo.engine_insert("deal_events", {
                    "opportunity_id": opp["id"], "event_type": "engine_evaluation_changed", "actor": "northsea-engine",
                    "summary": f"Current blocker: {uitkomst.blocker} Next: {uitkomst.next_action}"[:900],
                    "metadata": {**uitkomst.as_dict(), "previous_blocker_code": opp.get("engine_blocker_code"),
                                "changed_since_last_evaluation": gewijzigd}}))
                # Was de vorige blokkade "een concept wacht op goedkeuring" en is dat nu niet meer
                # zo? Dan is er sinds de vorige tick een besluit genomen -- welk concept en welk
                # besluit staat al in reply_drafts.approval_status, alleen niet als eigen event.
                if opp.get("engine_blocker_code") == "approval_pending" and uitkomst.blocker_code != "approval_pending":
                    for dft in drafts:
                        if dft.get("opportunity_id") == opp["id"] and dft.get("approval_status") in ("approved", "rejected"):
                            await self._resilient(lambda dft=dft: self.repo.engine_insert("deal_events", {
                                "opportunity_id": opp["id"],
                                "event_type": "approval_granted" if dft.get("approval_status") == "approved" else "approval_rejected",
                                "actor": "northsea-engine",
                                "summary": f"Draft {dft.get('subject') or dft.get('id')} was {dft.get('approval_status')}."[:900],
                                "metadata": {"draft_id": dft.get("id"), "approval_status": dft.get("approval_status"),
                                            "approved_by": dft.get("approved_by"), "approval_channel": dft.get("approval_channel")}}))
            except RepositoryError as e:
                fouten.append(f"evaluation {opp['id']}: {e}")

        # ── 4b. Deadlines: naderend of verstreken (open taken met due_at) ────────
        deadline_items = rules.deadline_chase_items(d["deal_tasks"], now=nu)
        plan["chase"].extend(deadline_items)
        plan["deadlines"] = deadline_items

        # ── 5. Bewijs en Chase ────────────────────────────────────────────────
        if not dry_run:
            for ev in plan["evidence"]:
                try:
                    await self.repo.engine_insert("deal_evidence", ev, ignore_duplicates=True)
                except RepositoryError as e:
                    fouten.append(f"evidence {ev['source_reference']}: {e}")
            open_keys = {q.get("dedupe_key") for q in d["action_queue"] if q.get("status") in OPEN_TASK and q.get("dedupe_key")}
            for ch in plan["chase"]:
                if ch["dedupe_key"] in open_keys:
                    ch["result"] = "already_open"
                    continue
                try:
                    rij = await self.repo.engine_insert("action_queue", {**ch, "status": "open", "requires_approval": False,
                                                                         "metadata": {"source": "northsea-engine", "engine_version": rules.ENGINE_VERSION}},
                                                        ignore_duplicates=True)
                    ch["result"] = "created" if rij else "already_open"
                except RepositoryError as e:
                    ch["result"] = "blocked_by_guard" if "NS_" in str(e) else "error"
                    if ch["result"] == "error":
                        fouten.append(f"chase {ch['dedupe_key']}: {e}")

        samenvatting = {k: len(v) for k, v in plan.items()}
        if not dry_run:
            await self._audit("engine_tick", details={"summary": samenvatting, "errors": fouten[:20], "engine_version": rules.ENGINE_VERSION})
        return {"engine_version": rules.ENGINE_VERSION, "dry_run": dry_run, "at": nu.isoformat(), "summary": samenvatting,
                "plan": plan if dry_run else {k: v[:50] for k, v in plan.items()}, "errors": fouten, "sent": 0}

    async def _audit(self, action: str, **kw: Any) -> None:
        try:
            await self.repo.engine_insert("northsea_audit_events", {"actor_type": "automation", "actor": "northsea-engine", "action": action,
                                                                     "details": kw.pop("details", {}), **{k: v for k, v in kw.items() if v}})
        except RepositoryError as e:  # audit mag de tick niet stoppen
            log.warning("engine audit failed: %s", e)
