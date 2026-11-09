"""Keys per app: eerlijke status, nooit een waarde."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import sleutels as sl

NU = datetime(2026, 11, 9, 18, 0, tzinfo=timezone.utc)
GEHEIM = "sk-dit-is-geheim-1234567890abcdef"


def _app(over, naam):
    return next(a for a in over["apps"] if a["app"] == naam)


def _key(over, app, naam):
    return next(k for k in _app(over, app)["keys"] if k["name"] == naam)


def test_geen_waarde_komt_ooit_in_het_overzicht():
    env = {k["naam"]: GEHEIM for k in sl.CATALOGUS}
    over = sl.status([], NU, env)
    assert GEHEIM not in json.dumps(over)


def test_vps_sleutel_aanwezig_ontbreekt_en_bewezen():
    sync = [{"feed_id": "energyFlows", "last_sync_at": (NU - timedelta(hours=1)).isoformat(), "last_error": None}]
    over = sl.status(sync, NU, {"EIA_API_KEY": "x", "GROQ_API_KEY": "y"})
    assert _key(over, "Trading OS", "EIA_API_KEY")["status"] == "works"
    assert _key(over, "AXE Core", "GROQ_API_KEY")["status"] == "present"
    assert _key(over, "AXE Core", "DEEPSEEK_API_KEY")["status"] == "missing"


def test_401_in_de_feed_is_kapot_ook_als_hij_aanwezig_is():
    sync = [{"feed_id": "congressTrades", "last_sync_at": "2026-11-08T10:00:00+00:00",
             "last_error": "alphavantage_401: invalid api key"}]
    over = sl.status(sync, NU, {"ALPHAVANTAGE_API_KEY": "x"})
    k = _key(over, "AXE Companion", "ALPHAVANTAGE_API_KEY")
    assert k["status"] == "broken" and "congressTrades" in k["detail"]


def test_wat_de_vps_niet_ziet_heet_niet_ok():
    over = sl.status([], NU, {})
    k = _key(over, "AXE Companion", "STRIPE_SECRET_KEY")
    assert k["status"] == "unseen" and "not visible" in k["detail"]


def test_vite_sleutels_krijgen_een_waarschuwing():
    over = sl.status([], NU, {})
    assert "browser bundle" in _key(over, "Trading OS", "VITE_POLYGON_API_KEY")["warning"]


def test_elke_app_heeft_sleutels_en_een_manager():
    over = sl.status([], NU, {})
    assert [a["app"] for a in over["apps"]] == list(sl.APPS)
    for a in over["apps"]:
        assert a["keys"] and a["manager"]


def test_manager_meldt_alleen_kapot_of_ontbrekend_met_feed():
    over = sl.status([], NU, {})  # alles ontbreekt op de VPS
    p = sl.problemen(over, "AXE Core")
    assert not any("DEEPSEEK" in r for r in p)  # bewust niet gebruikt: geen melding
    p = sl.problemen(over, "Trading OS")
    assert any(r.startswith("EIA_API_KEY missing") for r in p)


def test_manager_regel_leeg_als_alles_goed_is(monkeypatch):
    monkeypatch.setattr(sl, "lees", lambda db, nu=None: sl.status([], NU, {k["naam"]: "x" for k in sl.CATALOGUS}))
    assert sl.manager_regel(None, "NorthSea") == ""
