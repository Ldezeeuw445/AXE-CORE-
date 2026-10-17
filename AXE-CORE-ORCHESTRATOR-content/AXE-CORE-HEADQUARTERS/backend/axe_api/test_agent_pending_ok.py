"""Home krijgt pendingApproval (camel) én de lijst, gekoppeld op taak/assignee."""
from __future__ import annotations

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from agent_activiteit import koppel_pending, pending_vraag  # noqa: E402


def test_pending_vraag_heeft_snake_en_task_id():
    rij = {
        "id": "ok-1",
        "task_id": "t-1",
        "kind": "leave_plan",
        "title": "Send the intro",
        "detail": "Outside the standing plan.",
        "requested_by": "northsea",
    }
    uit = pending_vraag(rij, None)
    assert uit["id"] == "ok-1"
    assert uit["task_id"] == "t-1"
    assert uit["wat"] == "Send the intro"
    assert uit["waarom"] == "Outside the standing plan."


def test_koppel_pending_zet_camelcase_voor_de_ui():
    status = {"agent": "northsea", "task": {"id": "t-1"}}
    payload = pending_vraag({
        "id": "ok-1", "task_id": "t-1", "title": "A step is waiting for Luka's approval.",
        "detail": "Energy market snapshot",
    })
    koppel_pending("northsea", status, {"t-1": payload}, {"northsea": [payload]})
    assert status["pending_approval"]["id"] == "ok-1"
    assert status["pendingApproval"]["id"] == "ok-1"
    assert status["pendingApprovals"][0]["wat"].startswith("A step")


def test_koppel_pending_vindt_vraag_via_assignee_als_huidige_taak_niet_matcht():
    status = {"agent": "northsea", "task": None}
    payload = pending_vraag({"id": "ok-2", "task_id": "t-9", "title": "Approve the deal"})
    koppel_pending("northsea", status, {}, {"northsea": [payload]})
    assert status["pendingApproval"]["id"] == "ok-2"


def test_koppel_pending_zwijgt_zonder_rijen():
    status = {"agent": "trading"}
    koppel_pending("trading", status, {}, {})
    assert "pendingApproval" not in status
