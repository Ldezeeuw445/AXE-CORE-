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
    assert _key(over, "AXE Core", "CRON_SECRET")["status"] == "missing"
    assert _key(over, "AXE Core", "DEEPSEEK_API_KEY")["status"] == "unused"
    assert _key(over, "AXE Core", "PERPLEXITY_API_KEY")["status"] == "optional"


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
    assert not any("AISSTREAM" in r for r in p)  # optioneel: geen melding


def test_manager_regel_leeg_als_alles_goed_is(monkeypatch):
    monkeypatch.setattr(sl, "lees", lambda db, nu=None: sl.status([], NU, {k["naam"]: "x" for k in sl.CATALOGUS}))
    assert sl.manager_regel(None, "NorthSea") == ""


def test_openhands_is_geen_ontbrekende_sleutel():
    k = _key(sl.status([], NU, {}), "AXE Core", "OPENHANDS_API_KEY")
    assert k["status"] == "unused" and k["provider"] == "openhands"


def test_metaapi_bewezen_door_echte_trades():
    over = sl.status([], NU, {}, tabel_bewijs={"broker_trades": (NU - timedelta(hours=8)).isoformat()})
    k = _key(over, "AXE Companion", "METAAPI_TOKEN")
    assert k["status"] == "works" and "broker_trades" in k["detail"]


def test_tweede_vps_dax_logins():
    dax = [{"id": "dax-developer-01", "owner_agent": "developer", "status": "running",
            "stats": {"engines": {"claude_logged_in": False, "codex_logged_in": False}}},
           {"id": "dax-trading-01", "owner_agent": "trading", "status": "error", "last_error": "heartbeat exit 1"}]
    rijen = {k["name"]: k for k in _app(sl.status([], NU, {}, dax=dax), "AXE Core")["keys"]}
    assert rijen["dax-developer-01 login"]["status"] == "missing"
    assert rijen["dax-trading-01 login"]["status"] == "broken"
    assert "STRATO" in rijen["dax-developer-01 login"]["where"]


def test_instellingen_sleutels_zijn_zichtbaar_zonder_waarde():
    over = sl.status([], NU, {}, instellingen={"exa": True})
    assert _key(over, "AXE Core", "EXA_API_KEY")["status"] == "present"
    assert _key(over, "AXE Core", "ELEVENLABS_API_KEY")["status"] == "optional"
    zonder = sl.status([], NU, {})
    assert _key(zonder, "AXE Core", "EXA_API_KEY")["status"] == "unseen"


def test_instellingen_lezen_geeft_alleen_ja_nee():
    class Q:
        def __init__(self, data): self.data = data
        def select(self, *_): return self
        def eq(self, *_): return self
        def limit(self, *_): return self
        def execute(self): return self
    class DB:
        def table(self, _): return Q([{"value": {"exa": {"key": GEHEIM}, "groq": {"key": ""}, "x": "raar"}}])
    uit = sl._instellingen(DB())
    assert uit == {"exa": True} and GEHEIM not in json.dumps(uit)


def test_vercel_namen_maken_companion_en_trading_os_zichtbaar():
    vercel = {"axe-companion-os": frozenset({"STRIPE_SECRET_KEY", "COINGECKO_DEMO_API_KEY"}),
              "trading-os": frozenset({"POLYGON_API_KEY"})}
    over = sl.status([], NU, {}, vercel=vercel)
    assert _key(over, "AXE Companion", "STRIPE_SECRET_KEY")["status"] == "present"
    cg = _key(over, "AXE Companion", "COINGECKO_API_KEY")
    assert cg["status"] == "present" and "COINGECKO_DEMO_API_KEY" in cg["detail"]
    # verplicht en niet in Vercel: echt "missing", geen "unseen"
    assert _key(over, "AXE Companion", "SUPABASE_SERVICE_ROLE_KEY")["status"] == "missing"
    assert _key(over, "AXE Companion", "ALPACA_API_KEY_ID")["status"] == "optional"
    pg = _key(over, "Trading OS", "VITE_POLYGON_API_KEY")
    assert pg["status"] == "present" and "no VITE_ copy" in pg["detail"]
    assert _key(over, "Trading OS", "VITE_FRED_API_KEY")["status"] == "unused"
    # edge blijft eerlijk onzichtbaar
    assert _key(over, "Trading OS", "INTEL_CRON_SECRET")["status"] == "unseen"


def test_vercel_lezen_bewaart_alleen_namen(monkeypatch):
    import io
    import urllib.request

    body = json.dumps({"envs": [{"key": "STRIPE_SECRET_KEY", "value": GEHEIM, "target": ["production"]},
                                {"key": "ALLEEN_PREVIEW", "value": GEHEIM, "target": ["preview"]}]}).encode()

    class Antw(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *_): return False

    gevraagd = []
    monkeypatch.setenv("VERCEL_TOKEN", "t")
    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout: gevraagd.append(req.full_url) or Antw(body))
    sl._VERCEL_CACHE.update(t=None, namen=None)
    uit = sl._vercel_namen(NU)
    assert uit["axe-companion-os"] == frozenset({"STRIPE_SECRET_KEY"})
    assert GEHEIM not in repr(uit)
    assert all("decrypt" not in u for u in gevraagd)
    sl._VERCEL_CACHE.update(t=None, namen=None)
