"""Contract voor Luka's telefoon: pending approval + één notification-rij."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from goedkeuring_melding import (
    LUKA_USER_ID,
    a17_velden,
    heeft_a17_velden,
    melding_voor_goedkeuring,
    vraag_luka,
    verval_oude_shell_vragen,
)


class _Q:
    def __init__(self, db, naam):
        self.db, self.naam, self.actie = db, naam, "select"
        self.filters = []

    def select(self, *_a):
        return self

    def insert(self, rij):
        self.actie, self.rij = "insert", dict(rij)
        return self

    def update(self, waarden):
        self.actie, self.waarden = "update", waarden
        return self

    def eq(self, kolom, waarde):
        self.filters.append(("eq", kolom, waarde))
        return self

    def lt(self, kolom, waarde):
        self.filters.append(("lt", kolom, waarde))
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        tabel = self.db.tabellen.setdefault(self.naam, [])
        if self.actie == "insert":
            if "id" not in self.rij:
                self.rij["id"] = f"{self.naam}-{len(tabel)+1}"
            tabel.append(self.rij)
            return type("R", (), {"data": [self.rij]})()
        if self.actie == "update":
            uit = []
            for rij in tabel:
                if self._match(rij):
                    rij.update(self.waarden)
                    uit.append(rij)
            return type("R", (), {"data": uit})()
        uit = [r for r in tabel if self._match(r)]
        return type("R", (), {"data": uit})()

    def _match(self, rij):
        for soort, kolom, waarde in self.filters:
            if soort == "eq" and str(rij.get(kolom)) != str(waarde):
                return False
            if soort == "lt" and str(rij.get(kolom) or "") >= str(waarde):
                return False
        return True


class _Db:
    def __init__(self):
        self.tabellen = {"core_approvals": [], "core_notifications": []}

    def table(self, naam):
        return _Q(self, naam)


def test_melding_heeft_onderwerp_en_detail_voor_de_a17():
    tekst = melding_voor_goedkeuring("Dit is: een bericht versturen (offer).", "Aan wie: the buyer.")
    assert tekst.startswith("Dit is: een bericht versturen")
    assert "buyer" in tekst


def test_nieuwe_pending_approval_schrijft_approval_en_precies_een_notification():
    db = _Db()
    eerste = vraag_luka(
        db, "taak-1",
        titel="Dit is: een bericht versturen (Send the offer to the buyer).",
        detail="Aan wie: the buyer.\nWaarom: dit valt buiten het staande plan.",
        kind="leave_plan",
    )
    tweede = vraag_luka(
        db, "taak-1",
        titel="Dit is: een bericht versturen (Send the offer to the buyer).",
        detail="Aan wie: the buyer.\nWaarom: dit valt buiten het staande plan.",
        kind="leave_plan",
    )
    assert eerste["id"] == tweede["id"]
    assert heeft_a17_velden(eerste)
    velden = a17_velden(eerste)
    assert velden["task_id"] == "taak-1"
    assert velden["kind"] == "leave_plan"
    assert velden["title"]
    assert velden["detail"]
    assert len(db.tabellen["core_notifications"]) == 1
    melding = db.tabellen["core_notifications"][0]
    assert melding["recipient"] == LUKA_USER_ID
    assert melding["type"] == "warning"
    assert "Dit is" in melding["message"]


def test_approvals_endpoint_levert_de_a17_velden():
    """GET /approvals doet select(*) — dezelfde velden als AxeWatcher.kt leest."""
    from pathlib import Path
    bron = Path(__file__).with_name("task_runtime.py").read_text()
    assert '.select("*")' in bron
    assert "def list_approvals" in bron
    db = _Db()
    rij = vraag_luka(db, "taak-ns", titel="Yes needed: DEAL-001", detail="Buyer: Qinzhou", kind="northsea_notice")
    velden = a17_velden(rij)
    assert set(velden) >= {"id", "task_id", "kind", "title", "detail", "status"}
    assert heeft_a17_velden(rij)


def test_oude_shell_vragen_verlopen_en_komen_niet_meer_als_pending():
    db = _Db()
    oud = datetime(2026, 8, 18, tzinfo=timezone.utc)
    db.tabellen["core_approvals"] = [
        {
            "id": "systemctl",
            "task_id": "t-old",
            "kind": "shell_command",
            "title": "AXE wants to run: systemctl status",
            "detail": "systemctl",
            "status": "pending",
            "created_at": oud.isoformat(),
        },
        {
            "id": "useradd",
            "task_id": "t-old2",
            "kind": "shell_command",
            "title": "AXE wants to run: useradd -m axe",
            "detail": "useradd",
            "status": "pending",
            "created_at": (oud + timedelta(days=24)).isoformat(),
        },
        {
            "id": "vers",
            "task_id": "t-new",
            "kind": "leave_plan",
            "title": "Send the offer to the buyer",
            "detail": "why",
            "status": "pending",
            "created_at": datetime(2026, 10, 5, tzinfo=timezone.utc).isoformat(),
        },
    ]
    n = verval_oude_shell_vragen(db, nu=datetime(2026, 10, 5, tzinfo=timezone.utc))
    assert n == 2
    pending = [r for r in db.tabellen["core_approvals"] if r["status"] == "pending"]
    assert [r["id"] for r in pending] == ["vers"]
    assert all(r["status"] == "expired" for r in db.tabellen["core_approvals"] if r["kind"] == "shell_command")
