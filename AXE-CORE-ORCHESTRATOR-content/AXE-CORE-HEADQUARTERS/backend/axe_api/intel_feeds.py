"""Insider- en congress-trades voor Trading OS, zelf opgehaald op de VPS.

## Waarom dit bestaat (9 nov 2026)

Elke feed in intel_sync_log stond sinds 14 augustus 23:39 stil. Ze vulden zich
alleen als de oude intel-pagina de edge function `intel-proxy` aanriep, en die
pagina doet dat niet meer. De versie die nu draait haalt insiders en congress
bovendien bij Unusual Whales, en dat abonnement is opgezegd: elke aanroep geeft
401. De congress-cron van de Companion-app gaf ondertussen elke dag 503, want
daar staat geen Alpha Vantage-sleutel.

Dus doen we het hier, als staande dienst, met bronnen die we wel hebben:
  * insiders: SEC EDGAR Form 4, gratis, alleen een User-Agent nodig;
  * congress: Alpha Vantage CONGRESS_TRADES met ALPHAVANTAGE_API_KEY, die al
    in de env van deze backend staat. Er wordt geen sleutel tussen diensten
    gekopieerd.

## Grenzen

Alleen lezen bij de bron en schrijven in de intel-tabellen. Geen orders, geen
advies. Wat niet duidelijk een koop of verkoop is, laten we weg in plaats van
te raden: een verkeerde richting is erger dan een ontbrekende rij.
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

log = logging.getLogger("axe_intel_feeds")

SEC_HEADERS = {"User-Agent": "AXE-Companion-OS support@axecompanion.com"}
# SEC staat 10 verzoeken per seconde toe; wij blijven er ruim onder.
SEC_PAUZE_S = 0.15
INSIDER_MAX_MELDINGEN = 60

CONGRESS_TICKERS = ("NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO", "SPY")
# Gratis Alpha Vantage = 25 verzoeken per dag. Eén ronde per dag is 10.
CONGRESS_ELKE = timedelta(hours=20)
AV_PAUZE_S = 1.2

Getter = Callable[[str, dict[str, str] | None], tuple[int, str]]


def _http_get(url: str, headers: dict[str, str] | None = None) -> tuple[int, str]:
    import httpx
    r = httpx.get(url, headers=headers or {}, timeout=20, follow_redirects=True)
    return r.status_code, r.text


# ── insiders (SEC EDGAR Form 4) ────────────────────────────────────────────

def _xml(tekst: str, tag: str) -> str:
    """Eerste <tag>…</tag>; Form 4 zet waarden vaak in een <value>-kind."""
    m = re.search(rf"<{tag}>\s*(?:<value>)?\s*([^<]*)", tekst, re.I)
    return m.group(1).strip() if m else ""


def _iso(s: str) -> str | None:
    s = (s or "").strip()[:10]
    return s if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s) else None


def form4_rijen(xml: str, filing_url: str | None = None) -> list[dict[str, Any]]:
    """Open-markt koop (P) en verkoop (S) uit één Form 4. Al het andere
    (opties, schenkingen, belasting-inhouding) is geen signaal en valt weg."""
    ticker = _xml(xml, "issuerTradingSymbol").split()[0].upper() if _xml(xml, "issuerTradingSymbol") else ""
    naam = _xml(xml, "rptOwnerName")
    if not ticker or not naam or ticker in ("NONE", "N/A"):
        return []
    rol = _xml(xml, "officerTitle") or None
    if not rol:
        if _xml(xml, "isDirector") in ("1", "true"):
            rol = "Director"
        elif _xml(xml, "isTenPercentOwner") in ("1", "true"):
            rol = "10% Owner"
    rapport = _iso(_xml(xml, "periodOfReport"))
    uit = []
    for blok in re.findall(r"<nonDerivativeTransaction>([\s\S]*?)</nonDerivativeTransaction>", xml, re.I):
        code = _xml(blok, "transactionCode").upper()
        if code not in ("P", "S"):
            continue
        datum = _iso(_xml(blok, "transactionDate")) or rapport
        if not datum:
            continue
        try:
            aantal = int(float(_xml(blok, "transactionShares") or 0))
        except ValueError:
            aantal = 0
        try:
            prijs = float(_xml(blok, "transactionPricePerShare") or 0)
        except ValueError:
            prijs = 0.0
        if aantal <= 0:
            continue
        uit.append({
            "ticker": ticker, "insider_name": naam, "insider_role": rol,
            "trade_type": "BUY" if code == "P" else "SELL",
            "shares": aantal, "price_per_share": round(prijs, 4) if prijs > 0 else None,
            "total_value": round(aantal * prijs, 2), "trade_date": datum,
            "filing_url": filing_url,
        })
    return _samenvoegen(uit)


def _samenvoegen(rijen: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Eén rij per (ticker, insider, datum, richting): dat is de unieke sleutel
    van de tabel. Meerdere deeltransacties op één dag tellen we op."""
    per: dict[tuple, dict[str, Any]] = {}
    for r in rijen:
        k = (r["ticker"], r["insider_name"], r["trade_date"], r["trade_type"])
        if k not in per:
            per[k] = dict(r)
            continue
        a = per[k]
        a["shares"] = (a.get("shares") or 0) + (r.get("shares") or 0)
        a["total_value"] = round((a.get("total_value") or 0) + (r.get("total_value") or 0), 2)
        a["price_per_share"] = round(a["total_value"] / a["shares"], 4) if a["shares"] and a["total_value"] else None
    return list(per.values())


