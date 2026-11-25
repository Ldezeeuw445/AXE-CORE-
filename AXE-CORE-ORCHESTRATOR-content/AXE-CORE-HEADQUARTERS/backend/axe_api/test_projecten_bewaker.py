"""Projects Manager: met de echte takenlijst van 8 november als voorbeeld.

Die dag zei hij elk kwartier "31 open rows", terwijl een DAX-taak drie dagen
in de wachtrij stond en hetzelfde voorstel zeven keer open lag.
"""
from datetime import datetime, timezone

import grok_managers as gm
import projecten_bewaker as pb
from test_northsea_bewaker import FakeDb as _Db, _Query as _Q

NU = datetime(2026, 11, 8, 10, 0, tzinfo=timezone.utc)


class _Query(_Q):
    """Plus in_, en order/insert zoals de echte database: met created_at."""

    teller = 0

    def insert(self, body):
        _Query.teller += 1
        return super().insert({"created_at": f"2026-11-08T10:00:{_Query.teller:05d}", **body})

    def order(self, k, desc=False):
        self.volgorde = (k, desc)
        return self

    def in_(self, k, waarden):
        self.binnen = (k, set(waarden))
        return self

    def execute(self):
        uit = super().execute()
        if self.op == "select" and getattr(self, "binnen", None):
            k, w = self.binnen
            uit.data = [r for r in uit.data if r.get(k) in w]
        if self.op == "select" and getattr(self, "volgorde", None):
            k, desc = self.volgorde
            rijen = sorted((r for r in self.db.get(self.table, []) if all(r.get(f) == v for f, v in self.filters.items())),
                           key=lambda r: str(r.get(k) or ""), reverse=desc)
            uit.data = rijen[: getattr(self, "limit_n", len(rijen))]
        return uit


class FakeDb(_Db):
    def table(self, name):
        return _Query(self.db, name)


def taak(tid, status, titel, dag, assignee="code-agent", uur=9):
    return {"id": tid, "status": status, "title": titel, "assignee": assignee,
            "updated_at": f"2026-{dag}T{uur:02d}:00:00+00:00", "metadata": {}}


TAKEN_8NOV = [
    taak("q1", "queued", "DAX build: next task in axon-memory", "11-05T16", "developer", 39),
    taak("p1", "pending", "PWA‑manifest‑scope corrigeren in axe‑companion", "09-16"),
    taak("p2", "pending", "PWA-manifest-scope corrigeren in axe-companion", "09-18"),
    taak("p3", "pending", "PWA‑manifest‑scope corrigeren in axe-companion", "09-16"),
    taak("p4", "pending", "Fix: NorthSea Deal & Operations Crews", "11-07", "axe-core"),
    taak("w1", "waiting_approval", "NorthSea: er komt geen mail meer binnen", "11-06", "northseamgr"),
    taak("c1", "completed", "PWA-manifest-scope corrigeren in axe-companion", "11-01"),
]


def _fix(rijen):
    # "11-05T16" + uur 39 is geen geldige tijd; maak er echte tijden van.
    for r in rijen:
        if "T16T" in r["updated_at"]:
            r["updated_at"] = "2026-11-05T16:39:00+00:00"
    return rijen


def codes(b):
    return [x.code for x in b]


def test_vastgelopen_wachtrij_bereikt_luka():
    b = pb.beoordeel(_fix([dict(t) for t in TAKEN_8NOV]), NU)
    assert codes(b)[0] == "wachtrij_vast" and b[0].voor == "luka"
    assert "DAX build" in b[0].detail and "2 dagen" in b[0].detail
    assert b[0].titel == "Taken staan vast in de wachtrij"  # vast: geen tweede kaart bij een nieuwe telling


def test_dubbels_herkend_los_van_streepjes_en_de_nieuwste_blijft():
    weg = pb.dubbele_voorstellen(_fix([dict(t) for t in TAKEN_8NOV]))
    assert {r["id"] for r in weg} == {"p1", "p3"}  # p2 (18 sep) is de nieuwste en blijft


def test_alleen_pending_wordt_ooit_aangewezen():
    rijen = [taak("a", "queued", "Zelfde", "11-08"), taak("b", "queued", "Zelfde", "11-07"),
             taak("c", "waiting_approval", "Zelfde", "11-06"), taak("d", "running", "Zelfde", "11-08")]
    assert pb.dubbele_voorstellen(rijen) == []


def test_verse_wachtrij_is_geen_storing():
    rijen = [taak("q", "queued", "Net gestart", "11-08", uur=9)]
    assert "wachtrij_vast" not in codes(pb.beoordeel(rijen, NU))


