"""25 nov live: een goedgekeurde `systemctl stop axe-task-worker` zette alle taken 50 min stil."""
import asyncio

import pytest

import agent_loop as al


@pytest.mark.parametrize("cmd", [
    "systemctl stop axe-task-worker",
    "sudo systemctl restart axe-task-worker",
    "systemctl disable --now axe-core-api",
    "service axe-task-worker stop",
    "pkill -f task_worker.py",
])
def test_eigen_worker_of_api_stoppen_wordt_geweigerd(cmd):
    assert al._refuse(cmd)


@pytest.mark.parametrize("cmd", [
    "systemctl status axe-task-worker --no-pager",
    "systemctl is-active axe-task-worker",
    "sudo systemctl restart northsea-mcp",
    "journalctl -u axe-task-worker --since '1 hour ago'",
])
def test_kijken_en_andere_diensten_blijven_kunnen(cmd):
    assert al._refuse(cmd) is None


def test_geen_ok_vraag_voor_een_geweigerd_commando(monkeypatch, tmp_path):
    monkeypatch.setattr(al, "WORKSPACE", str(tmp_path))
    antwoorden = iter([
        {"parts": [{"functionCall": {"name": "run_shell", "args": {"command": "systemctl stop axe-task-worker"}}}]},
        {"parts": [{"functionCall": {"name": "finish", "args": {
            "summary": "Niet gestopt: dat mag niet.", "verify_command": "echo b-1", "expect_in_output": "b-1"}}}]},
    ])

    async def model(contents, _k):
        return next(antwoorden)
    monkeypatch.setattr(al, "_call_model", model)
    events = []

    async def ev(soort, tekst, data=None):
        events.append((soort, tekst))
    asyncio.run(al.run_agent_loop("stop de lopende taak", "taak-x", ev))
    assert not any(s == "approval.requested" for s, _ in events)
    assert any("refused" in t for _, t in events)