def form4_verwijzingen(efts_json: dict[str, Any]) -> list[str]:
    """XML-URL's uit een EDGAR full-text-zoekresultaat."""
    uit = []
    for hit in (efts_json.get("hits") or {}).get("hits") or []:
        adsh, _, bestand = str(hit.get("_id") or "").partition(":")
        ciks = (hit.get("_source") or {}).get("ciks") or []
        if not adsh or not bestand.lower().endswith(".xml") or not ciks:
            continue
        # De eerste cik is de melder; het archief staat ook onder die map.
        cik = str(ciks[0]).lstrip("0")
        uit.append(f"https://www.sec.gov/Archives/edgar/data/{cik}/{adsh.replace('-', '')}/{bestand}")
    return uit


def haal_insiders(nu: datetime, get: Getter = _http_get, pauze: float = SEC_PAUZE_S) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    start = (nu - timedelta(days=3)).date().isoformat()
    eind = nu.date().isoformat()
    url = ("https://efts.sec.gov/LATEST/search-index?q=&forms=4&dateRange=custom"
           f"&startdt={start}&enddt={eind}&from=0&size=100")
    status, tekst = get(url, SEC_HEADERS)
    if status != 200:
        raise RuntimeError(f"edgar_search_{status}")
    import json
    verwijzingen = form4_verwijzingen(json.loads(tekst))[:INSIDER_MAX_MELDINGEN]
    rijen: list[dict[str, Any]] = []
    fouten = 0
    for xml_url in verwijzingen:
        time.sleep(pauze)
        try:
            s, xml = get(xml_url, SEC_HEADERS)
        except Exception:  # noqa: BLE001 — één melding mag de ronde niet kielen
            fouten += 1
            continue
        if s != 200:
            fouten += 1
            continue
        rijen.extend(form4_rijen(xml, xml_url))
    return _samenvoegen(rijen), {"meldingen": len(verwijzingen), "fouten": fouten}


# ── congress (Alpha Vantage) ───────────────────────────────────────────────

def richting(raw: Any) -> str | None:
    v = str(raw or "").strip().upper()
    if "PURCHASE" in v or v in ("BUY", "P"):
        return "BUY"
    if "SALE" in v or "SELL" in v or v == "S":
        return "SELL"
    return None


def _geld(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(v)))
    except ValueError:
        return None


