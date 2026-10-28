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

    def update(self, body):
        self.op, self.body = "update", body
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
        if self.op == "update":
            for r in hits:
                r.update(self.body)
            return FakeResult(hits)
        return FakeResult(hits[: getattr(self, "limit_n", len(hits))])


class FakeDb:
    def __init__(self, **tables):
        self.db = {k: list(v) for k, v in tables.items()}

    def table(self, name):
        return FakeQuery(self.db, name)


def test_catalogus_dekt_de_slapende_home_agents():
    oorspronkelijk = {
        "wingman", "memory", "task", "cron", "finance", "apps", "intel", "companion",
    }
    grok = {
        "axemanager", "projectsmgr", "companionmgr", "axon", "tradingos", "northseamgr",
    }
    assert oorspronkelijk <= sd.STAANDE_AGENTS
    assert grok <= sd.STAANDE_AGENTS
    # 28 okt: de bouwende developer-DAX (dax_bouw.py) staat ernaast.
    assert sd.STAANDE_AGENTS == oorspronkelijk | grok | {"dax-bouw"}
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


def test_archiveert_astra_en_telt_alleen_verse_fouten():
    oud = (NU - timedelta(days=3)).isoformat()
    db = FakeDb(core_tasks=[
        {"id": "astra", "status": "failed", "error": {"message": "The 'gpt-6-astra' model requires a newer version"},
         "updated_at": NU.isoformat(), "title": "Build"},
        {"id": "pip", "status": "failed", "error": {"message": "pip install failed: No module named pip"},
         "updated_at": NU.isoformat(), "title": "Trading OS"},
        {"id": "ancient", "status": "failed", "error": {"message": "unknown workspace '@device'"},
         "updated_at": oud, "title": "device"},
        {"id": "notice", "status": "pending", "capability": "northsea_desk",
         "title": "Desk run: nothing to decide", "metadata": {}},
        {"id": "venv", "status": "blocked", "error": {"message": "Mislukt: venv failed:"},
         "updated_at": oud, "title": "Orchestrator health"},
    ])
    body = sd.run_task(db, NU)
    by_id = {t["id"]: t for t in db.db["core_tasks"]}
    assert by_id["astra"]["status"] == "cancelled"
    assert by_id["astra"]["error"]["archived"] is True
    assert by_id["pip"]["status"] == "failed"
    assert by_id["ancient"]["status"] == "cancelled"
    assert by_id["notice"]["status"] == "completed"
    assert by_id["venv"]["status"] == "cancelled"
    assert body["queue"]["failed"] == 1
    assert body["queue"]["blocked"] == 0


def test_verse_bouw_mislukking_is_geen_stale_oktober_fout():
    """04afc4dd was van 27 okt, niet 'before 2026-10-17'. 14 u oud + Codex-model
    is een echte fout; no_handler op een retry van 10 s is wél de bekende bug."""
    vers = (NU - timedelta(hours=14)).isoformat()
    db = FakeDb(core_tasks=[
        {"id": "codex", "status": "failed", "title": "Build next step: Trading OS",
         "updated_at": vers, "capability": "planner",
         "error": {"message": "The 'gpt-5-codex' model is not supported when using Codex "
                   "with a ChatGPT account. code: model_not_found"},
         "metadata": {"oorsprong_bouw": "ja", "pogingen": 2, "motor": "cursor"}},
        {"id": "retry", "status": "failed", "title": "Build next step: Trading OS",
         "updated_at": NU.isoformat(), "capability": "planner",
         "error": {"code": "no_handler", "message": "No handler for planner"},
         "metadata": {"oorsprong_bouw": "ja", "retry_of": "codex", "pogingen": 2}},
    ])
    sd.run_task(db, NU)
    by_id = {t["id"]: t for t in db.db["core_tasks"]}
    assert by_id["codex"]["status"] == "failed"
    assert not (by_id["codex"].get("metadata") or {}).get("archived")
    assert by_id["retry"]["status"] == "cancelled"
    reden = (by_id["retry"].get("error") or {}).get("archive_reason", "")
    assert "2026-10-17" not in reden
    assert "Not retried automatically" in reden


def test_samenvatting_nooit_iso_of_json_dump():
    from agent_activiteit import agent_status, routine_samenvatting
    dump = {"at": "2026-10-17T13:40:02.798367+00:00", "ok": 4, "enabled": 4}
    tekst = routine_samenvatting({"last_result": dump})
    assert "{" not in tekst and "T13:40" not in tekst
    assert "15:40" in tekst
    missie = {"id": "m", "owner_agent": "browser", "status": "monitoring",
              "next_run_at": "2026-10-17T13:45:00+00:00", "title": "Watch"}
    s = agent_status("browser", [], [missie], None, datetime(2026, 10, 17, 13, 39, tzinfo=timezone.utc))
    assert "2026-10-17T" not in s["reason"]
    assert "15:45" in s["reason"]
    wachtrij = routine_samenvatting({"last_result": {
        "queue": {"queued": 0, "pending": 53, "stale_leases": 0, "failed": 0, "blocked": 1},
    }})
    assert wachtrij == "queue 53 planned, 1 blocked"
    assert "failed" not in wachtrij
