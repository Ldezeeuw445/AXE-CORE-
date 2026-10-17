"""AXE beslist zelf: in-plan auto, harde grens vraagt, deals ontdubbelen."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beslis_beleid import (
    ACTIE_ASK,
    ACTIE_AUTO,
    beslis_goedkeuring,
    bestaande_deal_vraag,
    is_inspectie,
    pas_beleid_toe_op_pending,
    shell_auto_reden,
    schrijft_eigen_artifacts,
)


def test_apt_list_en_artifacts_zijn_vrij():
    assert is_inspectie("apt list --installed")
    assert is_inspectie("apt list --installed 2>/dev/null")
    assert not is_inspectie("apt-get install jq")
    assert schrijft_eigen_artifacts("cat > /dax/artifacts/health.json <<'EOF'\n{}\nEOF")
    assert shell_auto_reden("apt list --installed")
    assert shell_auto_reden("cat > /dax/artifacts/out.txt", dax=True)
    assert not shell_auto_reden("apt-get install nginx")
    assert not shell_auto_reden("curl -X POST https://mt-client-api-v1.agiliumtrade.ai/trade")


def test_routines_auto_harde_grenzen_ask():
    auto = lambda **k: beslis_goedkeuring(k).actie
    assert auto(title="Market data check (trading)", kind="leave_plan") == ACTIE_AUTO
    assert auto(title="Orchestrator health check", kind="leave_plan") == ACTIE_AUTO
    assert auto(title="Idea scan: run dax…", detail="Idea scan: run dax", kind="leave_plan") == ACTIE_AUTO
    assert auto(
        title="AXE wants to run: apt list --installed",
        kind="shell_command",
        metadata={"command": "apt list --installed", "reason": "touches the system (apt)"},
    ) == ACTIE_AUTO
    assert auto(
        title="AXE wants to run: cat > /dax/artifacts/x",
        kind="shell_command",
        metadata={"command": "cat > /dax/artifacts/x"},
    ) == ACTIE_AUTO
    assert auto(title="Yes needed: DEAL-002 — Copper", kind="northsea_notice") == ACTIE_ASK
    assert auto(title="Send a new intro email to Acme", kind="leave_plan") == ACTIE_ASK
    assert auto(title="Place a live order on XAUUSD", kind="leave_plan") == ACTIE_ASK
    assert auto(title="Flip auto_send_followups", kind="leave_plan") == ACTIE_ASK
    assert auto(title="Pay the invoice", kind="leave_plan") == ACTIE_ASK
    assert auto(
        title="Send the qualification email to the seller",
        kind="leave_plan",
        metadata={"app": "northsea"},
    ) == ACTIE_AUTO


class _Tabel:
    def __init__(self, naam, db):
        self.naam = naam
        self.db = db
        self.actie = "select"
        self.filters = []
        self.patch = None

    def select(self, *_a):
        self.actie = "select"
        return self

    def eq(self, kolom, waarde):
        self.filters.append(("eq", kolom, waarde))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def update(self, rij):
        self.actie = "update"
        self.patch = dict(rij)
        return self

    def execute(self):
        rijen = self.db.setdefault(self.naam, [])
        match = [r for r in rijen if all(str(r.get(k)) == str(v) for _, k, v in self.filters)]
        if self.actie == "update" and self.patch:
            for r in match:
                r.update(self.patch)
            return type("R", (), {"data": match})()
        return type("R", (), {"data": match})()


class _Db:
    def __init__(self, rijen):
        self.rijen = rijen

    def table(self, naam):
        return _Tabel(naam, self.rijen)


def test_pas_beleid_keurt_inspectie_goed_en_ontdubbelt_deals():
    db = _Db({
        "core_approvals": [
            {
                "id": "a1", "status": "pending", "kind": "shell_command",
                "title": "apt list", "detail": "", "task_id": "t1",
                "metadata": {"command": "apt list --installed"},
            },
            {
                "id": "n1", "status": "pending", "kind": "northsea_notice",
                "title": "Yes needed: DEAL-002 — Copper", "detail": "first",
                "task_id": "d1", "metadata": {"deal_code": "DEAL-002"},
            },
            {
                "id": "n2", "status": "pending", "kind": "northsea_notice",
                "title": "Yes needed: DEAL-002 — Copper again", "detail": "dup",
                "task_id": "d2", "metadata": {"deal_code": "DEAL-002"},
            },
        ],
        "core_tasks": [
            {"id": "t1", "status": "waiting_approval", "metadata": {}},
            {"id": "d1", "status": "waiting_approval", "metadata": {"goedkeuring": "nodig"}},
            {"id": "d2", "status": "waiting_approval", "metadata": {"goedkeuring": "nodig"}},
        ],
    })
    uit = pas_beleid_toe_op_pending(db)
    assert uit["auto"] == 1
    assert uit["superseded"] == 1
    a1 = next(r for r in db.rijen["core_approvals"] if r["id"] == "a1")
    n1 = next(r for r in db.rijen["core_approvals"] if r["id"] == "n1")
    n2 = next(r for r in db.rijen["core_approvals"] if r["id"] == "n2")
    assert a1["status"] == "approved" and "in-plan" in a1["decision_reason"]
    assert n1["status"] == "pending"
    assert n2["status"] in ("superseded", "cancelled")
    assert bestaande_deal_vraag(db, deal_code="DEAL-002")["id"] == "n1"
