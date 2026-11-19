"""Eén tool-register dat echt werkt (19 nov 2026, punt 6)."""
from __future__ import annotations

import asyncio

import pytest

import agent_loop
import agent_register
import tool_register as tr
from agent_workspace import AGENT_WORKSPACES


def test_elke_tool_staat_volledig_in_het_register_en_niets_hangt_los():
    assert tr.gaten() == []
    for t in tr.register():
        assert t["wat"] and t["output"] and t["rechten"] and t["fouten"], t["name"]
        assert t["wie"], f"{t['name']}: niemand mag hem"
        assert set(t["verplicht"]) <= set(t["input"]), t["name"]


@pytest.mark.parametrize("agent", sorted(AGENT_WORKSPACES))
def test_welke_tools_heeft_agent_x_is_overal_hetzelfde(agent):
    """Wat de lus het model geeft == tool-register == agent-register (core_agents)."""
    van_register = set(tr.tools_van(agent))
    wie = {t["name"] for t in tr.register() if agent in t["wie"]}
    fiche = agent_loop._HUIDIGE_AGENT_WS.set(agent_loop.laad_workspace(agent))
    try:
        in_de_lus = {d["name"] for d in agent_loop._tool_decls()}
    finally:
        agent_loop._HUIDIGE_AGENT_WS.reset(fiche)
    in_core_agents = set(next(r for r in agent_register.rijen() if r["name"] == agent)["toolset"])
    assert van_register == wie == in_de_lus == in_core_agents
    assert all(tr.mag(agent, t) for t in van_register)


def test_northsea_mag_niet_schrijven_en_axe_wel():
    assert not tr.mag("northseamgr", "write_file") and tr.mag("northseamgr", "northsea_read")
    assert tr.mag("axe", "write_file") and not tr.mag("ghost", "finish")


def test_de_lus_weigert_een_tool_buiten_de_werkplek(monkeypatch):
    """Model roept write_file aan als NorthSea-manager: geweigerd, niet uitgevoerd."""
    geschreven, beurten, events = [], [], []

    async def ev(soort, tekst, _d=None):
        events.append(tekst)

    async def model(contents, _k):
        beurten.append(contents[-1])
        if len(beurten) == 1:
            return {"parts": [{"functionCall": {"name": "write_file", "args": {"path": "/tmp/x", "content": "hoi"}}}]}
        return {"parts": [{"functionCall": {"name": "finish", "args": {
            "summary": "klaar", "verify_command": "echo ok", "expect_in_output": "ok"}}}]}

    monkeypatch.setattr(agent_loop, "_call_model", model)
    monkeypatch.setattr(agent_loop, "_write", lambda *a, **k: geschreven.append(a) or {"bytes_written": 3})
    monkeypatch.setattr(agent_loop, "_shell", lambda *a, **k: {"exit_code": 0, "stdout": "ok", "stderr": ""})
    uit = asyncio.run(agent_loop.run_agent_loop("schrijf iets", "t1", ev, agent="northseamgr"))
    assert geschreven == []
    antwoord = beurten[1]["parts"][0]["functionResponse"]["response"]["error"]
    assert "'write_file' is not one of your tools" in antwoord and "northsea_read" in antwoord
    assert any("refused 'write_file'" in e for e in events)
    assert any(s.get("refused") == "not_in_workspace" for s in uit["transcript"])
