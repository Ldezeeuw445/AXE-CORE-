"""Annuleren moet ook door de randen heen werken: de API en de twee Macs.

Stoppen was tot nu toe alleen iets binnen de lus. Wie op "stop" drukte in de
app, of wie een taak stopzette terwijl een Mac er nog aan bezig was, kreeg
daar niets van mee: de API kende geen route, en de worker op de Mac schreef
zijn uitkomst achteraf gewoon over de annulering heen.

Er gaat hier geen enkel echt verzoek uit. Supabase is nagebootst, en ook de
auditregel wordt opgevangen in plaats van weggeschreven.
"""
import os
import pathlib
import tempfile
import types

import pytest

# main.py leest zijn omgeving bij het importeren en maakt WORKSPACE_DIR aan.
# Alleen invullen wat ontbreekt: een echte sleutel in de omgeving blijft staan
# en wordt hieronder uit main zelf gelezen, niet hier verzonnen.
os.environ.setdefault("AXE_API_KEY", "test-sleutel")
os.environ.setdefault("SUPABASE_URL", "http://localhost.invalid")
os.environ.setdefault("SUPABASE_SERVICE_ROLE", "test-service-role")
if "WORKSPACE_DIR" not in os.environ:
    os.environ["WORKSPACE_DIR"] = tempfile.mkdtemp(prefix="axe-test-workspace-")

from fastapi.testclient import TestClient  # noqa: E402

import device_actions  # noqa: E402
import main  # noqa: E402

TAAK = "6f1a6e1a-0000-4000-8000-000000000001"
OUDER = "6f1a6e1a-0000-4000-8000-0000000000aa"
SLEUTEL = {"Authorization": f"Bearer {main.AXE_API_KEY}"}


class NepRepo:
    """TaskRepository.cancel zoals het contract hem beschrijft."""

    def __init__(self, uitkomst=None, fout=None):
        self.aanroepen: list[dict] = []
        self.uitkomst = uitkomst if uitkomst is not None else {"id": TAAK, "status": "cancelled"}
        self.fout = fout

    async def cancel(self, task_id, *, by="user", reason=None):
        self.aanroepen.append({"task_id": task_id, "by": by, "reason": reason})
        if self.fout is not None:
            raise self.fout
        return self.uitkomst


@pytest.fixture
def api(monkeypatch):
    """Een client, een nagebootste repository en de opgevangen auditregels."""
    regels: list[tuple] = []

    async def nep_audit(action, resource, details, ip=""):
        regels.append((action, resource, details))

    monkeypatch.setattr(main, "audit", nep_audit)

    def bouw(repo: NepRepo):
        monkeypatch.setattr(main, "task_repo", lambda: repo)
        # Bewust zonder `with`: de startup-events van main starten de planner.
        return TestClient(main.app)

    return types.SimpleNamespace(bouw=bouw, audit=regels)


class TestRoute:
    def test_een_lopende_taak_stoppen_geeft_200_met_de_taak(self, api):
        repo = NepRepo()
        r = api.bouw(repo).post(
            f"/tasks/{TAAK}/cancel", headers=SLEUTEL,
            json={"by": "luka", "reason": "verkeerde opdracht"},
        )
        assert r.status_code == 200
        assert r.json() == {"task": {"id": TAAK, "status": "cancelled"}}
        assert repo.aanroepen == [{"task_id": TAAK, "by": "luka", "reason": "verkeerde opdracht"}]

    def test_zonder_lichaam_is_het_luka_die_stopt(self, api):
        repo = NepRepo()
        assert api.bouw(repo).post(f"/tasks/{TAAK}/cancel", headers=SLEUTEL).status_code == 200
        assert repo.aanroepen == [{"task_id": TAAK, "by": "user", "reason": None}]

    def test_onbekende_taak_is_404(self, api):
        repo = NepRepo(fout=LookupError(TAAK))
        r = api.bouw(repo).post(f"/tasks/{TAAK}/cancel", headers=SLEUTEL)
        assert r.status_code == 404
        assert r.json()["detail"] == "Task not found"

    def test_een_al_terminale_taak_is_409(self, api):
        repo = NepRepo(fout=ValueError("task is already completed"))
        r = api.bouw(repo).post(f"/tasks/{TAAK}/cancel", headers=SLEUTEL)
        assert r.status_code == 409
        assert "already completed" in r.json()["detail"]

    def test_de_annulering_komt_in_het_auditspoor(self, api):
        client = api.bouw(NepRepo())
        client.post(f"/tasks/{TAAK}/cancel", headers=SLEUTEL, json={"by": "luka", "reason": "stop"})
        assert api.audit == [("task_cancel", TAAK, {"by": "luka", "reason": "stop"})]

    def test_zonder_geldige_sleutel_stopt_er_niets(self, api):
        repo = NepRepo()
        client = api.bouw(repo)
        assert client.post(f"/tasks/{TAAK}/cancel").status_code == 401
        assert client.post(
            f"/tasks/{TAAK}/cancel", headers={"Authorization": "Bearer fout"},
        ).status_code == 401
        assert repo.aanroepen == [] and api.audit == []

    def test_verwijderen_blijft_hard_dicht(self, api):
        """Annuleren is een statuswijziging; de rij blijft leesbaar bestaan."""
        r = api.bouw(NepRepo()).delete(f"/tasks/{TAAK}", headers=SLEUTEL)
        assert r.status_code == 403


