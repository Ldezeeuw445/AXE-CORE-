"""Unit tests for Fase 2 stap 1 orchestrator facade — no network, no secrets."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from orchestrator_lus import (  # noqa: E402
    STAPPEN,
    Plugin,
    lijst_plugins,
    registreer_plugin,
    reset_plugins_for_tests,
    status,
)


def test_status_shape():
    reset_plugins_for_tests()
    s = status()
    assert s["fase"] == 2
    assert s["stap"] == 1
    assert tuple(s["lus"]) == STAPPEN
    assert "agent_loop" in s["motors"]
    assert s["guards"]["geen_trades"] is True
    names = {p["naam"] for p in s["plugins"]}
    assert "northsea_crews" in names
    assert "trading_demo" in names
    assert "device_actions" in names


def test_registreer_plugin():
    reset_plugins_for_tests()
    registreer_plugin(Plugin(naam="demo_x", beschrijving="x", devices=["vps"]))
    names = {p["naam"] for p in lijst_plugins()}
    assert "demo_x" in names


if __name__ == "__main__":
    test_status_shape()
    test_registreer_plugin()
    print("ok")
