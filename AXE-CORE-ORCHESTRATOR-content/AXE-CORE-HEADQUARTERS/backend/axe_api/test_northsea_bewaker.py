"""NorthSea-bewaker: met de echte stand van 6 november als voorbeeld.

Die dag zei de planner elk kwartier "ok", terwijl er drie weken geen mail
binnenkwam en de motor sinds 29 oktober niet meer tikte. Beide moeten Luka
bereiken; een gezonde desk mag hem niet lastigvallen.
"""
from datetime import datetime, timezone

import grok_managers as gm
import northsea_bewaker as nb
from test_staande_diensten import FakeDb as _BasisDb, FakeQuery


class _Query(FakeQuery):
    """Plus like/gt, die de ontdubbeling van meldingen gebruikt."""

    def like(self, k, patroon):
        self.prefix = (k, patroon.rstrip("%"))
        return self

    def gt(self, _k, _v):
        return self

    def gte(self, _k, _v):
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        uit = super().execute()
        if self.op == "select" and getattr(self, "prefix", None):
            k, p = self.prefix
            uit.data = [r for r in uit.data if str(r.get(k) or "").startswith(p)]
        return uit


class FakeDb(_BasisDb):
    def table(self, name):
        return _Query(self.db, name)

    def rows(self, name):
        return self.db.get(name, [])

NU = datetime(2026, 11, 6, 9, 30, tzinfo=timezone.utc)

# Planner liep om 09:30 echt (core_job_runs van 6 nov).
HEALTH_OK = {"database": {"reachable": True},
             "scheduler": {"enabled": True, "last_status": "ok", "consecutive_failures": 0,
                           "last_run_at": "2026-11-06T09:30:32+00:00"}}

# Letterlijk de weekcijfers van 6 nov (northsea_get_communications_metrics).
METRICS_6NOV = {"by_week": {
    "2026-09-28": {"outbound": 12, "inbound": 6},
    "2026-10-05": {"internal": 6, "inbound": 2, "outbound": 1},
    "2026-10-12": {"internal": 29, "outbound": 7},
    "2026-10-19": {"outbound": 33},
    "2026-10-26": {"outbound": 26, "internal": 22},
    "2026-11-02": {"internal": 28, "outbound": 28},
}}

OPS_6NOV = {
    "recently_completed": [{"actor": "engine", "action": "engine_tick", "at": "2026-10-29T08:30:30+00:00"}],
    "next_scheduled": {"enabled": True, "last_status": "ok", "consecutive_failures": 0},
    "approval_required": {"count": 72, "items": [{"subject": "Re: Grade A copper cathode — 100 MT trial CIF Nhava Sheva"}]},
    "waiting": {"chase_waiting_reply": 38},
}


def codes(b):
    return [x.code for x in b]


def test_6_november_alleen_de_mail_is_stil():
    # Het auditlog zegt "laatste tick 29 okt" (afgekapt), de planner liep om 09:30:
    # dat mag GEEN valse "motor draait niet" geven.
    b = nb.beoordeel(HEALTH_OK, OPS_6NOV, METRICS_6NOV, NU)
    voor_luka = [x.code for x in b if x.voor == "luka"]
    assert voor_luka == ["inbound_stil"]
    assert codes(b)[-1] == "wachtrij"  # alleen info, en achteraan
    stil = next(x for x in b if x.code == "inbound_stil")
    assert "2026-10-05" in stil.detail and "Routing" in stil.detail


def test_lopende_week_telt_niet_mee():
    # 2 nov is de lopende week; zonder die regel telde een halve week als "stil".
    m = {"by_week": {"2026-10-12": {"outbound": 9, "inbound": 1},
                     "2026-10-19": {"outbound": 9, "inbound": 1},
                     "2026-10-26": {"outbound": 9, "inbound": 1},
                     "2026-11-02": {"outbound": 50}}}
    assert "inbound_stil" not in codes(nb.beoordeel(HEALTH_OK, {}, m, NU))


def test_rustige_markt_is_geen_storing():
    # Weinig verstuurd en niets terug: dat is stilte, geen kapotte ontvangst.
    m = {"by_week": {k: {"outbound": 2} for k in ("2026-10-12", "2026-10-19", "2026-10-26")}}
    assert "inbound_stil" not in codes(nb.beoordeel(HEALTH_OK, {}, m, NU))


def test_planner_twee_uur_stil_is_wel_stilstand():
    h = dict(HEALTH_OK, scheduler=dict(HEALTH_OK["scheduler"], last_run_at="2026-11-06T07:00:00+00:00"))
    assert "motor_stil" in codes(nb.beoordeel(h, OPS_6NOV, {}, NU))


def test_planner_en_database_fouten():
    h = {"database": {"reachable": False}, "scheduler": {"last_status": "fail", "consecutive_failures": 3}}
    assert codes(nb.beoordeel(h, {}, {}, NU))[:2] == ["database_weg", "planner_fout"]


def _ophaler(health, ops, metrics):
    async def f(actie, params):
        return {"result": {"get_system_health": health, "get_live_operations": ops,
                           "get_communications_metrics": metrics}[actie]}
    return f


def test_manager_vraagt_luka_en_stuurt_melding():
    db = FakeDb()
    uit = gm.run_northseamgr(db, NU, ophaler=_ophaler(HEALTH_OK, OPS_6NOV, METRICS_6NOV))
    assert uit["gelezen"] is True
    assert uit["voor_luka"] == ["inbound_stil"]
    titels = [r.get("title") for r in db.rows("core_approvals")]
    assert "NorthSea: er komt geen mail meer binnen" in titels
    # core_approvals heeft geen kolommen wat/waarom; daarop faalde de insert
    # sinds 27 okt stil. Alleen echte kolommen, en gekoppeld aan een taak.
    kaart = db.rows("core_approvals")[0]
    assert not {"wat", "waarom"} & set(kaart)
    assert kaart["kind"] == "manager_ask" and kaart["task_id"]
    assert not any("motor" in (t or "") for t in titels)
    meldingen = [r.get("message", "") for r in db.rows("core_notifications")]
    assert any(m.startswith("NorthSea: er komt geen mail meer binnen") for m in meldingen)
    assert any(m.startswith("NorthSea vandaag 06-11") for m in meldingen)
    assert uit["sent"] == 0


def test_tweede_pulse_vraagt_niet_opnieuw():
    db = FakeDb()
    o = _ophaler(HEALTH_OK, OPS_6NOV, METRICS_6NOV)
    gm.run_northseamgr(db, NU, ophaler=o)
    gm.run_northseamgr(db, NU, ophaler=o)
    titels = [r.get("title") for r in db.rows("core_approvals")]
    assert titels.count("NorthSea: er komt geen mail meer binnen") == 1


def test_kan_hij_niet_lezen_dan_zegt_hij_dat():
    async def kapot(actie, params):
        raise RuntimeError("NORTHSEA_MCP_SERVICE_TOKEN is not set")
    db = FakeDb()
    uit = gm.run_northseamgr(db, NU, ophaler=kapot)
    assert uit["gelezen"] is False
    assert any("kan de desk niet lezen" in (r.get("body") or "") for r in db.rows("core_manager_messages"))
