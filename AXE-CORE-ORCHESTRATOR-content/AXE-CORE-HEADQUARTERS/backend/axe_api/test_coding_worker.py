"""Coding-worker als interne medewerker (audit 22 nov): klaar = complete oplevering + review voor Luka."""
from __future__ import annotations

import device_actions as da
import manager_werk as mw
import taak_verslag as tv
from test_manager_betrouwbaar import DB

MAC = ("## Samenvatting\nAlerts-tab toont nu de laatste fout.\n## Tests\nnpx vitest run alerts: 4 passed\n"
       "## Risico's\ngeen\n\n## Oplevering (Mac)\nbranch: axe/2026-11-22-ab12\nworktree: /x\n"
       "commits:\nabc fix alerts\ndiff:\n 2 files changed")


def test_complete_oplevering_mag_klaar():
    op = da.oplevering(MAC)
    assert op["compleet"] and da.oplevering_weigering(op) is None
    assert da.oplevering_weigering(None) is None   # geen coding-run: regel geldt niet


def test_onvolledige_oplevering_weigert_klaar():
    op = da.oplevering("## Samenvatting\niets\n\n## Oplevering (Mac)\nbranch: axe/x\nniet gecommit:\n M a.ts\ndiff:\n")
    reden = da.oplevering_weigering(op)
    assert reden and "Tests" in reden and "gecommit" in reden and "NIET klaar" in reden


def test_review_stap_een_keer_voor_luka():
    db = DB()
    taak = {"title": "AXE Manager: Fix de alerts-tab", "requested_by": "axemanager",
            "metadata": {"manager": True, "agent": "axemanager"}}
    res = {"summary": "klaar", "oplevering": {**da.oplevering(MAC), "device": "mini-van-luka"}}
    assert tv.review_stap(db, taak, "completed", res)
    assert not tv.review_stap(db, taak, "completed", res)
    stap = db.rijen["core_tasks"][0]
    assert stap["assignee"] == "luka" and stap["title"].startswith("Review axe/2026-11-22-ab12")
    assert "4 passed" in stap["goal"]
    assert not tv.review_stap(DB(), taak, "failed", res)
    assert not tv.review_stap(DB(), taak, "completed", {"oplevering": {"compleet": False, "branch": "b"}})


def test_manager_meldt_wat_tests_risico_branch():
    t = {"title": "AXE Manager: Fix de alerts-tab", "status": "completed",
         "result": {"summary": "x", "oplevering": {**da.oplevering(MAC), "device": "mini-van-luka"}}}
    tekst = mw.meld_tekst(t)
    assert "Tests: npx vitest run alerts: 4 passed" in tekst and "Branch: axe/2026-11-22-ab12 op mini-van-luka" in tekst


def test_lus_weigert_klaar_tot_de_oplevering_compleet_is(monkeypatch):
    import asyncio
    import agent_loop

    leveringen = iter(["## Samenvatting\nhalf\n\n## Oplevering (Mac)\nbranch: axe/x\ndiff:\n", MAC])
    monkeypatch.setattr(da, "approval_key", lambda *a: None)
    monkeypatch.setattr(da, "run_on_device", lambda device, tool, args, *a, **k: {
        "device": device, "tool": tool, "ok": True, "oplevering": da.oplevering(next(leveringen))})
    stappen = iter([
        {"name": "run_on_device", "args": {"device": "mini", "tool": "claude_code.run", "args": {"prompt": "fix"}}},
        {"name": "finish", "args": {"summary": "klaar", "verify_command": "git -C repo log -1 --oneline", "expect_in_output": "ok"}},
        {"name": "run_on_device", "args": {"device": "mini", "tool": "claude_code.run", "args": {"prompt": "kleiner"}}},
        {"name": "finish", "args": {"summary": "klaar", "verify_command": "git -C repo log -1 --oneline", "expect_in_output": "ok"}},
    ])
    gezien: list = []

    async def model(contents, key):
        gezien.append(contents[-1])
        return {"parts": [{"functionCall": next(stappen)}]}

    async def ev(*a):
        pass

    monkeypatch.setattr(agent_loop, "_call_model", model)
    monkeypatch.setattr(agent_loop, "_shell", lambda cmd, cwd=None: {"exit_code": 0, "stdout": "ok", "stderr": ""})
    uit = asyncio.run(agent_loop.run_agent_loop("fix de alerts-tab", "t", ev))
    assert uit["oplevering"]["compleet"] and uit["oplevering"]["branch"] == "axe/2026-11-22-ab12"
    geweigerd = [p for c in gezien for p in c.get("parts", []) if p.get("functionResponse", {}).get("name") == "finish"]
    assert geweigerd and "NIET klaar" in geweigerd[0]["functionResponse"]["response"]["reason"]
