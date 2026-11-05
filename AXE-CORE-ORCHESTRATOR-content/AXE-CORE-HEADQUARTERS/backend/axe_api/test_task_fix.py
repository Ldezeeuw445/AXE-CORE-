"""Fix maakt een reparatietaak; Retry herhaalt dezelfde check niet."""
from uuid import uuid4

from task_runtime import TaskRepository

TAAK = "6f1a6e1a-0000-4000-8000-000000000099"

LINT_DETAIL = (
    "/Users/luka/AXE-COMPANION-OS-/src/app/index.tsx\n"
    "  12:3  error  'unused' is defined but never used  @typescript-eslint/no-unused-vars\n"
)


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

    def update(self, velden):
        self.actie, self.rij = "update", dict(velden)
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
        if self.actie == "update":
            for r in uit:
                r.update(self.rij)
            return type("R", (), {"data": uit})()
        return type("R", (), {"data": uit})()


class _Db:
    def __init__(self, **tabellen):
        self.rijen = {k: list(v) for k, v in tabellen.items()}

    def table(self, naam):
        return _Tabel(naam, self.rijen)


def _lint_taak(**extra):
    rij = {
        "id": TAAK,
        "title": "Build next step: AXE Companion",
        "goal": "keep building",
        "status": "failed",
        "capability": "planner",
        "execution_mode": "patch",
        "assignee": "code-agent",
        "payload": {"repo": "axe-companion"},
        "error": {"message": "Project check failed: lint"},
        "metadata": {
            "planner": True,
            "agent": "code-agent",
            "oorsprong_bouw": "ja",
            "bewijs": {
                "verification": {
                    "passed": False,
                    "reason": "Project check failed: lint",
                    "checks": [{"name": "lint", "passed": False, "detail": LINT_DETAIL}],
                }
            },
        },
    }
    rij.update(extra)
    return rij


def test_fix_zet_pending_planner_reparatie_voor_companion_lint():
    db = _Db(core_tasks=[_lint_taak()], core_task_events=[])
    repo = TaskRepository(lambda: db)
    nieuw = repo.fix(TAAK, by="luka")
    assert nieuw["status"] == "pending"
    assert nieuw["capability"] == "planner"
    assert nieuw["payload"]["repo"] == "axe-companion"
    assert nieuw["parent_task_id"] == TAAK
    assert "lint" in nieuw["title"].lower()
    assert "Companion" in nieuw["title"]
    assert "axe-companion" in nieuw["goal"].lower() or "AXE-COMPANION" in nieuw["goal"]
    assert "index.tsx:12" in nieuw["goal"] or "no-unused-vars" in nieuw["goal"]
    assert "do not add features" in nieuw["goal"].lower() or "niet" in nieuw["goal"].lower()
    meta = nieuw["metadata"]
    assert meta["fix_of"] == TAAK
    assert meta["oorsprong_bouw"] == "ja"
    oud = db.rijen["core_tasks"][0]
    assert oud["status"] == "failed"
    assert oud["metadata"].get("archived") is True


def test_fix_weiger_trading_execute():
    db = _Db(core_tasks=[{
        "id": TAAK, "title": "Place a live order", "goal": "buy", "status": "failed",
        "capability": "trading", "execution_mode": "execute", "payload": {},
        "error": {"message": "Project check failed: lint"}, "metadata": {},
    }])
    repo = TaskRepository(lambda: db)
    try:
        repo.fix(TAAK)
        raise AssertionError("had moeten weigeren")
    except ValueError as e:
        assert "refusing" in str(e)


def test_fix_zonder_lint_detail_blijft_een_reparatie_niet_dezelfde_check():
    db = _Db(core_tasks=[_lint_taak(
        error={"message": "Project check failed: lint"},
        metadata={"oorsprong_bouw": "ja", "agent": "code-agent"},
        payload={},
    )], core_task_events=[])
    repo = TaskRepository(lambda: db)
    nieuw = repo.fix(TAAK, by="luka")
    assert nieuw["goal"] != "keep building"
    assert "Project check failed: lint" in nieuw["goal"] or "lint" in nieuw["goal"].lower()
    assert nieuw["payload"]["repo"] == "axe-companion"
