"""Wereld- en luchtfeeds: echte bronnen, eerlijk gelogd, niets verzonnen."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import intel_wereld as w
import staande_diensten

NU = datetime(2026, 11, 9, 18, 0, tzinfo=timezone.utc)

EONET = {"events": [{"id": "EONET_1", "title": "Wildfire X", "categories": [{"title": "Wildfires"}],
                     "geometry": [{"date": "2026-11-08T00:00:00Z", "coordinates": [10.0, 50.0],
                                   "magnitudeValue": 120, "magnitudeUnit": "acres"}]}]}
USGS = {"features": [{"id": "us7000", "properties": {"mag": 5.2, "place": "off Japan", "time": 1794240000000,
                                                    "title": "M 5.2 - off Japan"},
                      "geometry": {"coordinates": [140.0, 35.0, 10.0]}}]}
MIL = {"ac": [
    {"hex": "ae01", "t": "C17", "flight": "RCH1 ", "alt_baro": 30000, "gs": 450, "lat": 1.0, "lon": 2.0},
    {"hex": "ae02", "t": "B52H", "alt_baro": 35000, "lastPosition": {"lat": 3.0, "lon": 4.0}},
    {"hex": "ae03", "t": "TEX2", "alt_baro": 5000},           # trainer: weg
    {"hex": "ae04", "t": "F16", "alt_baro": "ground"},        # op de grond: weg
]}
EIA = {"response": {"data": [{"period": "2026-10-31", "value": "421000"}]}}


class _Q:
    def __init__(self, db, tabel):
        self.db, self.tabel, self.filters = db, tabel, {}

    def select(self, *_a):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def limit(self, *_a):
        return self

    def insert(self, rijen):
        self.db.geschreven.setdefault(self.tabel, []).extend(rijen)
        return self

    def upsert(self, rij, **_k):
        self.db.sync[rij["feed_id"]] = {**self.db.sync.get(rij["feed_id"], {}), **rij}
        return self

    def execute(self):
        if self.tabel == "intel_sync_log":
            rij = self.db.sync.get(self.filters.get("feed_id"))
            return type("R", (), {"data": [rij] if rij else []})()
        return type("R", (), {"data": []})()


class _Db:
    def __init__(self):
        self.geschreven: dict = {}
        self.sync: dict = {}

    def table(self, t):
        return _Q(self, t)


def _get(url, _h=None):
    if "eonet" in url:
        return 200, json.dumps(EONET)
    if "usgs" in url:
        return 200, json.dumps(USGS)
    if url.endswith("/mil"):
        return 200, json.dumps(MIL)
    if "/sqk/7700" in url:
        return 200, json.dumps({"ac": [{"hex": "4ca1", "squawk": "7700", "flight": "EIN12", "alt_baro": 9000}]})
    if "/sqk/" in url:
        return 200, json.dumps({"ac": []})
    if url.endswith("/ladd"):
        return 200, json.dumps({"ac": [{"hex": "a0b1", "r": "N272BG", "alt_baro": 39000, "gs": 470}]})
    if url.endswith("/pia"):
        return 200, json.dumps({"ac": []})
    if "/registration/N628TS" in url:
        return 200, json.dumps({"ac": [{"hex": "a835af", "flight": "N628TS", "alt_baro": 41000, "gs": 480,
                                        "lat": 30.0, "lon": -97.0}]})
    if "/registration/" in url:
        return 200, json.dumps({"ac": []})
    if "api.eia.gov" in url:
        return 200, json.dumps(EIA)
    return 404, ""


def test_conflict_uit_eonet_en_usgs():
    rijen, bronnen, fouten = w.haal_conflict(_get)
    assert bronnen == ["eonet", "usgs"] and not fouten
    eq = next(r for r in rijen if r["event_type"] == "Earthquake")
    assert eq["sub_event_type"] == "M5.2" and eq["latitude"] == 35.0 and eq["event_date"].startswith("2026-11")
    vuur = next(r for r in rijen if r["event_type"] == "Wildfires")
    assert vuur["sub_event_type"] == "120 acres" and vuur["longitude"] == 10.0


def test_militair_alleen_in_de_lucht_en_bommenwerpers_eerst():
    rijen = w.militaire_rijen(MIL, NU)
    assert [r["hex"] for r in rijen] == ["ae02", "ae01"]
    assert rijen[0]["category"] == "bomber" and rijen[0]["latitude"] == 3.0
    assert rijen[1]["callsign"] == "RCH1"


def test_lucht_vult_drie_feeds_en_nul_noodgevallen_is_ok():
    db = _Db()
    uit = w.run_lucht(db, NU, get=_get, pauze=0)
    assert uit["militair"]["rijen"] == 2
    assert uit["nood"]["rijen"] == 1
    jets = {r["icao24"]: r for r in db.geschreven["intel_corporate_jets"]}
    # N272BG komt via de LADD-bulk, zonder losse vraag.
    assert "a0b1" in jets and "MSFT" in jets["a0b1"]["company"]
    assert all(r["snapshot_time"] == NU.isoformat() for r in jets.values())
    assert db.sync["militaryRadar"]["source"] == "adsb_lol" and db.sync["militaryRadar"]["last_error"] is None
    staande_diensten._geen_verboden(uit)


def test_bron_plat_laat_oude_stand_oud():
    db = _Db()
    uit = w.run_lucht(db, NU, get=lambda u, h=None: (503, ""), pauze=0)
    assert "http_503" in uit["militair"]["fout"]
    assert "last_sync_at" not in db.sync["militaryRadar"]
    assert "intel_military_radar" not in db.geschreven


def test_energie_zonder_key_eerlijk_en_met_key_een_keer_per_dag(monkeypatch):
    monkeypatch.delenv("EIA_API_KEY", raising=False)
    db = _Db()
    uit = w.run_wereld(db, NU, get=_get)
    assert uit["conflict"]["rijen"] == 2
    assert uit["energie"]["fout"].startswith("EIA_API_KEY ontbreekt")
    assert db.sync["energyFlows"]["last_error"].startswith("EIA_API_KEY ontbreekt")

    monkeypatch.setenv("EIA_API_KEY", "test")
    uit = w.run_wereld(db, NU, get=_get)
    assert uit["energie"]["rijen"] == len(w.EIA_SERIES)
    later = w.run_wereld(db, NU + timedelta(hours=3), get=_get)
    assert "overgeslagen" in later["energie"]


def test_geen_verzonnen_marktstroom():
    """marketTide/unusualOptions/darkPool horen hier niet: geen echte bron zonder abonnement."""
    feeds = {d["agent"] for d in w.diensten()}
    assert feeds == {"intel-wereld", "intel-lucht"}
    assert not hasattr(w, "run_market_tide")


def test_diensten_staan_in_de_catalogus():
    for agent in ("intel-wereld", "intel-lucht"):
        assert staande_diensten.catalogus_voor(agent)["job_key"].startswith("axe_core:staande-intel-")


def test_jets_stoppen_bij_429_en_roteren_per_uur():
    gevraagd = []

    def get(url, _h=None):
        if url.endswith("/ladd") or url.endswith("/pia"):
            return 200, json.dumps({"ac": []})
        gevraagd.append(url.rsplit("/", 1)[1])
        if len(gevraagd) == 3:
            return 429, ""
        return 200, json.dumps({"ac": []})
    import pytest
    with pytest.raises(RuntimeError, match="429"):
        w.haal_jets(get, 0, NU.replace(hour=0))
    assert len(gevraagd) == 3
    eerste_uur = gevraagd[0]
    gevraagd.clear()
    w.haal_jets(lambda u, h=None: (200, json.dumps({"ac": []})) if u.endswith(("/ladd", "/pia"))
                else (gevraagd.append(u.rsplit("/", 1)[1]) or (200, json.dumps({"ac": []}))), 0, NU.replace(hour=1))
    assert gevraagd[0] != eerste_uur and len(gevraagd) == w.JETS_PER_RONDE


def test_jets_eerste_staart_via_losse_vraag():
    rijen, info = w.haal_jets(_get, 0, NU.replace(hour=0))
    assert info["in_beeld"] >= 1
    assert any(r["icao24"] == "a835af" and "TSLA" in r["company"] for r in rijen)
