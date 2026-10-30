"""Unit tests Fase 2 stap 1–2 orchestrator facade — no network, no secrets."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from orchestrator_lus import (  # noqa: E402
    STAPPEN,
    Plugin,
    beoordeel_voorstel,
    lijst_plugins,
    registreer_plugin,
    reset_plugins_for_tests,
    status,
)


def test_status_shape():
    reset_plugins_for_tests()
    s = status()
    assert s["fase"] == 2
    assert s["stap"] == 2
    assert tuple(s["lus"]) == STAPPEN
    assert "agent_loop" in s["motors"]
    assert s["entry"]["access"] == "beoordeel_voorstel"
    assert s["entry"]["execute"] == "voer_taak_uit"
    assert s["guards"]["geen_trades"] is True
    names = {p["naam"] for p in s["plugins"]}
    assert "northsea_crews" in names


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


if __name__ == "__main__":
    test_status_shape()
    test_registreer_plugin()
    test_beoordeel_routine_auto()
    test_beoordeel_payment_asks()
    print("ok")
