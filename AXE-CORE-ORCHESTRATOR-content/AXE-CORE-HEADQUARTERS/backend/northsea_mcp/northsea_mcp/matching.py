"""Commerciële fit en transactiegereedheid -- twee aparte scores (OPERATING_MODEL.md).

## De commerciële fit is GEEN nieuwe regel

`commercial_fit_score` volgt `matchScore` uit de bestaande edge function
`commodity-intake` (AXE Commodities) punt voor punt: commodity 30, product 20,
grade 10, zuiverheid 10, hoeveelheid 10, Incoterm 10, betaling (beide L/C) 10.
Daarop maakt de intake op de website opportunities aan (drempel 60). Als deze
server anders zou rekenen, zou een deal via MCP een andere score krijgen dan
dezelfde deal op de website. `test_matching.py` legt die gelijkheid vast.

Wat hier BIJ komt is uitleg: welke velden kloppen, welke botsen, welke onbekend
zijn -- en een aparte gereedheidsscore uit verificatie, mandaat en poorten.
"""
from __future__ import annotations

import re
from typing import Any

MATCH_THRESHOLD = 60


def _norm(v: Any) -> str:
    s = v.strip()[:300] if isinstance(v, str) else ""
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n == n and abs(n) != float("inf") else None


def has_lc(v: Any) -> bool:
    s = v.strip()[:500] if isinstance(v, str) else ""
    return bool(re.search(r"\b(l\s*/?\s*c|letter\s+of\s+credit|mt\s*700|documentary\s+credit)\b", s, re.I))


def match_score(b: dict, s: dict) -> int:
    """Port van `matchScore` uit commodity-intake. Niet 'verbeteren' zonder daar ook."""
    x = 0
    bc, sc = _norm(b.get("commodity")), _norm(s.get("commodity"))
    bp, sp = _norm(b.get("product")), _norm(s.get("product"))
    bg, sg = _norm(b.get("grade")), _norm(s.get("grade"))
    if bc and sc and (bc == sc or sc in bc or bc in sc):
        x += 30
    if bp and sp and (bp == sp or sp in bp or bp in sp or
                      ("copper" in bp and "copper" in sp and "cathod" in bp and "cathod" in sp)):
        x += 20
    if bg and sg and (sg in bg or bg in sg or ("grade a" in bg and "grade a" in sg)):
        x += 10
    bpur, spur = _num(b.get("purity")), _num(s.get("purity"))
    if bpur is not None and spur is not None and spur >= bpur - 0.02:
        x += 10
    bq = _num(b.get("quantity_mt"))
    sq = _num(s.get("quantity_mt")) or _num(s.get("monthly_capacity_mt"))
    if bq is not None and sq is not None and sq >= bq:
        x += 10
    if _norm(b.get("incoterm")) and _norm(s.get("incoterm")) and _norm(b.get("incoterm")) == _norm(s.get("incoterm")):
        x += 10
    if has_lc(b.get("payment_terms")) and has_lc(s.get("payment_terms")):
        x += 10
    return min(100, x)


def _veld(naam: str, b: Any, s: Any) -> dict:
    return {"field": naam, "buyer": b, "supplier": s}