def bedrag_band(lo: Any, hi: Any) -> str:
    """De band uit de melding, nooit een midden. '' als er geen is: de unieke
    index rekent met coalesce(amount_range, ''), dus '' en null zijn gelijk."""
    a, b = _geld(lo), _geld(hi)
    f = lambda n: f"${round(n):,}"  # noqa: E731
    if a is not None and b is not None:
        return f(a) if a == b else f"{f(a)} - {f(b)}"
    if a is not None:
        return f"{f(a)}+"
    if b is not None:
        return f"up to {f(b)}"
    return ""


def kamer(raw: Any) -> str | None:
    v = str(raw or "").strip().upper()
    return "House" if v.startswith("HOUSE") else "Senate" if v.startswith("SENATE") else None


def congress_rijen(trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    uit = []
    for t in trades:
        wie = str(t.get("politician_canonical") or t.get("politician") or "").strip()
        ticker = str(t.get("symbol") or "").strip().upper()
        datum = _iso(str(t.get("transaction_date") or ""))
        r = richting(t.get("transaction_type"))
        ch = kamer(t.get("chamber"))
        if not (wie and ticker and datum and r and ch):
            continue
        uit.append({
            "politician": wie, "chamber": ch, "party": (t.get("party") or None),
            "ticker": ticker, "asset_description": (t.get("asset_name") or None),
            "trade_type": r, "amount_range": bedrag_band(t.get("amount_min"), t.get("amount_max")),
            "trade_date": datum, "disclosure_date": _iso(str(t.get("notification_date") or "")),
            "source": "alphavantage",
        })
    return uit


def _congress_sleutel(r: dict[str, Any]) -> tuple:
    return (r["politician"], r["ticker"], str(r["trade_date"])[:10], r["trade_type"], r.get("amount_range") or "")


def haal_congress(sleutel: str, get: Getter = _http_get, pauze: float = AV_PAUZE_S) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    import json
    rijen: list[dict[str, Any]] = []
    per: dict[str, Any] = {}
    for i, sym in enumerate(CONGRESS_TICKERS):
        if i:
            time.sleep(pauze)
        status, tekst = get(
            f"https://www.alphavantage.co/query?function=CONGRESS_TRADES&symbol={sym}&apikey={sleutel}", None)
        if status != 200:
            per[sym] = f"http_{status}"
            continue
        try:
            d = json.loads(tekst)
        except ValueError:
            per[sym] = "geen_json"
            continue
        if d.get("Note") or d.get("Information"):
            # Limiet bereikt: 200 met proza. Stoppen, niet doen alsof het leeg was.
            per[sym] = "limiet"
            break
        nieuw = congress_rijen(d.get("trades") or [])
        per[sym] = len(nieuw)
        rijen.extend(nieuw)
    uniek = {_congress_sleutel(r): r for r in rijen}
    return list(uniek.values()), per


# ── schrijven ──────────────────────────────────────────────────────────────

def _log_sync(db: Any, feed: str, bron: str, n: int, fout: str | None, nu: datetime) -> None:
    try:
        rij: dict[str, Any] = {"feed_id": feed, "source": bron, "last_error": fout}
        if fout is None:
            rij.update(last_sync_at=nu.isoformat(), rows_synced=n)
        db.table("intel_sync_log").upsert(rij, on_conflict="feed_id").execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("intel_feeds: sync_log %s niet bijgewerkt (%s)", feed, exc)


def _laatste_sync(db: Any, feed: str) -> datetime | None:
    try:
        rows = db.table("intel_sync_log").select("last_sync_at").eq("feed_id", feed).limit(1).execute().data
    except Exception:  # noqa: BLE001
        return None
    s = (rows or [{}])[0].get("last_sync_at")
    if not s:
        return None
    try:
        t = datetime.fromisoformat(str(s).replace("Z", "+00:00").replace(" ", "T", 1))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def schrijf_congress(db: Any, rijen: list[dict[str, Any]]) -> int:
    """Alleen nieuwe rijen. Upsert kan hier niet: de unieke index staat op
    coalesce(amount_range, ''), en PostgREST kan geen expressie als
    conflictdoel geven."""
    if not rijen:
        return 0
    vroegst = min(str(r["trade_date"]) for r in rijen)
    tickers = sorted({r["ticker"] for r in rijen})
    bestaand: set[tuple] = set()
    vanaf = 0
    while True:
        blok = (db.table("intel_congress_trades")
                .select("politician,ticker,trade_date,trade_type,amount_range")
                .in_("ticker", tickers).gte("trade_date", vroegst)
                .range(vanaf, vanaf + 999).execute().data) or []
        bestaand.update(_congress_sleutel(r) for r in blok)
        if len(blok) < 1000:
            break
        vanaf += 1000
    nieuw = [r for r in rijen if _congress_sleutel(r) not in bestaand]
    for i in range(0, len(nieuw), 500):
        db.table("intel_congress_trades").insert(nieuw[i:i + 500]).execute()
    return len(nieuw)


def schrijf_insiders(db: Any, rijen: list[dict[str, Any]]) -> int:
    if not rijen:
        return 0
    db.table("intel_insider_trades").upsert(
        rijen, on_conflict="ticker,insider_name,trade_date,trade_type", ignore_duplicates=True,
    ).execute()
    return len(rijen)


# ── staande dienst ─────────────────────────────────────────────────────────

def run(db: Any, nu: datetime, get: Getter = _http_get, pauze: float | None = None) -> dict[str, Any]:
    """Elke 2 uur insiders; congress als de laatste ronde ouder is dan 20 uur."""
    uit: dict[str, Any] = {"job": "intel feeds"}
    try:
        rijen, info = haal_insiders(nu, get, SEC_PAUZE_S if pauze is None else pauze)
        n = schrijf_insiders(db, rijen)
        _log_sync(db, "insiderTrades", "sec_edgar", n, None, nu)
        uit["insiders"] = {"rijen": n, **info}
    except Exception as exc:  # noqa: BLE001
        _log_sync(db, "insiderTrades", "sec_edgar", 0, str(exc)[:300], nu)
        uit["insiders"] = {"fout": str(exc)[:200]}

    laatst = _laatste_sync(db, "congressTrades")
    if laatst is not None and nu - laatst < CONGRESS_ELKE:
        uit["congress"] = {"overgeslagen": f"laatste ronde {laatst.isoformat()}"}
        return uit
    sleutel = (os.environ.get("ALPHAVANTAGE_API_KEY") or "").strip()
    if not sleutel:
        _log_sync(db, "congressTrades", "alphavantage", 0, "ALPHAVANTAGE_API_KEY ontbreekt", nu)
        uit["congress"] = {"fout": "ALPHAVANTAGE_API_KEY ontbreekt"}
        return uit
    try:
        rijen, per = haal_congress(sleutel, get, AV_PAUZE_S if pauze is None else pauze)
        if not rijen:
            raise RuntimeError(f"geen bruikbare trades: {per}")
        n = schrijf_congress(db, rijen)
        _log_sync(db, "congressTrades", "alphavantage", n, None, nu)
        uit["congress"] = {"nieuw": n, "kandidaten": len(rijen), "per_ticker": per}
    except Exception as exc:  # noqa: BLE001
        _log_sync(db, "congressTrades", "alphavantage", 0, str(exc)[:300], nu)
        uit["congress"] = {"fout": str(exc)[:200]}
    return uit


def diensten() -> tuple[dict[str, Any], ...]:
    return ({
        "agent": "intel-feeds", "name": "Intel feeds: insiders and congress",
        "job_key": "axe_core:staande-intel-feeds", "cron_expr": "15 */2 * * *",
        "wat": "Fill intel_insider_trades from SEC EDGAR (every 2h) and intel_congress_trades "
               "from Alpha Vantage (daily). Read-only at the source; no orders.",
        "run": run,
    },)


__all__ = ["run", "diensten", "form4_rijen", "congress_rijen", "bedrag_band"]