class NepDb:
    """Supabase voor één ouder-taak en één taak op de Mac."""

    def __init__(self, ouder_status="running", kind_status="running"):
        self.ouder_status, self.kind_status = ouder_status, kind_status
        self.updates: list[dict] = []
        self.inserts: list[dict] = []

    def table(self, naam):
        return _Vraag(self, naam)

    def _uitvoeren(self, v):
        if v.tabel == "core_computer_workers":
            return types.SimpleNamespace(data=[{
                "device_id": "main-imac-luka", "host": "iMac", "workspaces": "AXE Core",
                "heartbeat_at": "2999-01-01T00:00:00+00:00",
            }])
        if v.actie == "insert":
            self.inserts.append(v.payload)
            return types.SimpleNamespace(data=[{"id": "kind-1"}])
        if v.actie == "update":
            self.updates.append({"waarden": v.payload, "filters": v.filters})
            return types.SimpleNamespace(data=[{"id": v.filters.get("id")}])
        if v.filters.get("id") == OUDER:
            return types.SimpleNamespace(data=[{"status": self.ouder_status}])
        return types.SimpleNamespace(data=[{
            "status": self.kind_status, "result": {"output": "Safari"}, "error": {"message": "kapot"},
        }])


class _Vraag:
    def __init__(self, db, tabel):
        self.db, self.tabel = db, tabel
        self.actie, self.payload, self.filters = None, None, {}

    def select(self, *_a, **_k):
        self.actie = "select"
        return self

    def insert(self, rij):
        self.actie, self.payload = "insert", rij
        return self

    def update(self, rij):
        self.actie, self.payload = "update", rij
        return self

    def eq(self, kolom, waarde):
        self.filters[kolom] = waarde
        return self

    def in_(self, kolom, waarden):
        self.filters[kolom] = list(waarden)
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        return self.db._uitvoeren(self)


class TestDeMac:
    """run_on_device wachtte tot de Mac klaar was, ook als de taak al gestopt was."""

    @pytest.fixture(autouse=True)
    def _kort_wachten(self, monkeypatch):
        # Zonder de fix loopt de lus anders zes minuten door voor hij faalt.
        monkeypatch.setattr(device_actions, "TIMEOUT_S", 0.5)

    def _draai(self, db):
        return device_actions.run_on_device(
            "main-imac-luka", "app.frontmost", parent_task_id=OUDER,
            db=db, sleep=lambda s: None,
        )

    def test_stopt_met_wachten_zodra_de_ouder_geannuleerd_is(self):
        db = NepDb(ouder_status="cancelled")
        uit = self._draai(db)
        assert uit["ok"] is False and uit["cancelled"] is True
        assert "cancelled" in uit["error"]

    def test_laat_de_rij_van_de_mac_zelf_met_rust(self):
        """Wie het kind stopzet is TaskRepository.cancel, niet deze wachtlus.

        Een Mac die al aan het klikken is, stopt niet doordat zijn rij op
        cancelled gaat -- dan staat er alleen iets anders in de tabel dan er
        gebeurt. De worker op de Mac sluit die rij zelf af, en doet dat sinds
        de aanpassing in worker.mjs alleen nog als hij nog op running staat.
        """
        db = NepDb(ouder_status="cancelled")
        self._draai(db)
        assert db.updates == []

    def test_een_lopende_ouder_breekt_niets_af(self):
        uit = self._draai(NepDb(ouder_status="running", kind_status="completed"))
        assert uit == {"device": "main-imac-luka", "tool": "app.frontmost", "ok": True, "output": "Safari"}


def test_de_worker_overschrijft_een_geannuleerde_rij_niet():
    """settle() schreef zijn uitkomst over elke rij, ook een geannuleerde."""
    bron = (pathlib.Path(__file__).resolve().parents[2] / "infra/computer-worker/worker.mjs").read_text()
    settle = bron.split("async function settle(", 1)[1].split("\n}", 1)[0]
    assert "status=eq.running" in settle