def test_pulse_ruimt_op_vraagt_luka_en_zwijgt_als_er_niets_verandert():
    db = FakeDb()
    db.db["core_tasks"] = _fix([dict(t) for t in TAKEN_8NOV])
    uit = gm.run_projectsmgr(db, NU)
    assert uit["opgeruimd"] == 2 and uit["voor_luka"] == ["wachtrij_vast"]
    status = {r["id"]: r["status"] for r in db.rows("core_tasks")}
    assert status["p1"] == status["p3"] == "cancelled"
    assert status["p2"] == "pending" and status["c1"] == "completed" and status["q1"] == "queued"
    assert db.rows("core_tasks")[1]["metadata"]["reden"] == "dubbel voorstel"
    # 16 nov: eerst zelf proberen in plaats van meteen Luka.
    assert "Zelf oplossen: Taken staan vast in de wachtrij" in [r.get("title") for r in db.rows("core_tasks")]
    assert "Taken staan vast in de wachtrij" not in [r.get("title") for r in db.rows("core_approvals")]
    rapporten = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "projectsmgr" and r["to_agent"] != "luka"]
    assert len(rapporten) == 1 and "2 dubbele voorstellen opgeruimd" in rapporten[0]["body"]
    chat = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "projectsmgr" and r["to_agent"] == "luka"]
    assert "Ik ben zelf bezig met: Taken staan vast in de wachtrij" in chat[0]["body"]

    # Tweede pulse: niets nieuws opgeruimd, maar de stand verschilt (geen
    # "opgeruimd" meer) -> één rapport. Derde pulse: zelfde stand -> stil.
    gm.run_projectsmgr(db, NU)
    gm.run_projectsmgr(db, NU)
    rapporten = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "projectsmgr" and r["to_agent"] != "luka"]
    assert len(rapporten) == 2
    assert [r.get("title") for r in db.rows("core_tasks")].count("Zelf oplossen: Taken staan vast in de wachtrij") == 1


def test_lege_lijst_zegt_dat_niets_stilstaat():
    db = FakeDb()
    uit = gm.run_projectsmgr(db, NU)
    assert uit["bevindingen"] == [] and uit["opgeruimd"] == 0
    assert "niets staat stil" in db.rows("core_manager_messages")[0]["body"]


def test_verouderde_plannervoorstellen_archiveert_hij_zelf_beveiliging_blijft():
    """16 nov: '16 voorstellen liggen al meer dan een maand stil ... schrappen of inplannen' -- nu doet hij het zelf."""
    db = FakeDb()
    oud = "2026-09-14T09:00:00+00:00"
    db.db["core_tasks"] = [
        {"id": "o1", "status": "pending", "title": "VPS en repo weer synchroniseren", "requested_by": "planner",
         "assignee": "code-agent", "updated_at": oud, "metadata": {}},
        {"id": "o2", "status": "pending", "title": "Beveiligingslekken in cloudflare-migration-2 dichten", "requested_by": "planner",
         "assignee": "code-agent", "updated_at": oud, "metadata": {}},
        {"id": "o3", "status": "pending", "title": "Eigen idee van Luka", "requested_by": "luka",
         "assignee": "code-agent", "updated_at": oud, "metadata": {}},
    ]
    uit = gm.run_projectsmgr(db, NU)
    status = {r["id"]: r["status"] for r in db.rows("core_tasks") if r["id"] in ("o1", "o2", "o3")}
    assert uit["gearchiveerd"] == 1 and status == {"o1": "cancelled", "o2": "pending", "o3": "pending"}
    chat = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "projectsmgr" and r["to_agent"] == "luka"]
    assert "1 verouderde voorstellen gearchiveerd" in chat[-1]["body"]


def test_technische_sleutelfout_is_eerst_zelf():
    assert gm._sleutel_technisch("dax-developer-01 login broken (DAX is in error: installing dax-routine failed: command exited)")
    assert not gm._sleutel_technisch("claude2 login broken (logged out)")
    assert not gm._sleutel_technisch("AISSTREAM_API_KEY missing (required)")


def test_wees_wachter_zonder_kaart_wordt_gesloten_met_kaart_niet():
    from datetime import timedelta
    oud = (NU - timedelta(days=3)).isoformat()
    rijen = [
        {"id": "a", "status": "waiting_approval", "title": "NorthSea: er komt geen mail meer binnen", "created_at": oud, "updated_at": oud},
        {"id": "b", "status": "waiting_approval", "title": "Mail versturen", "created_at": oud, "updated_at": oud},
        {"id": "c", "status": "waiting_approval", "title": "Sleutel roteren", "created_at": oud, "updated_at": oud},
        {"id": "d", "status": "waiting_approval", "title": "Net gevraagd", "created_at": NU.isoformat(), "updated_at": NU.isoformat()},
    ]
    # b heeft een open kaart; c is een sleutel (blijft); d is te vers.
    assert [r["id"] for r in pb.wees_wachters(rijen, {"b"}, NU)] == ["a"]