def explain_match(b: dict, s: dict) -> dict:
    """Welke velden passen, botsen of ontbreken. Alleen uit wat er staat."""
    matching: list[dict] = []
    conflicts: list[dict] = []
    unknowns: list[str] = []

    def vergelijk(naam: str, bv: Any, sv: Any, past: bool) -> None:
        if bv in (None, "") or sv in (None, ""):
            unknowns.append(naam)
        elif past:
            matching.append(_veld(naam, bv, sv))
        else:
            conflicts.append(_veld(naam, bv, sv))

    bc, sc = _norm(b.get("commodity")), _norm(s.get("commodity"))
    vergelijk("commodity", b.get("commodity"), s.get("commodity"), bool(bc and sc and (bc == sc or sc in bc or bc in sc)))
    bp, sp = _norm(b.get("product")), _norm(s.get("product"))
    vergelijk("product", b.get("product"), s.get("product"),
              bool(bp and sp and (bp == sp or sp in bp or bp in sp or
                                  ("copper" in bp and "copper" in sp and "cathod" in bp and "cathod" in sp))))
    bg, sg = _norm(b.get("grade")), _norm(s.get("grade"))
    vergelijk("grade", b.get("grade"), s.get("grade"), bool(bg and sg and (sg in bg or bg in sg or ("grade a" in bg and "grade a" in sg))))
    bpur, spur = _num(b.get("purity")), _num(s.get("purity"))
    vergelijk("purity", bpur, spur, bpur is not None and spur is not None and spur >= bpur - 0.02)
    bq = _num(b.get("quantity_mt"))
    sq = _num(s.get("quantity_mt")) or _num(s.get("monthly_capacity_mt"))
    vergelijk("quantity_mt", bq, sq, bq is not None and sq is not None and sq >= bq)
    vergelijk("incoterm", b.get("incoterm"), s.get("incoterm"),
              bool(_norm(b.get("incoterm")) and _norm(b.get("incoterm")) == _norm(s.get("incoterm"))))
    bpay, spay = b.get("payment_terms"), s.get("payment_terms")
    vergelijk("payment_terms", bpay, spay, has_lc(bpay) and has_lc(spay) or (_norm(bpay) != "" and _norm(bpay) == _norm(spay)))
    # Bestemming/herkomst botsen zelden hard; alleen noteren als het een expliciete uitsluiting is.
    if b.get("origin_preference") and s.get("origin"):
        voorkeur, herkomst = _norm(b.get("origin_preference")), _norm(s.get("origin"))
        if re.search(r"\b(no|not|exclud\w*|except)\b", voorkeur) and herkomst and herkomst in voorkeur:
            conflicts.append(_veld("origin", b.get("origin_preference"), s.get("origin")))
        elif herkomst and herkomst in voorkeur:
            matching.append(_veld("origin", b.get("origin_preference"), s.get("origin")))
    for naam in ("destination", "required_delivery"):
        if not b.get(naam):
            unknowns.append(naam)
    for naam in ("loading_port", "price_basis", "mandate_status"):
        if not s.get(naam):
            unknowns.append(naam)
    return {"matching_fields": matching, "conflicts": conflicts, "unknowns": sorted(set(unknowns))}


VERIFICATIE_PUNTEN = {"verified": 25, "reviewing": 10, "unverified": 0, "rejected": -25}
GATES = ("buyer", "seller", "commercial", "evidence", "protection", "introduction", "transaction", "fulfilment", "settlement")


def readiness_score(buyer_company: dict | None, supplier_company: dict | None, offer: dict | None,
                    opportunity: dict | None = None) -> tuple[int, list[str]]:
    """Transactiegereedheid: kan dit NU uitgevoerd worden, los van hoe goed het past.

    Bewust conservatief: alleen expliciete, gecontroleerde feiten tellen. Een
    geclaimd mandaat zonder verificatie telt niet.
    """
    punten = 0
    blokkades: list[str] = []
    for kant, bedrijf in (("buyer", buyer_company), ("supplier", supplier_company)):
        status = (bedrijf or {}).get("verification_status") or "unverified"
        punten += VERIFICATIE_PUNTEN.get(status, 0)
        if status != "verified":
            blokkades.append(f"{kant}_entity_not_verified")
    mandaat = _norm((offer or {}).get("mandate_status"))
    if mandaat and re.search(r"\b(verified|principal|producer|refinery|confirmed)\b", mandaat) and "unverified" not in mandaat:
        punten += 15
    else:
        blokkades.append("seller_authority_not_evidenced")
    if opportunity:
        gepasseerd = sum(1 for g in GATES if opportunity.get(f"{g}_gate_passed"))
        punten += gepasseerd * 5
        if (opportunity.get("commission_agreement_status") or "") != "signed":
            blokkades.append("commission_protection_not_signed")
        else:
            punten += 10
    return max(0, min(100, punten)), blokkades
