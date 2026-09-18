"""P1 Communication Engine — regels. Geen netwerk, geen database."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from northsea_mcp import engine_rules as e

NU = datetime(2026, 9, 16, 12, 0, tzinfo=timezone.utc)


def iso(h: float) -> str:
    return (NU + timedelta(hours=h)).isoformat()


# ── Classificatie ────────────────────────────────────────────────────────────

def test_buyer_supplier_and_ambiguous():
    assert e.classify("Requirement", "We require 500 MT copper cathode CIF Rotterdam").primary == "buyer"
    assert e.classify("Offer", "We can supply 1,000 MT monthly, available stock").primary == "supplier"
    c = e.classify("Deal", "We can supply cathodes and we are looking to buy wire rod")
    assert c.primary == "ambiguous" and "ambiguous: both buyer and supplier signals" in c.reasons


def test_rejection_bounce_spam_and_reply():
    assert e.classify("Re: allocation", "Thank you but we are not interested. Direct sellers only.").primary == "rejection"
    assert e.classify("Delivery Status Notification (Failure)", "Address not found").primary == "bounce_failure"
    assert e.classify("Grow your business", "Join our webinar, click here").primary == "spam_noise"
    c = e.classify("Re: qualification", "Please find attached the COA and SGS report")
    assert c.primary == "documents_evidence" and "reply" in c.categories


def test_nothing_recognisable_is_ambiguous_not_guessed():
    c = e.classify("Hello", "Good morning")
    assert c.primary == "ambiguous" and c.risk == "review"


def test_sensitive_content_is_high_risk():
    c = e.classify("Re: offer", "Please share the seller identity and banking instructions for the beneficiary")
    assert c.sensitive and c.risk == "high"


# ── Extractie ────────────────────────────────────────────────────────────────

def test_extracts_only_explicit_terms():
    t = e.extract_terms("LME Grade A copper cathode", (
        "We can supply 1,200 MT per month, origin: Zambia. Purity 99.99%. Loading port: Durban. FOB or CIF. "
        "Payment by DLC at sight. Price USD 9,150 per MT, valid until 30 September. Shipment within 30 days. "
        "We are the sole mandate of the producer. COA and SGS available."))
    assert t["commodity"].lower() == "copper cathode" and t["grade"] == "LME Grade A" and t["purity_pct"] == 99.99
    assert t["quantity_mt"] == 1200 and t["recurring"] is True
    assert t["origin"] == "Zambia" and "Durban" in t["destination_or_port"]
    assert t["incoterms"] == ["FOB", "CIF"] and "DLC" in t["payment_instruments"]
    assert t["prices"][0]["value"] == 9150 and t["prices"][0]["currency"] == "USD"
    assert any("valid until" in v.lower() for v in t["validity"]) and t["timing"]
    assert any("mandate" in a.lower() for a in t["authority_claims"])
    assert {"COA", "SGS"} <= set(t["documents_mentioned"])


def test_absent_terms_stay_none():
    t = e.extract_terms("Hello", "Interested in copper. Please call me.")
    for veld in ("quantity_mt", "incoterms", "payment_instruments", "prices", "origin", "validity", "authority_claims", "recurring"):
        assert t[veld] is None, veld


def test_pricing_basis_and_spot():
    t = e.extract_terms("", "Trial shipment 25 MT at LME minus 4% , spot")
    assert t["pricing_basis"] and t["recurring"] is False and t["quantity_mt"] == 25


def test_missing_information_per_role():
    t = e.extract_terms("", "We require 500 MT copper cathode CIF Qinzhou, payment LC")
    mis = e.missing_information("buyer", t)
    assert "target shipment timing" in mis and "legal buying entity and authority" in mis and "Incoterm" not in mis
    assert e.missing_information("unknown", t) == []


# ── Deal-evaluatie ───────────────────────────────────────────────────────────

def ev(**kw):
    base = dict(opp={"id": "o1", "stage": "identified"}, contact_policy=None, comms=[], drafts=[], followups=[], bounced_channel=False, now=NU)
    base.update(kw)
    return e.evaluate_deal(**base)


def test_evaluation_order_of_severity():
    assert ev(opp={"id": "o", "is_synthetic": True}).blocker_code == "synthetic"
    assert ev(contact_policy="do_not_contact").next_action_code == "close_out"
    r = ev(contact_policy="review_required")
    assert r.blocker_code == "contact_policy_review" and r.owner == "luka"
    assert ev(bounced_channel=True).next_action_code == "find_verified_channel"
    assert ev(drafts=[{"approval_status": "pending", "subject": "Re: x"}]).next_action_code == "review_draft"


def test_reply_needed_and_followup_overdue():
    inbound_last = [{"channel": "email", "direction": "outbound", "occurred_at": iso(-50)}, {"channel": "email", "direction": "inbound", "occurred_at": iso(-2)}]
    assert ev(comms=inbound_last).blocker_code == "reply_needed"
    assert ev(comms=[{"channel": "email", "direction": "outbound", "occurred_at": iso(-49)}]).blocker_code == "awaiting_reply_overdue"
    assert ev(comms=[{"channel": "email", "direction": "outbound", "occurred_at": iso(-10)}]).blocker_code == "awaiting_reply"


def test_synthetic_messages_do_not_drive_state():
    assert ev(comms=[{"channel": "email", "direction": "inbound", "occurred_at": iso(-1), "is_synthetic": True}]).blocker_code == "seller_unqualified"


def test_gates_then_protection():
    assert ev(opp={"id": "o", "stage": "identified", "seller_gate_passed": True}).blocker_code == "buyer_unqualified"
    r = ev(opp={"id": "o", "stage": "identified", "seller_gate_passed": True, "buyer_gate_passed": True})
    assert r.blocker_code == "protection_missing" and r.owner == "luka"


# ── Follow-ups ───────────────────────────────────────────────────────────────

def out(i, h, co="c1", opp="o1", **kw):
    return {"id": i, "direction": "outbound", "channel": "email", "occurred_at": iso(h), "company_id": co, "opportunity_id": opp, **kw}


def test_followup_due_once_and_idempotent():
    plans = e.plan_followups([out("m1", -60)], [], [], interval_hours=48, max_followups=3, now=NU)
    assert len(plans) == 1 and plans[0].attempt == 1
    bestaand = [{"anchor_communication_id": "m1", "status": "scheduled", "opportunity_id": "o1", "created_at": iso(-1)}]
    assert e.plan_followups([out("m1", -60)], [], bestaand, interval_hours=48, max_followups=3, now=NU) == []


def test_no_followup_when_replied_bounced_too_early_or_exhausted():
    assert e.plan_followups([out("m1", -60)], [{"company_id": "c1", "occurred_at": iso(-30)}], [], interval_hours=48, max_followups=3, now=NU) == []
    assert e.plan_followups([out("m1", -60, delivery_status="bounced")], [], [], interval_hours=48, max_followups=3, now=NU) == []
    assert e.plan_followups([out("m1", -10)], [], [], interval_hours=48, max_followups=3, now=NU) == []
    klaar = [{"anchor_communication_id": "m1", "status": "draft_created", "created_at": iso(-100)}] * 0 + \
            [{"anchor_communication_id": "m1", "status": s, "created_at": iso(-200)} for s in ("cancelled", "expired", "cancelled")]
    assert e.plan_followups([out("m1", -300)], [], klaar, interval_hours=48, max_followups=3, now=NU) == []
    assert e.plan_followups([out("m1", -60)], [], [], interval_hours=48, max_followups=0, now=NU) == []


def test_only_latest_outbound_is_anchor_and_one_per_deal():
    plans = e.plan_followups([out("m1", -100), out("m2", -60), out("m3", -70, co="c2")], [], [], interval_hours=48, max_followups=3, now=NU)
    # m1 niet (er kwam later nog een bericht aan c1); m3 (oudste, andere partij) eerst; m2 niet (zelfde deal deze run).
    assert [p.anchor_communication_id for p in plans] == ["m3"]


def test_storm_cap_per_run():
    many = [out(f"m{i}", -60, co=f"c{i}", opp=f"o{i}") for i in range(25)]
    assert len(e.plan_followups(many, [], [], interval_hours=48, max_followups=3, now=NU, max_per_run=10)) == 10


def test_synthetic_outbound_never_followed_up():
    assert e.plan_followups([out("m1", -60, is_synthetic=True)], [], [], interval_hours=48, max_followups=3, now=NU) == []


# ── Concepten ────────────────────────────────────────────────────────────────

def test_draft_names_real_open_points_and_commits_nothing():
    d = e.followup_draft(blocker_code="seller_unqualified", role="supplier", missing=["seller authority (principal or mandate)", "origin/refinery"],
                         product="Copper Cathode", attempt=1, original_subject="Copper Cathode — supply qualification")
    assert d["subject"].startswith("Re: ") and "Seller authority" in d["body"] and "Origin/refinery" in d["body"]
    assert "No counterparty introduction or binding commercial commitment" in d["body"]
    for verboden in ("accept", "we agree", "confirmed price", "bank account"):
        assert verboden not in d["body"].lower()


def test_draft_falls_back_to_blocker_questions():
    d = e.followup_draft(blocker_code="buyer_unqualified", role="buyer", missing=[], product=None, attempt=2, original_subject=None)
    assert "legal buying entity" in d["body"] and "reminder" in d["body"]


def test_anchor_veto_applies_after_latest_rule():
    # m2 is het laatste bericht aan c1 maar zonder bruikbare herkomst: geen follow-up, en m1 (ouder) ook niet.
    veto = lambda o: "provenance_unknown" if o["id"] == "m2" else None
    assert e.plan_followups([out("m1", -100), out("m2", -60)], [], [], interval_hours=48, max_followups=3, now=NU, anchor_ok=veto) == []


def test_platform_newsletter_is_spam_not_rejection():
    # Productie 16 sep: TradeWheel-welkomstmails werden 'rejection' door de unsubscribe-voettekst.
    c = e.classify("Welcome to Tradewheel — Verify your email & start exploring global trade!",
                   "<https://mandrillapp.com/track/click/1> Thanks for joining TradeWheel. Not interested? Unsubscribe here.")
    assert c.primary == "spam_noise"
    assert e.classify("Re: offer", "Thank you, but we are not interested at this time.").primary == "rejection"
    assert e.classify("Re: offer", "Please remove me from your mailing list.").primary == "rejection"


def test_operational_limits_are_not_rejections():
    assert e.classify("Re: qualification", "We can supply 500 MT but we are not able to offer FOB, only CIF.").primary == "supplier"
    assert e.classify("Re: LC", "The bank declined the draft wording; we will send a corrected version.").primary != "rejection"


def test_followup_draft_does_not_prefix_new_lines_with_quotes():
    d = e.followup_draft(blocker_code="seller_unqualified", role="supplier", missing=["origin"],
                         product="Copper Cathode", attempt=1, original_subject="Copper")
    assert d["body"]
    assert not any(line.lstrip().startswith(">") for line in d["body"].splitlines())
    assert "Kind regards" in d["body"]

