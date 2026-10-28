import importlib.util
from pathlib import Path

PAD = Path(__file__).resolve().parents[2] / "scripts" / "failures_report.py"
spec = importlib.util.spec_from_file_location("failures_report", PAD)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)


def test_groepeert_taken_roosters_stoelen():
    uit = mod.bronnen_uit({
        "core_tasks": [{
            "id": "t1", "title": "Planner step", "status": "failed",
            "assignee": "axe-core", "capability": "planner",
            "error": {"message": "The 'gpt-6-astra' model requires a newer version of the Codex CLI"},
            "updated_at": "2026-10-17T12:00:00Z",
        }, {
            "id": "t2", "title": "Desk notice", "status": "failed",
            "assignee": "northsea", "capability": "northsea_desk",
            "error": {"code": "no_handler", "message": "No handler for northsea_desk"},
        }],
        "core_schedules": [{
            "id": "s1", "name": "Orchestrator health check", "last_status": "fail",
            "last_result": "pytest failed", "consecutive_failures": 1,
        }, {
            "id": "s2", "name": "ok job", "last_status": "ok", "consecutive_failures": 0,
        }],
        "core_coding_seats": [{
            "seat_id": "codex", "logged_in": False, "rate_limited": False,
        }],
    })
    bronnen = {r["bron"] for r in uit}
    assert bronnen == {"core_tasks", "core_schedules", "seats"}
    astra = next(r for r in uit if r["id"] == "t1")
    assert astra["actie"] == "retry" and ("omits -m" in astra["regel"] or "Claude CLI" in astra["regel"])
    ns = next(r for r in uit if r["id"] == "t2")
    assert "8040" in ns["regel"]
    assert any(r["actie"] == "reconnect" for r in uit)
    assert all(r["id"] != "s2" for r in uit)
