"""Retry maakt een nieuwe queued-rij; failed blijft staan. Geen orders."""
from uuid import uuid4

from task_runtime import TaskRepository

TAAK = "6f1a6e1a-0000-4000-8000-000000000099"


class _Tabel:
    def __init__(self, naam, db):
        self.naam, self.db = naam, db
        self.actie, self.filters, self.rij = "select", [], None

    def select(self, *_a):
        self.actie = "select"
        return self

    def insert(self, rij):
        self.actie, self.rij = "insert", dict(rij)
        return self

    def eq(self, k, v):
        self.filters.append((k, v))
        return self

    def limit(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        rijen = self.db.setdefault(self.naam, [])
        if self.actie == "insert":
            self.rij.setdefault("id", str(uuid4()))
            rijen.append(self.rij)
            return type("R", (), {"data": [self.rij]})()
        uit = [r for r in rijen if all(str(r.get(k)) == str(v) for k, v in self.filters)]
        return type("R", (), {"data": uit})()


class _Db:
    def __init__(self, **tabellen):
        self.rijen = {k: list(v) for k, v in tabellen.items()}

    def table(self, naam):
        return _Tabel(naam, self.rijen)


def test_retry_kloont_failed_als_queued_agentic():
    db = _Db(core_tasks=[{
        "id": TAAK, "title": "Audit", "goal": "check", "status": "failed",
        "capability": "code", "execution_mode": "read", "payload": {}, "metadata": {},
    }], core_task_events=[])
    repo = TaskRepository(lambda: db)
    nieuw = repo.retry(TAAK, by="luka")
    assert nieuw["status"] == "queued"
    assert nieuw["capability"] == "agentic"
    assert nieuw["parent_task_id"] == TAAK
    assert db.rijen["core_tasks"][0]["status"] == "failed"


def test_retry_weiger_trading_execute():
    db = _Db(core_tasks=[{
        "id": TAAK, "title": "Place a live order", "goal": "buy", "status": "failed",
        "capability": "trading", "execution_mode": "execute", "payload": {}, "metadata": {},
    }])
    repo = TaskRepository(lambda: db)
    try:
        repo.retry(TAAK)
        raise AssertionError("had moeten weigeren")
    except ValueError as e:
        assert "refusing" in str(e)


def test_retry_van_bouwlus_blijft_pending_planner_zonder_oude_stoel():
    """Queued+planner pakt de VPS (no_handler) en de archiver ruimt hem meteen op.

    28 okt: vijf retries van Trading OS (04afc4dd) stierven in 1–20 s, elk met
    motor=cursor en pogingen=2 gekopieerd, dus nooit een verse beurt op Luka's
    stoelen. Pending laat de Mac-mini-planner hem draaien; pogingen/motor reset
    zodat kies_motor opnieuw spreidt.
    """
    db = _Db(core_tasks=[{
        "id": TAAK, "title": "Build next step: Trading OS", "goal": "keep building",
        "status": "failed", "capability": "planner", "execution_mode": "patch",
        "assignee": "code-agent", "payload": {"repo": "trading-os"},
        "metadata": {
            "planner": True, "agent": "code-agent", "motor": "cursor",
            "risico": "schrijven", "oorsprong_bouw": "ja", "pogingen": 2,
            "uiStatus": "blocked", "motor_gebruikt": "cursor",
        },
    }], core_task_events=[])
    repo = TaskRepository(lambda: db)
    nieuw = repo.retry(TAAK, by="luka")
    assert nieuw["status"] == "pending"
    assert nieuw["capability"] == "planner"
    assert nieuw["payload"]["repo"] == "trading-os"
    meta = nieuw["metadata"]
    assert meta["retry_of"] == TAAK
    assert meta["oorsprong_bouw"] == "ja"
    assert "pogingen" not in meta
    assert "motor_gebruikt" not in meta
    assert meta.get("uiStatus") == "todo"
    assert "motor" not in meta
    assert db.rijen["core_tasks"][0]["status"] == "failed"
