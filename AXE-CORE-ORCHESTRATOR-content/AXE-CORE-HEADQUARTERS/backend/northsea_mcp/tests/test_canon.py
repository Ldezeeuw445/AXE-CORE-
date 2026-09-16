"""canon.py tegen de gedeelde gevallen die ook de TypeScript-kant test."""
import json
from pathlib import Path

from northsea_mcp import canon

FIX = json.loads((Path(__file__).parent / "canon_fixtures.json").read_text())


def test_deal_stand_en_actief_zoals_het_dashboard():
    for d in FIX["deals"]:
        assert canon.is_active(d) is d["expect"]["active"], d["id"]
        assert canon.deal_state(d) == d["expect"]["state"], d["id"]


def test_routes_en_niet_geplaatst_zoals_de_kaart():
    kaart = canon.build_map(FIX["deals"])
    per = {r["deal_id"]: r for r in kaart["routes"]}
    niet = {n["deal_id"]: n for n in kaart["not_placed"]}
    for d in FIX["deals"]:
        e = d["expect"]
        if e["route"]:
            r = per[d["id"]]
            assert [r["from"], r["from_source"], r["to"], r["to_source"], r["approximate"]] == e["route"], d["id"]
        else:
            assert d["id"] not in per
            assert (niet[d["id"]]["side"], niet[d["id"]]["reason"]) == (e["not_placed_side"], e["not_placed_reason"]), d["id"]


def test_plaatsen():
    for tekst, label, reden in FIX["places"]:
        loc, r = canon.resolve_place(tekst)
        assert (loc["label"] if loc else None, r) == (label, reden), tekst


def test_testcase_en_do_not_contact():
    assert canon.testcase_reason({"id": "7c328c1a-fd41-4592-86bb-de954a384e2b"})
    assert canon.testcase_reason({"id": "x", "evidence": "STRATO TEST CALL: synthetic Jasmine qualification test"})
    assert canon.testcase_reason({"id": "x", "evidence": "Public RFQ dated Jun 2026"}) is None
    assert canon.do_not_contact_reason({"id": "f5008747-2a96-4c84-b308-e7ae4670ee2f"})
    assert "declined intermediary" in canon.do_not_contact_reason(
        {"id": "y", "notes": "They explicitly declined intermediary involvement."})
    assert canon.do_not_contact_reason({"id": "z", "notes": "Active buyer"}) is None


def test_bewijs_alleen_verified_is_verified():
    assert canon.evidence_class("verified") == "verified"
    assert canon.evidence_class("counterparty_stated") == "partial"
    assert canon.evidence_class("public_source_only") == "unverified"
    assert canon.evidence_class("contradicted") == "contradicted"
