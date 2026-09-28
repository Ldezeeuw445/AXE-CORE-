"""De commerciële fit moet gelijk rekenen aan `matchScore` in de edge function commodity-intake.

Verwachte waarden met de hand uitgerekend volgens die TypeScript-regel:
commodity 30, product 20, grade 10, zuiverheid 10, hoeveelheid 10, Incoterm 10, beide L/C 10.
"""
from northsea_mcp import matching

BUYER = {"commodity": "Copper", "product": "Copper Cathode", "grade": "LME Grade A", "purity": 99.99, "quantity_mt": 500,
         "incoterm": "CIF", "payment_terms": "LC at sight", "destination": "Qinzhou"}
SUPPLIER = {"commodity": "copper", "product": "Copper cathodes", "grade": "Grade A", "purity": "99.99", "quantity_mt": 600,
            "incoterm": "cif", "payment_terms": "Letter of Credit (MT700)", "loading_port": "Walvis Bay", "price_basis": "LME",
            "mandate_status": "principal producer"}


def test_full_match_is_100_like_the_intake():
    assert matching.match_score(BUYER, SUPPLIER) == 100


def test_each_rule_contributes_exactly_its_weight():
    assert matching.match_score(BUYER, {**SUPPLIER, "incoterm": "FOB"}) == 90
    assert matching.match_score(BUYER, {**SUPPLIER, "payment_terms": "TT"}) == 90
    assert matching.match_score(BUYER, {**SUPPLIER, "quantity_mt": 100, "monthly_capacity_mt": None}) == 90
    # quantity_mt ontbreekt -> monthly_capacity_mt telt, zoals `s.quantity_mt||s.monthly_capacity_mt`
    assert matching.match_score(BUYER, {**SUPPLIER, "quantity_mt": None, "monthly_capacity_mt": 800}) == 100
    assert matching.match_score(BUYER, {**SUPPLIER, "purity": 99.9}) == 90
    assert matching.match_score(BUYER, {**SUPPLIER, "grade": "Grade B"}) == 90
    assert matching.match_score(BUYER, {**SUPPLIER, "commodity": "Aluminium", "product": "Aluminium ingot", "grade": None}) == 40


def test_below_threshold_pair():
    s = matching.match_score({"commodity": "Copper", "product": "Copper Cathode"}, {"commodity": "Copper", "product": "Copper Wire Rod"})
    assert s == 30 and s < matching.MATCH_THRESHOLD


def test_explain_lists_matches_conflicts_and_unknowns():
    uit = matching.explain_match({**BUYER, "incoterm": "FOB", "required_delivery": None}, {**SUPPLIER})
    velden = {m["field"] for m in uit["matching_fields"]}
    assert {"commodity", "product", "grade", "purity", "quantity_mt", "payment_terms"} <= velden
    assert [c["field"] for c in uit["conflicts"]] == ["incoterm"]
    assert "required_delivery" in uit["unknowns"]


def test_readiness_is_separate_and_conservative():
    unverified = {"verification_status": "unverified"}
    score, blockers = matching.readiness_score(unverified, unverified, {"mandate_status": "claimed, unverified"},
                                               {"commission_agreement_status": "not_started"})
    assert score == 0
    assert set(blockers) == {"buyer_entity_not_verified", "supplier_entity_not_verified", "seller_authority_not_evidenced",
                             "commission_protection_not_signed"}
    verified = {"verification_status": "verified"}
    score2, blockers2 = matching.readiness_score(verified, verified, {"mandate_status": "principal producer"},
                                                 {"commission_agreement_status": "signed", "buyer_gate_passed": True})
    assert score2 == 25 + 25 + 15 + 5 + 10 and blockers2 == []
