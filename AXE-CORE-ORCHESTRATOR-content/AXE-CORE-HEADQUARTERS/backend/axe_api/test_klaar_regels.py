"""Wanneer mag een taak 'klaar' zeggen (klaar_regels.py) -- de echte taak van 22 nov als test."""
from __future__ import annotations

import asyncio

import agent_loop
import device_actions as da
import klaar_regels as kr
from task_worker import blokkade_uit_rapport

ECHT = ("De gevraagde bestanden en mappen voor gedeeld_log.ritme([]) zijn niet aanwezig in de huidige werkmap "
        "of elders op de VPS. Ik kan de test niet toevoegen zonder deze bestanden.")


def test_falen_toegeven_wordt_blocked():
    assert kr.geeft_falen_toe(ECHT)
    assert kr.geeft_falen_toe("Unable to reach the Mac.")
    assert not kr.geeft_falen_toe("Test toegevoegd; 3 passed op branch axe/x.")
    assert not kr.geeft_falen_toe("MILESTONE: blocked REASON: kan niet")
    oordeel = blokkade_uit_rapport({"summary": kr.als_blokkade(ECHT)})
    assert oordeel and oordeel["code"] == "agent_blocked"


def test_leeg_bewijs():
    assert kr.leeg_bewijs("ls -l", "total")
    assert kr.leeg_bewijs("pwd", "/")
    assert kr.leeg_bewijs("echo ok", "ok")
    assert not kr.leeg_bewijs("ls backend/axe_api/test_gedeeld_log.py", "test_gedeeld_log.py")
    assert not kr.leeg_bewijs('echo "iMac frontmost: Safari"', "Safari")


def _draai(monkeypatch, stappen, device_uit):
    monkeypatch.setattr(da, "approval_key", lambda *a: None)
    monkeypatch.setattr(da, "run_on_device", lambda *a, **k: device_uit)
    monkeypatch.setattr(agent_loop, "_shell", lambda cmd, cwd=None: {"exit_code": 0, "stdout": "total 0", "stderr": ""})
    it = iter(stappen)
    antwoorden: list = []

    async def model(contents, key):
        antwoorden.append(contents[-1])
        return {"parts": [{"functionCall": next(it)}]}

    async def ev(*a):
        pass

    monkeypatch.setattr(agent_loop, "_call_model", model)
    return asyncio.run(agent_loop.run_agent_loop("voeg een test toe", "t", ev)), antwoorden


def test_de_echte_taak_van_22_nov_eindigt_niet_meer_als_klaar(monkeypatch):
    stappen = [
        {"name": "run_on_device", "args": {"device": "mini", "tool": "claude_code.run", "args": {"prompt": "x"}}},
        {"name": "finish", "args": {"summary": "Klaar.", "verify_command": "ls -l", "expect_in_output": "total"}},
        {"name": "finish", "args": {"summary": "Klaar.", "verify_command": "ls backend", "expect_in_output": "total"}},
        {"name": "finish", "args": {"summary": ECHT, "verify_command": "ls -l", "expect_in_output": "total"}},
    ]
    uit, antw = _draai(monkeypatch, stappen, {"error": "This is a read-only task."})
    redenen = [p["functionResponse"]["response"].get("reason", "") for c in antw for p in c.get("parts", [])
               if p.get("functionResponse", {}).get("name") == "finish"]
    assert "proves nothing" in redenen[0]
    assert "no delivery" in redenen[1]
    assert uit["summary"].startswith("MILESTONE: blocked")
    assert blokkade_uit_rapport(uit)["code"] == "agent_blocked"


def test_managertaak_mag_schrijven():
    from test_manager_betrouwbaar import DB, NU
    import manager_werk as mw
    db = DB()
    mw.maak_taak(db, "axemanager", "Voeg een test toe", NU, "b")
    assert db.rijen["core_tasks"][0]["execution_mode"] == "execute"


def test_kon_geen_x_vinden_om_het_te_doen_is_falen_maar_geen_fouten_vinden_niet():
    import klaar_regels as k
    assert k.geeft_falen_toe("Ik kon in de huidige workspace geen intel-proxy feedconfiguratie vinden "
                             "om een overzicht te maken.")
    assert not k.geeft_falen_toe("De logs zijn gecontroleerd; ik kon geen fouten over git vinden.")