def test_vastgelopen_actieve_taken_pas_dood_na_zes_uur():
    from datetime import timedelta
    rijen = [
        # 23 nov: precies de taak uit het veld -- 2 dagen in 'running', geen beweging.
        {"id": "dood1", "status": "running", "title": "Zelf oplossen: Sleutel dax-northsea-01 werkt niet",
         "updated_at": (NU - timedelta(days=2)).isoformat()},
        {"id": "dood2", "status": "verifying", "title": "Oudste dood", "updated_at": (NU - timedelta(hours=7)).isoformat()},
        # Binnen actief_vast (>2u) maar nog geen 6u: nog een eerlijke poging, niet force-failen.
        {"id": "nog_bezig", "status": "running", "title": "Nog bezig", "updated_at": (NU - timedelta(hours=3)).isoformat()},
        {"id": "net_begonnen", "status": "planning", "title": "Net begonnen", "updated_at": NU.isoformat()},
        {"id": "wacht", "status": "queued", "title": "In de wachtrij", "updated_at": (NU - timedelta(days=2)).isoformat()},
    ]
    dood = pb.vastgelopen_actieve_taken(rijen, NU)
    assert [r["id"] for r in dood] == ["dood1", "dood2"]  # oudste eerst


def test_vastgelopen_zelf_oplossen_taak_wordt_force_failed_niet_opnieuw_gespawnd():
    """23 nov, het veld: 'Zelf oplossen: Sleutel dax-northsea-01 werkt niet' stond
    2 dagen in 'running'. Die self-fix-taak kan de eigen rij nooit zelf sluiten
    (geen schrijfrecht op core_tasks), dus moet projectsmgr het zelf doen --
    in plaats van elke pulse opnieuw een even onuitvoerbare taak te spawnen."""
    from datetime import timedelta
    db = FakeDb()
    db.db["core_tasks"] = [
        {"id": "stuck1", "status": "running", "title": "Zelf oplossen: Sleutel dax-northsea-01 werkt niet",
         "assignee": "projectsmgr", "requested_by": "projectsmgr",
         "updated_at": (NU - timedelta(days=2)).isoformat(), "metadata": {"zelf_fix": "sleutel_technisch"}},
    ]
    uit = gm.run_projectsmgr(db, NU)
    assert uit["vastgelopen_gefaald"] == 1
    rij = next(r for r in db.rows("core_tasks") if r["id"] == "stuck1")
    assert rij["status"] == "failed"
    assert rij["metadata"]["reden"] == "vastgelopen: geen beweging, nooit afgesloten"
    assert rij["error"]["code"] == "stuck_no_progress"
    # Geen tweede, even onuitvoerbare "Zelf oplossen"-taak voor dezelfde melding.
    titels = [r.get("title") for r in db.rows("core_tasks")]
    assert titels.count("Zelf oplossen: Sleutel dax-northsea-01 werkt niet") == 1
    chat = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "projectsmgr" and r["to_agent"] == "luka"]
    assert chat and "vastgelopen" in chat[0]["body"]


def test_nog_geen_zes_uur_blijft_bij_bestaande_actief_vast_pad():
    """Regressie: een taak die nog maar 3 uur stilstaat (binnen actief_vast,
    buiten actief_dood) moet het bestaande 'eerst zelf proberen'-pad blijven
    volgen -- niet meteen force-failed worden."""
    from datetime import timedelta
    db = FakeDb()
    db.db["core_tasks"] = [
        {"id": "nog1", "status": "running", "title": "Nog bezig met iets", "assignee": "code-agent",
         "updated_at": (NU - timedelta(hours=3)).isoformat(), "metadata": {}},
    ]
    uit = gm.run_projectsmgr(db, NU)
    assert uit["vastgelopen_gefaald"] == 0
    rij = next(r for r in db.rows("core_tasks") if r["id"] == "nog1")
    assert rij["status"] == "running"
    assert "actief_vast" in uit["bevindingen"]
    assert "Zelf oplossen: Taken hangen halverwege" in [r.get("title") for r in db.rows("core_tasks")]


def test_wachtrij_zonder_pogingen_krijgt_er_een_terug():
    """25 nov: 17 taken stonden sinds 24 nov 01:35 op queued met attempt 3/3; de worker
    pakt alleen attempt < max_attempts, dus niemand pakte ze ooit nog op."""
    db = FakeDb()
    db.db["core_tasks"] = [
        {"id": "z1", "status": "queued", "title": "Zet marketTide op de feed", "assignee": "tradingos",
         "attempt": 3, "max_attempts": 3, "updated_at": NU.isoformat(), "metadata": {}},
        {"id": "z2", "status": "queued", "title": "Gewoon in de rij", "assignee": "tradingos",
         "attempt": 1, "max_attempts": 3, "updated_at": NU.isoformat(), "metadata": {}},
    ]
    uit = gm.run_projectsmgr(db, NU)
    assert uit["poging_terug"] == 1
    z1 = next(r for r in db.rows("core_tasks") if r["id"] == "z1")
    z2 = next(r for r in db.rows("core_tasks") if r["id"] == "z2")
    assert z1["attempt"] == 2 and z1["metadata"]["poging_terug"]["was"] == 3
    assert z2["attempt"] == 1
    assert any(e.get("event_type") == "task.unstuck" for e in db.rows("core_task_events"))
