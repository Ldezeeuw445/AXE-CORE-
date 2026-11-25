"""Vaste agents: ochtendbrief, roadmap-check, opruimlijst, weekreview (25 nov)."""
from datetime import datetime, timedelta, timezone

import staande_diensten
import vaste_briefs as vb

NU = datetime(2026, 11, 26, 7, 0, tzinfo=timezone.utc)


def _t(**kw):
    basis = {"id": kw.pop("id"), "title": kw.pop("title", "taak"), "status": kw.pop("status"), "metadata": {},
             "created_at": (NU - timedelta(hours=2)).isoformat(), "updated_at": (NU - timedelta(hours=2)).isoformat()}
    basis.update(kw)
    return basis


DATA = {
    "taken": [
        _t(id="k1", title="Feed corporateJets gerepareerd", status="completed", completed_at=(NU - timedelta(hours=3)).isoformat()),
        _t(id="f1", title="Zelf oplossen: Vaste jobs", status="failed",
           error={"code": "handler_error", "message": "used all 40 steps without a verified result"}),
        _t(id="p1", title="Oud voorstel", status="pending", created_at=(NU - timedelta(days=40)).isoformat(),
           metadata={"app": "axe_core"}),
        _t(id="p2", title="Nieuw voorstel", status="pending", metadata={"app": "trading_os"}),
    ],
    "approvals": [{"id": "a1", "title": "Mag codex.run op de Mac mini?", "status": "pending"}],
    "feeds": [{"feed_id": "corporateJets", "last_error": ""}, {"feed_id": "marketTide", "last_error": "401 key"}],
    "roosters": [{"name": "Planner", "consecutive_failures": 3, "enabled": True}],
}


def test_ochtendbrief_zet_wat_op_luka_wacht_bovenaan():
    tekst = vb.ochtendbrief(DATA, NU)
    assert "1 tasks done, 1 failed, 1 waiting on you" in tekst
    assert tekst.index("Needs you:") < tekst.index("Done:") < tekst.index("Failed:")
    assert "Mag codex.run op de Mac mini?" in tekst and "marketTide: 401 key" in tekst and "Planner (3x)" in tekst


def test_rustige_ochtend_zegt_dat():
    leeg = {"taken": [], "approvals": [], "feeds": [], "roosters": []}
    assert "Nothing needs you and nothing is broken." in vb.ochtendbrief(leeg, NU)


def test_roadmap_telt_open_per_app_en_toont_de_oudste():
    tekst = vb.roadmap(DATA, NU)
    assert "2 open proposals" in tekst and "axe_core: 1" in tekst and "trading_os: 1" in tekst
    assert tekst.index("Oud voorstel") < tekst.index("Nieuw voorstel")


def test_opruimlijst_wist_niets_en_noemt_oude_voorstellen_en_falende_jobs():
    tekst = vb.opruimlijst(DATA, NU)
    assert "Nothing is removed without your yes." in tekst
    assert "Oud voorstel" in tekst and "Nieuw voorstel" not in tekst
    assert "Planner (3x in a row)" in tekst


def test_weekreview_noemt_cijfers_en_foutoorzaken():
    tekst = vb.weekreview(DATA, NU)
    assert "1 done, 1 failed" in tekst and "used all 40 steps" in tekst
    assert "Intel feeds: 1 of 2 healthy." in tekst


def test_de_vier_briefs_staan_als_vaste_dienst_in_de_catalogus():
    for soort, cron in (("ochtendbrief", "0 8 * * *"), ("roadmap", "15 8 * * 1"),
                        ("opruimlijst", "30 16 * * 5"), ("weekreview", "0 18 * * 0")):
        d = staande_diensten.catalogus_voor(f"brief-{soort}")
        assert d and d["cron_expr"] == cron and d["job_key"] == f"axe_core:staande-brief-{soort}"


def test_verzamel_laat_mac_stapjes_en_overgeslagen_jobs_weg():
    class Q:
        def __init__(self, rijen): self.rijen, self.f = rijen, []
        def select(self, *_): return self
        def gte(self, *_): return self
        def order(self, *_, **__): return self
        def limit(self, *_): return self
        def neq(self, k, v): self.f.append(lambda r: r.get(k) != v); return self
        def eq(self, k, v): self.f.append(lambda r: r.get(k) == v); return self
        def execute(self):
            class R: pass
            r = R(); r.data = [x for x in self.rijen if all(f(x) for f in self.f)]; return r

    tabellen = {
        "core_tasks": [{"id": "m", "capability": "computer_use", "status": "completed"},
                       {"id": "t", "capability": "agentic", "status": "completed"}],
        "core_approvals": [], "intel_sync_log": [],
        "core_schedules": [{"name": "Review Desk", "enabled": True, "consecutive_failures": 15, "last_status": "skipped"},
                           {"name": "Planner", "enabled": True, "consecutive_failures": 3, "last_status": "fail"}],
    }

    class Db:
        def table(self, n): return Q(tabellen[n])
    d = vb.verzamel(Db(), NU)
    assert [t["id"] for t in d["taken"]] == ["t"]
    assert [r["name"] for r in d["roosters"]] == ["Planner"]
