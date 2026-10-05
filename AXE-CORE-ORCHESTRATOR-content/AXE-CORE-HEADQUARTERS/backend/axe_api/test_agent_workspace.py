"""Een agent zonder werkplek mag niet draaien. Crew komt uit de werkplek."""
from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

import agent_loop
import agent_workspace as aw

ROSTER = (Path(__file__).resolve().parents[2] / "src/domain/agents/roster.ts").read_text()
TS_WS = (Path(__file__).resolve().parents[2] / "src/domain/agents/workspace.ts").read_text()


def _ids_uit_het_type() -> set[str]:
    blok = ROSTER.split("export type AxeAgentId =", 1)[1].split(";", 1)[0]
    return set(re.findall(r"'([a-z]+)'", blok))


def test_elke_roster_agent_heeft_een_werkplek():
    ids = _ids_uit_het_type()
    assert ids == set(aw.AGENT_WORKSPACES)
    for agent in ids:
        ws = aw.laad_workspace(agent)
        assert ws["system_prompt"]
        assert "finish" in ws["tools"]


def test_lus_weiger_zonder_werkplek(monkeypatch):
    async def stil(*_a):
        pass

    async def model(_c, _k):
        return {"parts": [{"text": "no"}]}

    monkeypatch.setattr(agent_loop, "_call_model", model)
    with pytest.raises(aw.WorkspaceOntbreekt):
        asyncio.run(agent_loop.run_agent_loop("doe iets", "t1", stil, agent="ghost"))


def test_lus_laadt_de_werkplek_in_de_prompt(monkeypatch):
    gezien = {}

    async def stil(*_a):
        pass

    async def model(contents, _k):
        gezien["prompt"] = agent_loop.systeem_prompt()
        return {"parts": [{"functionCall": {
            "name": "run_shell", "args": {"command": "systemctl restart axe-core-api"},
        }}]}

    monkeypatch.setattr(agent_loop, "_call_model", model)
    monkeypatch.setattr(agent_loop, "_shell", lambda *a, **k: {"exit_code": 0, "stdout": "", "stderr": ""})
    with pytest.raises(agent_loop.ApprovalRequired):
        asyncio.run(agent_loop.run_agent_loop("doe iets", "t1", stil, agent="wingman"))
    assert "Wingman" in gezien["prompt"]
    assert "CrewAI" in gezien["prompt"] or "crew" in gezien["prompt"].lower()


def test_crew_staat_op_de_werkplek_niet_alleen_in_de_galerij():
    wingman = aw.laad_workspace("wingman")
    assert "axe_core" in wingman["crew"]
    assert "run_crew" in wingman["tools"]
    northsea = aw.laad_workspace("northsea")
    assert northsea["crew"] == []
    # De TS-bron noemt dezelfde crews, anders drijven de twee lijsten uit elkaar.
    assert "dollar_bill" in TS_WS
    assert "wags" in TS_WS
