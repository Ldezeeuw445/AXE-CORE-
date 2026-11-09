"""De intel-feeds vullen insiders en congress zelf, zonder Unusual Whales."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import intel_feeds as feeds
import staande_diensten

NU = datetime(2026, 11, 9, 14, 0, tzinfo=timezone.utc)

FORM4 = """<ownershipDocument>
<periodOfReport>2026-11-06</periodOfReport>
<issuer><issuerCik>1</issuerCik><issuerName>Acme</issuerName><issuerTradingSymbol>ACME</issuerTradingSymbol></issuer>
<reportingOwner><reportingOwnerId><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId>
<reportingOwnerRelationship><isDirector>0</isDirector><officerTitle>CFO</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable>
<nonDerivativeTransaction><transactionDate><value>2026-11-05</value></transactionDate>
<transactionCoding><transactionCode>S</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>100</value></transactionShares>
<transactionPricePerShare><value>10.00</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-11-05</value></transactionDate>
<transactionCoding><transactionCode>S</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>300</value></transactionShares>
<transactionPricePerShare><value>12.00</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-11-05</value></transactionDate>
<transactionCoding><transactionCode>M</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>999</value></transactionShares></transactionAmounts></nonDerivativeTransaction>
</nonDerivativeTable></ownershipDocument>"""


def test_form4_alleen_open_markt_en_per_dag_samengevoegd():
    rijen = feeds.form4_rijen(FORM4, "https://sec/x.xml")
    assert len(rijen) == 1  # optie-uitoefening (M) is geen signaal
    r = rijen[0]
    assert (r["ticker"], r["insider_name"], r["insider_role"], r["trade_type"]) == ("ACME", "Doe Jane", "CFO", "SELL")
    assert r["shares"] == 400 and r["total_value"] == 4600.0 and r["price_per_share"] == 11.5
    assert r["trade_date"] == "2026-11-05"


def test_form4_zonder_ticker_valt_weg():
    assert feeds.form4_rijen(FORM4.replace("ACME", "NONE")) == []


def test_verwijzingen_uit_edgar_zoekresultaat():
    efts = {"hits": {"hits": [
        {"_id": "0001-26-000006:wk-form4_1.xml", "_source": {"ciks": ["0000320193", "0000000001"]}},
        {"_id": "0002-26-000001:primary.htm", "_source": {"ciks": ["5"]}},
    ]}}
    assert feeds.form4_verwijzingen(efts) == [
        "https://www.sec.gov/Archives/edgar/data/320193/000126000006/wk-form4_1.xml"
    ]


def test_congress_mapping_raadt_niet():
    rijen = feeds.congress_rijen([
        {"chamber": "HOUSE", "politician_canonical": "Maria Salazar", "party": "R", "symbol": "nvda",
         "asset_name": "NVIDIA", "transaction_type": "Purchase", "transaction_date": "2026-10-01",
         "notification_date": "2026-10-20", "amount_min": "1001", "amount_max": "15000"},
        {"chamber": "HOUSE", "politician": "X", "symbol": "NVDA", "transaction_type": "Exchange",
         "transaction_date": "2026-10-01"},
        {"chamber": "???", "politician": "Y", "symbol": "NVDA", "transaction_type": "Sale",
         "transaction_date": "2026-10-01"},
    ])
    assert len(rijen) == 1
    r = rijen[0]
    assert (r["chamber"], r["ticker"], r["trade_type"], r["amount_range"]) == ("House", "NVDA", "BUY", "$1,001 - $15,000")
    assert feeds.bedrag_band(None, None) == ""


class _Q:
    def __init__(self, db, tabel):
        self.db, self.tabel, self.filters = db, tabel, {}

    def select(self, *_a, **_k):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def in_(self, *_a):
        return self

    def gte(self, *_a):
        return self

    def range(self, *_a):
        return self

    def limit(self, *_a):
        return self

    def insert(self, rijen):
        self.db.geschreven.setdefault(self.tabel, []).extend(rijen)
        return self

    def upsert(self, rijen, **_k):
        rijen = rijen if isinstance(rijen, list) else [rijen]
        if self.tabel == "intel_sync_log":
            for r in rijen:
                self.db.sync[r["feed_id"]] = {**self.db.sync.get(r["feed_id"], {}), **r}
        else:
            self.db.geschreven.setdefault(self.tabel, []).extend(rijen)
        return self

    def execute(self):
        if self.tabel == "intel_sync_log":
            rij = self.db.sync.get(self.filters.get("feed_id"))
            return type("R", (), {"data": [rij] if rij else []})()
        return type("R", (), {"data": list(self.db.bestaand.get(self.tabel, []))})()


class _Db:
    def __init__(self):
        self.geschreven: dict = {}
        self.sync: dict = {}
        self.bestaand: dict = {}

    def table(self, t):
        return _Q(self, t)


def _nep_get(url, _headers=None):
    if "efts.sec.gov" in url:
        return 200, json.dumps({"hits": {"hits": [{"_id": "0001-26-1:f.xml", "_source": {"ciks": ["9"]}}]}})
    if "sec.gov/Archives" in url:
        return 200, FORM4
    if "alphavantage" in url:
        return 200, json.dumps({"trades": [{
            "chamber": "SENATE", "politician": "A B", "symbol": url.split("symbol=")[1].split("&")[0],
            "transaction_type": "Sale (Full)", "transaction_date": "2026-10-02"}]})
    return 404, ""


def test_run_vult_beide_en_logt_sync(monkeypatch):
    monkeypatch.setenv("ALPHAVANTAGE_API_KEY", "test")
    db = _Db()
    db.bestaand["intel_congress_trades"] = [{
        "politician": "A B", "ticker": "NVDA", "trade_date": "2026-10-02", "trade_type": "SELL", "amount_range": None}]
    uit = feeds.run(db, NU, get=_nep_get, pauze=0)
    assert uit["insiders"]["rijen"] == 1
    assert len(db.geschreven["intel_insider_trades"]) == 1
    # NVDA stond er al (null == '' in de unieke index): alleen de andere 9 tickers.
    assert uit["congress"]["nieuw"] == len(feeds.CONGRESS_TICKERS) - 1
    assert db.sync["insiderTrades"]["source"] == "sec_edgar"
    assert db.sync["congressTrades"]["rows_synced"] == len(feeds.CONGRESS_TICKERS) - 1
    staande_diensten._geen_verboden(uit)


def test_congress_een_keer_per_dag(monkeypatch):
    monkeypatch.setenv("ALPHAVANTAGE_API_KEY", "test")
    db = _Db()
    db.sync["congressTrades"] = {"feed_id": "congressTrades", "last_sync_at": (NU - timedelta(hours=3)).isoformat()}
    uit = feeds.run(db, NU, get=_nep_get, pauze=0)
    assert "overgeslagen" in uit["congress"]
    assert "intel_congress_trades" not in db.geschreven


def test_bron_plat_wordt_eerlijk_gelogd(monkeypatch):
    monkeypatch.delenv("ALPHAVANTAGE_API_KEY", raising=False)
    db = _Db()
    uit = feeds.run(db, NU, get=lambda u, h=None: (503, ""), pauze=0)
    assert "edgar_search_503" in uit["insiders"]["fout"]
    assert db.sync["insiderTrades"]["last_error"] == "edgar_search_503"
    assert "last_sync_at" not in db.sync["insiderTrades"]  # oud blijft oud
    assert uit["congress"]["fout"] == "ALPHAVANTAGE_API_KEY ontbreekt"


def test_dienst_staat_in_de_catalogus():
    d = staande_diensten.catalogus_voor("intel-feeds")
    assert d is not None and d["job_key"] == "axe_core:staande-intel-feeds"
