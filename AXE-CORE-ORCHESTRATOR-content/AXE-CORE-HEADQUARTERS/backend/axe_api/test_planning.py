"""planning.py: agenda, lease-uitvoering, idempotentie, uitzetten na fouten. Geen netwerk."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

import planning as p

NU = datetime(2026, 9, 16, 12, 0, tzinfo=timezone.utc)


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.op, self.body, self.filters = db, table, None, None, {}

    def insert(self, body):
        self.op, self.body = "insert", body
        return self

    def update(self, body):
        self.op, self.body = "update", body
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self.op == "insert":
            if self.table == "core_job_runs" and self.body.get("scheduled_for"):
                if any(r["job_key"] == self.body["job_key"] and r.get("scheduled_for") == self.body["scheduled_for"] for r in rows):
                    raise Exception("duplicate key value violates unique constraint core_job_runs_once_uidx (23505)")
            row = {"id": f"run-{len(rows) + 1}", **self.body}
            rows.append(row)
            return FakeResult([row])
        hits = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        for r in hits:
            r.update(self.body)
        return FakeResult(hits)


class FakeSb:
    def __init__(self, schedules):
        self.db = {"core_schedules": schedules, "core_job_runs": []}
        self.claims = 0

    def table(self, name):
        return FakeQuery(self.db, name)

    def rpc(self, name, params):
        assert name == "core_claim_due_schedules"
        self.claims += 1
        due = [s for s in self.db["core_schedules"] if s["enabled"] and s["executor"] == params["p_executor"]
               and s["action_type"] != "observed" and not s.get("lease_owner")]
        for s in due:
            s["lease_owner"] = params["p_owner"]
        return type("R", (), {"execute": lambda self_: FakeResult([dict(s) for s in due])})()


def sched(**kw):
    base = {"id": "s1", "name": "Job", "cron_expr": "0 * * * *", "timezone": "UTC", "action_type": "exec", "action_payload": {},
            "enabled": True, "next_run_at": "2026-09-16T12:00:00+00:00", "executor": "vps", "app": "northsea", "job_key": "northsea:job",
            "consecutive_failures": 0, "max_runtime_s": 60}
    base.update(kw)
    return base


def run(coro):
    return asyncio.run(coro)


# ── Agenda ─────────────────────────────────────────────────────────────────

def test_hourly_job_gives_each_run():
    items = p.agenda([sched()], [], NU, NU + timedelta(hours=3))
    assert [i["at"][11:16] for i in items] == ["12:00", "13:00", "14:00"]
    assert all(i["app"] == "northsea" and i["herhaling"] is None for i in items)


def test_frequent_pg_cron_job_collapses_per_day():
    items = p.agenda([], [{"jobname": "axe-companion-mt5-sync", "schedule": "*/10 * * * *", "active": True, "app": "axe_companion"}],
                     datetime(2026, 9, 16, 0, 0, tzinfo=timezone.utc), datetime(2026, 9, 17, 22, 0, tzinfo=timezone.utc))
    assert all(i["herhaling"] == "elke 10 min" and i["app"] == "axe_companion" and i["executor"] == "supabase" for i in items)
    assert sum(i["aantal"] for i in items) == 46 * 6
    assert len(items) <= 3


def test_disabled_and_invalid_jobs_are_not_planned():
    items = p.agenda([sched(enabled=False), sched(id="s2", job_key="x", cron_expr="nonsense")],
                     [{"jobname": "axe-memory-decay-weekly", "schedule": "0 3 * * 0", "active": False, "app": "axon_memory"}],
                     NU, NU + timedelta(days=8))
    assert items == []


def test_unknown_app_falls_back_to_core():
    items = p.agenda([sched(app="bogus", metadata={})], [], NU, NU + timedelta(hours=1, minutes=1))
    assert items[0]["app"] == "axe_core"


def test_timezone_is_respected():
    runs = p.runs_tussen("0 8 * * *", "Europe/Amsterdam", NU, NU + timedelta(days=1))
    assert runs[0].hour == 6  # 08:00 CEST = 06:00 UTC


# ── Uitvoeren ─────────────────────────────────────────────────────────────

def test_tick_runs_once_and_records_ledger():
    sb = FakeSb([sched()])
    calls = []

    async def actie(soort, payload):
        calls.append(soort)
        return {"status": "ok", "output": "done"}

    uit = run(p.Uitvoerder(lambda: sb, "vps", "vps:test", actie, nu=lambda: NU).tick())
    assert calls == ["exec"] and uit[0]["status"] == "ok"
    r = sb.db["core_job_runs"][0]
    assert (r["status"], r["app"], r["executor"], r["trigger"], r["output"]) == ("ok", "northsea", "vps", "cron", "done")
    s = sb.db["core_schedules"][0]
    assert s["lease_owner"] is None and s["next_run_at"].startswith("2026-09-16T13:00") and s["consecutive_failures"] == 0


def test_same_slot_is_never_run_twice():
    sb = FakeSb([sched()])
    sb.db["core_job_runs"].append({"id": "run-0", "job_key": "northsea:job", "scheduled_for": "2026-09-16T12:00:00+00:00"})
    calls = []

    async def actie(soort, payload):
        calls.append(soort)
        return {"status": "ok", "output": ""}

    uit = run(p.Uitvoerder(lambda: sb, "vps", "vps:test", actie, nu=lambda: NU).tick())
    assert calls == [] and uit[0]["status"] == "skipped" and sb.db["core_schedules"][0]["lease_owner"] is None


def test_executor_only_runs_its_own_kinds():
    sb = FakeSb([sched(action_type="planner", executor="vps")])

    async def actie(soort, payload):
        raise AssertionError("must not run")

    uit = run(p.Uitvoerder(lambda: sb, "vps", "vps:test", actie, nu=lambda: NU).tick())
    assert uit[0]["status"] == "fail" and "kan niet" in sb.db["core_job_runs"][0]["error"]


def test_mac_does_not_claim_vps_jobs():
    sb = FakeSb([sched(executor="vps")])

    async def actie(soort, payload):
        raise AssertionError("must not run")

    assert run(p.Uitvoerder(lambda: sb, "mac", "mac:test", actie, nu=lambda: NU).tick()) == []


def test_timeout_is_recorded():
    sb = FakeSb([sched(max_runtime_s=5)])

    async def actie(soort, payload):
        await asyncio.sleep(10)

    uit = p.Uitvoerder(lambda: sb, "vps", "vps:test", actie, nu=lambda: NU)
    uit_run = run(asyncio.wait_for(uit.tick(), timeout=8))
    assert uit_run[0]["status"] == "timeout" and sb.db["core_job_runs"][0]["status"] == "timeout"


def test_job_disables_itself_after_max_failures():
    sb = FakeSb([sched(consecutive_failures=p.MAX_FAILS - 1)])
    meldingen = []

    async def actie(soort, payload):
        raise RuntimeError("boom")

    uit = run(p.Uitvoerder(lambda: sb, "vps", "vps:test", actie, meld=lambda n, pl, r: meldingen.append(r), nu=lambda: NU).tick())
    s = sb.db["core_schedules"][0]
    assert uit[0]["uitgezet"] and s["enabled"] is False and s["next_run_at"] is None
    assert meldingen and meldingen[0]["uitgezet"] is True


def test_success_resets_failure_counter():
    assert p.na_run("ok", 3) == (0, False)
    assert p.na_run("fail", 3) == (4, False)
    assert p.na_run("timeout", 4) == (5, True)
    assert p.na_run("skipped", 2) == (2, False)


def test_manual_run_keeps_next_run():
    sb = FakeSb([sched()])

    async def actie(soort, payload):
        return {"status": "ok", "output": ""}

    run(p.Uitvoerder(lambda: sb, "vps", "vps:test", actie, nu=lambda: NU).voer_uit(sb.db["core_schedules"][0], trigger="manual"))
    assert sb.db["core_schedules"][0]["next_run_at"] == "2026-09-16T12:00:00+00:00"
    assert sb.db["core_job_runs"][0]["trigger"] == "manual" and sb.db["core_job_runs"][0]["scheduled_for"] is None


# ── Rapport van elders ────────────────────────────────────────────────────

def test_report_row_validates_and_computes_duration():
    r = p.rapport_rij({"job_key": "axe_core:opruimen", "job_name": "Mac opruimen", "app": "axe_core", "status": "ok",
                       "started_at": "2026-09-16T11:59:00Z", "finished_at": "2026-09-16T12:00:00Z", "output": "freed 2 GB"}, NU)
    assert (r["duration_ms"], r["trigger"], r["executor"], r["output"], r["error"]) == (60000, "observed", "mac", "freed 2 GB", None)
    for bad in ({"status": "ok"}, {"job_key": "x", "status": "weird"}, {"job_key": "x", "status": "ok", "source": "schedule"},
                {"job_key": "x", "status": "ok", "executor": "moon"}):
        with pytest.raises(ValueError):
            p.rapport_rij(bad, NU)
