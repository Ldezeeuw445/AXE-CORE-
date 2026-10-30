"""Unit tests Fase 2 stap 1–6 orchestrator facade — no network, no secrets."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from orchestrator_lus import (  # noqa: E402
    STAPPEN,
    Plugin,
    beoordeel_voorstel,
    lijst_plugins,
    provider_fallback,
    registreer_plugin,
    reset_plugins_for_tests,
    roep_plugin,
    status,
)


def test_status_shape():
    reset_plugins_for_tests()
    s = status()
    assert s["fase"] == 2
    assert s["stap"] == 6
    assert tuple(s["lus"]) == STAPPEN
    assert "agent_loop" in s["motors"]
    assert s["entry"]["access"] == "beoordeel_voorstel"
    assert s["entry"]["execute"] == "voer_taak_uit"
    assert s["entry"]["provider"] == "provider_fallback"
    assert s["guards"]["geen_trades"] is True
    assert s["guards"]["trading_paper_only"] is True
    assert s["guards"]["northsea_geen_auto_send"] is True
    names = {p["naam"] for p in s["plugins"]}
    assert names >= {"northsea_crews", "trading_demo", "device_actions"}
    assert all(p["heeft_handler"] for p in s["plugins"])
    pf = s["provider_fallback"]
    assert pf["keten"] and pf["primair"]
    assert "fallback" in pf


def test_provider_fallback_gratis():
    reset_plugins_for_tests()
    gratis = provider_fallback("axe", alleen_gratis=True)
    assert gratis["alleen_gratis"] is True
    assert gratis["mag_stoel"] is False
    assert set(gratis["keten"]) <= {"groq", "cerebras", "ollama"}
    vol = provider_fallback("axe", alleen_gratis=False)
    assert len(vol["keten"]) >= len(gratis["keten"])


def test_registreer_plugin():
    reset_plugins_for_tests()
    registreer_plugin(Plugin(naam="demo_x", beschrijving="x", devices=["vps"]))
    assert "demo_x" in {p["naam"] for p in lijst_plugins()}


def test_beoordeel_routine_auto():
    reset_plugins_for_tests()
    r = beoordeel_voorstel({"title": "orchestrator health check", "kind": "routine"})
    assert r["auto"] is True
    assert r["volgende"] == "execute"
    assert r["vraag_luka"] is False


def test_beoordeel_payment_asks():
    reset_plugins_for_tests()
    r = beoordeel_voorstel({"title": "betaal leverancier", "detail": "payment wire money"})
    assert r["vraag_luka"] is True
    assert r["volgende"] == "approval"


def test_plugin_device_actions():
    reset_plugins_for_tests()
    s = roep_plugin("device_actions", {"actie": "status"})
    assert s["ok"] is True
    assert "system.info" in s["tools"]
    r = roep_plugin("device_actions", {"actie": "resolve", "device": "imac"})
    assert r["device"] == "main-imac-luka"
    dry = roep_plugin(
        "device_actions",
        {"actie": "run", "dry_run": True, "device": "imac", "tool": "system.info"},
    )
    assert dry["dry_run"] is True and dry["would_queue"] is True
    refuse = roep_plugin(
        "device_actions",
        {"actie": "run", "device": "imac", "tool": "files.write"},
    )
    assert refuse["ok"] is False


def test_plugin_northsea_plan_only():
    reset_plugins_for_tests()
    s = roep_plugin("northsea_crews", {"actie": "status"})
    assert s["guards"]["geen_auto_send"] is True
    plan = roep_plugin(
        "northsea_crews",
        {"actie": "plan", "crew": "research", "task": "scan copper basis", "specialists": ["intel"]},
    )
    assert plan["executed"] is False and plan["auto_send"] is False
    assert plan["specialists"] == ["intel"]
    run = roep_plugin("northsea_crews", {"actie": "run", "task": "x"})
    assert run["ok"] is False


def test_plugin_trading_paper_only():
    reset_plugins_for_tests()
    s = roep_plugin("trading_demo", {"actie": "status"})
    assert s["paper_only"] is True
    assert s["demo"]["environment"] == "paper"
    sim = roep_plugin(
        "trading_demo",
        {"actie": "simulate", "symbol": "EURUSD", "side": "buy", "size": 0.01},
    )
    assert sim["fill"]["environment"] == "paper"
    assert sim["executed"] is False
    bad = roep_plugin("trading_demo", {"actie": "order", "symbol": "EURUSD"})
    assert bad["ok"] is False and bad.get("paper_only") is True


def test_unknown_plugin():
    reset_plugins_for_tests()
    r = roep_plugin("nope", {})
    assert r["ok"] is False


if __name__ == "__main__":
    test_status_shape()
    test_provider_fallback_gratis()
    test_registreer_plugin()
    test_beoordeel_routine_auto()
    test_beoordeel_payment_asks()
    test_plugin_device_actions()
    test_plugin_northsea_plan_only()
    test_plugin_trading_paper_only()
    test_unknown_plugin()
    print("ok")
