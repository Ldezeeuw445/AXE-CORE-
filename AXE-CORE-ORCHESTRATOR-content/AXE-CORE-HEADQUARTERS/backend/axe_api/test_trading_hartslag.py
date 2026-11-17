"""Trading Team: aanhoudend NO-DATA en een stille runner geven één warning (17 nov 2026)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import planning
import roosters_bewaker as rb

NU = datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc)


class _Res:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, db, tabel):
        self.db, self.tabel, self.filters, self.rij, self.sort, self.n = db, tabel, [], None, None, None

    def select(self, *_a):
        return self

    def eq(self, k, v):
        self.filters.append(lambda r: r.get(k) == v)
        return self

    def like(self, k, patroon):
        voor = patroon.rstrip("%")
        self.filters.append(lambda r: str(r.get(k, "")).startswith(voor))
        return self

    def gt(self, k, v):
        self.filters.append(lambda r: str(r.get(k, "")) > v)
        return self

    def order(self, k, desc=False):
        self.sort = (k, desc)
        return self

    def limit(self, n):
        self.n = n
        return self

    def insert(self, rij):
        self.rij = rij
        return self

    def execute(self):
        if self.tabel in self.db.kapot:
            raise RuntimeError("HTTP 502")
        rijen = self.db.tabellen.setdefault(self.tabel, [])
        if self.rij is not None:
            rijen.append({**self.rij, "read": False, "created_at": NU.isoformat()})
            return _Res([self.rij])
        uit = [r for r in rijen if all(f(r) for f in self.filters)]
        if self.sort:
            uit.sort(key=lambda r: str(r.get(self.sort[0]) or ""), reverse=self.sort[1])
        return _Res(uit[: self.n] if self.n else uit)


class NepDB:
    def __init__(self, runs=None, kapot=()):
        self.tabellen = {"core_trading_team_runs": list(runs or []), "core_notifications": []}
        self.kapot = set(kapot)

    def table(self, t):
        return _Q(self, t)

    @property
    def meldingen(self):
        return self.tabellen["core_notifications"]


def run(min_geleden, verdict="NO-DATA", status="completed", code="eodhd_402"):
    return {"created_at": (NU - timedelta(minutes=min_geleden)).isoformat(), "status": status, "mode": "test",
            "verdict": verdict, "decision": {"notes": ["no_data", code]} if verdict == "NO-DATA" else {}}


def schema(min_geleden=10, status="ok", fouten=0, aan=True, volgende_min=5, **extra):
    return {"id": "t", "job_key": rb.TRADING_JOB, "name": "Trading Team TEST (15m, Mac)", "enabled": aan,
            "last_run_at": (NU - timedelta(minutes=min_geleden)).isoformat() if min_geleden is not None else None,
            "last_status": status, "consecutive_failures": fouten, "last_result": "exit=0\n",
            "next_run_at": (NU + timedelta(minutes=volgende_min)).isoformat(),
            "lease_owner": None, "lease_until": None, "metadata": {}, **extra}


# ── NO-DATA ──────────────────────────────────────────────────────────────────

def test_reeks_telt_vanaf_de_nieuwste_en_breekt_op_data():
    assert rb.no_data_reeks([run(1), run(16), run(31), run(46, "NO-GO"), run(61)]) == 3
    assert rb.no_data_reeks([run(1, "WAIT"), run(16), run(31)]) == 0
    # Een lopende run (nog geen verdict) breekt de reeks niet.
    assert rb.no_data_reeks([{"status": "running", "verdict": None}, run(16), run(31), run(46)]) == 3
    # BLOCKED of een fout is ook geen NO-DATA.
    assert rb.no_data_reeks([run(1), run(16, "BLOCKED", "blocked"), run(31)]) == 1


def test_drie_keer_no_data_geeft_een_warning_voor_luka():
    db = NepDB([run(1), run(16), run(31)])
    uit = rb.trading_ronde(db, [schema()], NU)
    assert uit["no_data"] == 3 and uit["notified"] == ["no_data"]
    [m] = db.meldingen
    assert m["type"] == "warning" and m["recipient"] == "acff7a12-1111-481d-a7a9-cc07583b8069"
    assert m["message"].startswith("Trading geen koersdata: de laatste 3 Trading Team-runs")
    assert "eodhd_402" in m["message"]


def test_twee_keer_no_data_is_nog_geen_melding():
    db = NepDB([run(1), run(16), run(31, "NO-GO")])
    assert rb.trading_ronde(db, [schema()], NU)["notified"] == []
    assert db.meldingen == []


def test_niet_opnieuw_zolang_ongelezen():
    db = NepDB([run(1), run(16), run(31), run(46)])
    rb.trading_ronde(db, [schema()], NU)
    rb.trading_ronde(db, [schema()], NU)
    assert len(db.meldingen) == 1
    # Gelezen? Dan mag een nieuwe reeks wel weer melden.
    db.meldingen[0]["read"] = True
    rb.trading_ronde(db, [schema()], NU)
    assert len(db.meldingen) == 2


def test_oude_reeks_meldt_niet():
    # Laatste NO-DATA-run is 3 uur oud: de runner draait niet, dat is de hartslag.
    db = NepDB([run(180), run(195), run(210)])
    assert "no_data" not in rb.trading_ronde(db, [schema()], NU)["notified"]


def test_job_uit_of_afwezig_meldt_niets():
    db = NepDB([run(1), run(16), run(31)])
    assert rb.trading_ronde(db, [schema(aan=False)], NU)["notified"] == []
    assert rb.trading_ronde(db, [], NU)["notified"] == []
    assert db.meldingen == []


def test_tabel_onleesbaar_breekt_de_hartslag_niet():
    db = NepDB(kapot={"core_trading_team_runs"})
    uit = rb.trading_ronde(db, [schema(min_geleden=60)], NU)
    assert uit["error"] and uit["notified"] == ["stil"]


def test_companion_manager_pulse_draait_de_trading_ronde():
    import grok_managers as gm
    from test_roosters_bewaker import FakeDb

    db = FakeDb()
    db.db["core_schedules"] = [schema(min_geleden=60, volgende_min=-45)]
    uit = gm.run_companionmgr(db, NU)
    assert uit["trading"]["enabled"] is True and uit["trading"]["stil"] is True


# ── Hartslag ─────────────────────────────────────────────────────────────────

def test_stil_na_45_minuten():
    assert rb.trading_stil(schema(min_geleden=40), NU) is None
    reden = rb.trading_stil(schema(min_geleden=60, volgende_min=-45), NU)
    assert reden and "60 min" in reden and "niet opgepakt" in reden


def test_stil_geeft_een_warning_met_reden():
    db = NepDB()
    uit = rb.trading_ronde(db, [schema(min_geleden=60, volgende_min=-45)], NU)
    assert uit["stil"] and uit["notified"] == ["stil"]
    [m] = db.meldingen
    assert m["type"] == "warning" and m["message"].startswith("Trading runner stil/faalt: Trading Team draaide niet meer")
    rb.trading_ronde(db, [schema(min_geleden=80, volgende_min=-65)], NU)
    assert len(db.meldingen) == 1


def test_terugval_rust_na_veel_fouten_is_al_gemeld():
    """26x MetaAPI 504 (17 nov): _meld_run en 'Vaste jobs falen achter elkaar' melden dit al."""
    s = schema(min_geleden=200, status="fail", fouten=26, volgende_min=160,
               last_result="exit=1\nREFUSE: MetaAPI account-information failed: 504")
    assert rb.trading_stil(s, NU) is None
    assert rb.FAALT_AL_GEMELD_VANAF == planning.MAX_FAILS
    # En de bestaande bevinding noemt hem wel.
    assert "jobs_falen" in [b.code for b in rb.beoordeel([s], NU)]


def test_enkele_fouten_en_stil_meldt_wel_met_laatste_regel():
    s = schema(min_geleden=60, status="fail", fouten=2, volgende_min=-45,
               last_result="exit=1\nREFUSE: MetaAPI account-information failed: 504")
    reden = rb.trading_stil(s, NU)
    assert "2x mislukt op rij" in reden and "504" in reden


def test_loopt_nu_nooit_gedraaid_of_afgevoerd():
    loopt = schema(min_geleden=60, lease_owner="mac:mini:1",
                   lease_until=(NU + timedelta(minutes=5)).isoformat())
    assert rb.trading_stil(loopt, NU) is None
    assert rb.trading_stil(schema(min_geleden=None), NU) is None
    assert rb.trading_stil(schema(min_geleden=60 * 24 * 8), NU) is None
    assert rb.trading_stil(schema(min_geleden=60, aan=False), NU) is None
