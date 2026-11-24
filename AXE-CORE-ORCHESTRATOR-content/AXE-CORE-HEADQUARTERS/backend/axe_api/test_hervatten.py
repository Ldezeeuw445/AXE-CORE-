"""24 nov live: een uitgestelde taak begon na elk uitstel weer bij stap 1 (14x)."""
import asyncio

import pytest

import agent_loop as al
from provider_router import WaitingForCapacity


def _lus(monkeypatch, tmp_path, antwoorden):
    monkeypatch.setattr(al, "WORKSPACE", str(tmp_path))
    gezien = []
    it = iter(antwoorden)

    async def model(contents, _k):
        gezien.append(len(contents))
        a = next(it)
        if a == "wacht":
            raise WaitingForCapacity("geen stoel", retry_after_s=60)
        return a

    monkeypatch.setattr(al, "_call_model", model)
    events = []

    async def ev(soort, tekst, data=None):
        events.append(tekst)

    return gezien, events, ev


SHELL = {"parts": [{"functionCall": {"name": "run_shell", "args": {"command": "echo stap-een"}}}]}
KLAAR = {"parts": [{"functionCall": {"name": "finish", "args": {
    "summary": "Gedaan.", "verify_command": "echo bewijs-123", "expect_in_output": "bewijs-123"}}}]}


def test_na_uitstel_gaat_de_lus_verder_waar_hij_was(monkeypatch, tmp_path):
    gezien, events, ev = _lus(monkeypatch, tmp_path, [SHELL, "wacht", KLAAR])
    with pytest.raises(WaitingForCapacity):
        asyncio.run(al.run_agent_loop("doe X", "taak-1", ev))
    assert any(f.name.startswith(".axe-hervat.json") for f in tmp_path.iterdir())
    uit = asyncio.run(al.run_agent_loop("doe X", "taak-1", ev))
    assert any("Resuming at step 2" in e for e in events)
    assert gezien[-1] > gezien[0]          # het model kreeg het eerdere werk mee
    assert uit["steps_used"] == 2
    assert not any(f.name.startswith(".axe-hervat.json") for f in tmp_path.iterdir())


def test_ander_doel_hervat_niet(monkeypatch, tmp_path):
    gezien, events, ev = _lus(monkeypatch, tmp_path, ["wacht", KLAAR])
    with pytest.raises(WaitingForCapacity):
        asyncio.run(al.run_agent_loop("doe X", "taak-2", ev))
    asyncio.run(al.run_agent_loop("doe iets anders", "taak-2", ev))
    assert not any("Resuming" in e for e in events)


def test_uitstel_voor_de_eerste_stap_bewaart_niets(monkeypatch, tmp_path):
    gezien, events, ev = _lus(monkeypatch, tmp_path, ["wacht", KLAAR])
    with pytest.raises(WaitingForCapacity):
        asyncio.run(al.run_agent_loop("doe Y", "taak-3", ev))
    assert not any(f.name.startswith(".axe-hervat.json") for f in tmp_path.iterdir())
    asyncio.run(al.run_agent_loop("doe Y", "taak-3", ev))
    assert not any("Resuming" in e for e in events)
