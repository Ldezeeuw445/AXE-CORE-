"""CrewAI draait vanuit de werkplek van de agent, niet alleen de galerijpagina."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import agent_loop
import crew_runner
import task_worker as tw
from test_task_concurrency import NepRepo, LEASE


def test_wingman_roept_crew_aan_voor_de_lus(monkeypatch, tmp_path):
    monkeypatch.setenv("AXE_TASK_WORKSPACES", str(tmp_path))
    gezien: dict = {}

    def nep_crew(task, context=None, conversation=None, specialists=None):
        gezien["specialists"] = list(specialists or [])
        gezien["task"] = task
        return {"status": "ok", "result": "crew deed het"}

    async def nep_loop(request_text, task_id, on_event, approved_commands=(), **kw):
        gezien["request"] = request_text
        gezien["device"] = kw.get("device")
        return {"summary": "klaar", "steps_used": 1}

    monkeypatch.setattr(crew_runner, "run_crew", nep_crew)
    monkeypatch.setattr(agent_loop, "run_agent_loop", nep_loop)

    taak = {
        "id": "taak-crew",
        "capability": "agentic",
        "lease_token": LEASE,
        "assignee": "wingman",
        "payload": {"request": "schrijf een plan", "agent": "wingman", "device": "vps"},
        "goal": "schrijf een plan",
        "title": "plan",
        "checkpoint": {},
        "attempt": 1,
        "max_attempts": 3,
    }
    repo = NepRepo([])
    repo.get = lambda _id, after_sequence=0: {
        "task": taak, "steps": [], "approvals": [], "events": [],
    }
    repo._db = lambda: SimpleNamespace(
        table=lambda *_a: SimpleNamespace(
            select=lambda *_a: SimpleNamespace(
                eq=lambda *_a: SimpleNamespace(
                    limit=lambda *_a: SimpleNamespace(
                        execute=lambda: SimpleNamespace(data=[{"status": "running"}])
                    )
                )
            )
        )
    )
    context = tw.TaskContext(repo, taak, 60)
    asyncio.run(tw.agentic_handler(taak, context))
    assert "axe_core" in gezien["specialists"]
    assert "crew deed het" in gezien["request"]
    assert gezien["device"] == "vps"
