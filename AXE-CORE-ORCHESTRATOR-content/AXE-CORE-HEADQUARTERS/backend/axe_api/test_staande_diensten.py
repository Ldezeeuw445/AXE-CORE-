"""24/7 staande diensten: roosters, echte jobs, geen mail/orders/geld."""
from datetime import datetime, timedelta, timezone

import staande_diensten as sd

NU = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.op, self.body, self.filters = db, table, None, None, {}

    def select(self, _cols="*"):
        self.op = "select"
        return self

    def insert(self, body):
        self.op, self.body = "insert", body
        return self

    def upsert(self, body, on_conflict=None):
        self.op, self.body = "upsert", body
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self.op in ("insert", "upsert"):
            row = {"id": f"{self.table}-{len(rows) + 1}", **self.body}
            rows.append(row)
            return FakeResult([row])
        hits = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        return FakeResult(hits[: getattr(self, "limit_n", len(hits))])


class FakeDb:
    def __init__(self, **tables):
        self.db = {k: list(v) for k, v in tables.items()}

    def table(self, name):
        return FakeQuery(self.db, name)


def test_catalogus_dekt_de_slapende_home_agents():
    assert sd.STAANDE_AGENTS == {
        "wingman", "memory", "task", "cron", "finance", "apps", "intel", "companion",
    }
    for agent in sd.STAANDE_AGENTS:
        d = sd.catalogus_voor(agent)
        assert d and d["job_key"].startswith("axe_core:staande-")
        assert d["cron_expr"]


def test_zorg_voor_roosters_maakt_ontbrekende_en_laat_bestaande():
    db = FakeDb(core_schedules=[{
        "job_key": "axe_core:staande-wingman", "name": "custom", "enabled": True,
    }])
    gemaakt = sd.zorg_voor_roosters(db, NU)
    assert "axe_core:staande-wingman" not in gemaakt
    assert "axe_core:staande-memory" in gemaakt
    keys = {r["job_key"] for r in db.db["core_schedules"]}
    assert keys >= {d["job_key"] for d in sd.DIENSTEN}
    wingman = next(r for r in db.db["core_schedules"] if r["job_key"] == "axe_core:staande-wingman")
    assert wingman["name"] == "custom"
    memory = next(r for r in db.db["core_schedules"] if r["job_key"] == "axe_core:staande-memory")
    assert memory["action_type"] == "staande"
    assert memory["metadata"]["agent"] == "memory"
    assert memory["executor"] == "vps"


def test_wingman_telt_echte_wachtrij_zonder_te_verzenden():
    db = FakeDb(
        core_approvals=[{"id": "a", "status": "pending"}, {"id": "b", "status": "approved"}],
        core_tasks=[{"id": "t", "status": "queued"}, {"id": "u", "status": "completed"}],
        core_missions=[{"id": "m", "status": "blocked"}],
    )
    uit = sd.voer_uit("wingman", db, NU)
    assert uit["status"] == "ok"
    body = uit["output"].lower()
    assert "pending_ok" in body and "1" in body
    for woord in sd.VERBODEN:
        assert woord not in body


def test_task_meldt_stale_lease_maar_pakt_hem_niet():
    db = FakeDb(core_tasks=[{
        "id": "stale", "status": "running", "lease_token": "x",
        "lease_expires_at": (NU - timedelta(minutes=5)).isoformat(),
    }, {"id": "ok", "status": "queued"}])
    body = sd.run_task(db, NU)
    assert body["queue"]["stale_leases"] == 1
    assert body["queue"]["queued"] == 1
    assert db.db["core_tasks"][0]["status"] == "running"


def test_finance_zet_geen_geld_in_beweging():
    db = FakeDb(core_dax_computers=[{
        "id": "dax-1", "owner_agent": "developer",
        "stats": {"engines": {"claude_logged_in": True, "codex_logged_in": False}},
    }])
    body = sd.run_finance(db, NU)
    assert body["moved"] == 0
    assert body["costs"] == "read-only"
    assert body["seats"][0]["claude"] is True


def test_intel_plaatst_geen_orders():
    db = FakeDb(
        intel_market_tide=[{"bias": "bullish", "snapshot_time": NU.isoformat(), "call_put_ratio": 1.2}],
        intel_unusual_options=[{"id": "o1", "symbol": "AAPL"}],
    )
    body = sd.run_intel(db, NU)
    assert body["orders"] == 0
    assert body["signals"]["bias"] == "bullish"


def test_onbekende_agent_faalt_eerlijk():
    assert sd.voer_uit("northsea", FakeDb(), NU)["status"] == "fail"
