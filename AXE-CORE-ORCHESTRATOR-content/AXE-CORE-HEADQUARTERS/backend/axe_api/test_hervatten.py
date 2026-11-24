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


TEKST = {"parts": [{"text": "De fix staat al live; niets te wijzigen."}]}


def test_rem_telt_door_over_een_hervatting(monkeypatch, tmp_path):
    """24 nov live: stap 4..10 elk 'no action', omdat de teller na elk uitstel op 0 begon."""
    import acceptatie
    monkeypatch.setattr(acceptatie, "na_meting_voor_taak", lambda db, tid: None)
    gezien, events, ev = _lus(monkeypatch, tmp_path, [SHELL, TEKST, TEKST, "wacht", TEKST, KLAAR])
    with pytest.raises(WaitingForCapacity):
        asyncio.run(al.run_agent_loop("doe Z", "taak-4", ev))
    with pytest.raises(RuntimeError, match="without taking an action"):
        asyncio.run(al.run_agent_loop("doe Z", "taak-4", ev))


def test_gehaalde_feed_acceptatie_maakt_tekst_tot_klaar(monkeypatch, tmp_path):
    import acceptatie
    oordeel = {"soort": "feed", "gehaald": True, "regel": "feed corporateJets: ... = gehaald", "na": {}}
    monkeypatch.setattr(acceptatie, "na_meting_voor_taak", lambda db, tid: oordeel)
    gezien, events, ev = _lus(monkeypatch, tmp_path, [TEKST])
    uit = asyncio.run(al.run_agent_loop("repareer feed corporateJets", "taak-5", ev))
    assert uit["acceptatie"]["gehaald"] is True
    assert uit["verification"]["checks"][0]["name"] == "acceptatie"


def test_niet_gehaalde_acceptatie_blijft_geen_klaar(monkeypatch, tmp_path):
    import acceptatie
    oordeel = {"soort": "feed", "gehaald": False, "regel": "NIET gehaald", "na": {}}
    monkeypatch.setattr(acceptatie, "na_meting_voor_taak", lambda db, tid: oordeel)
    gezien, events, ev = _lus(monkeypatch, tmp_path, [TEKST, TEKST, TEKST])
    with pytest.raises(RuntimeError, match="without taking an action"):
        asyncio.run(al.run_agent_loop("repareer feed corporateJets", "taak-6", ev))
    assert any("no action taken" in e for e in events)
