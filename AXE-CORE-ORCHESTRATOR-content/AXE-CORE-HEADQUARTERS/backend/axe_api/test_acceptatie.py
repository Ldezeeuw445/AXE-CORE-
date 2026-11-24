"""Sprint 3: acceptatie per taaktype, met een meting voor en na."""
import asyncio
from datetime import datetime, timedelta, timezone

import acceptatie as acc

NU = datetime(2026, 11, 24, 9, 0, tzinfo=timezone.utc)


class Db:
    def __init__(self, feeds, taken=None):
        self.feeds, self.taken, self.n = feeds, taken or [], None

    def table(self, n): self.n = n; self._f = []; return self
    def select(self, *_a): return self
    def limit(self, *_a): return self
    def eq(self, k, v): self._f.append((k, v)); return self

    def execute(self):
        if self.n == "intel_sync_log":
            data = [dict(r) for r in self.feeds]
        else:
            data = [t for t in self.taken if all(t.get(k) == v for k, v in self._f)]
        return type("R", (), {"data": data})()


OUD = (NU - timedelta(days=3)).isoformat()


def test_soort_per_opdracht():
    assert acc.soort("Repareer de corporateJets intel-feed die niet ververst") == "feed"
    assert acc.soort("Voeg een test toe in backend/axe_api/test_push_meldingen.py") == "code"
    assert acc.soort("De Groq API key weigert, regel een nieuwe") == "sleutel"
    assert acc.soort("Zoek uit waarom de planner gisteren stilviel") == "onderzoek"
    assert acc.soort("Zet de agenda van morgen klaar") == "overig"


def test_feed_taak_meet_vooraf_en_zet_het_in_het_doel():
    db = Db([{"feed_id": "corporateJets", "last_sync_at": OUD, "last_error": "timeout"},
             {"feed_id": "marketTide", "last_sync_at": NU.isoformat(), "last_error": ""}])
    a = acc.maak(db, "Repareer de corporate jets feed die niet ververst")
    assert a["soort"] == "feed" and a["feeds"] == ["corporateJets"]
    assert a["voor"]["corporateJets"]["last_error"] == "timeout"
    tekst = acc.doel_tekst(a)
    assert "ACCEPTATIE (feed" in tekst and "corporateJets" in tekst and "timeout" in tekst


def test_niet_ververst_is_niet_gehaald_en_weigert_klaar():
    a = {"soort": "feed", "feeds": ["corporateJets"],
         "voor": {"corporateJets": {"last_sync_at": OUD, "last_error": "timeout"}}}
    zelfde = acc.oordeel(a, {"corporateJets": {"last_sync_at": OUD, "last_error": ""}})
    assert zelfde["gehaald"] is False and "NIET gehaald" in zelfde["regel"]
    assert "Je bent NIET klaar" in acc.weigering(zelfde)
    fout = acc.oordeel(a, {"corporateJets": {"last_sync_at": NU.isoformat(), "last_error": "401"}})
    assert fout["gehaald"] is False


def test_ververst_zonder_fout_is_gehaald():
    a = {"soort": "feed", "feeds": ["corporateJets"],
         "voor": {"corporateJets": {"last_sync_at": OUD, "last_error": "timeout"}}}
    o = acc.oordeel(a, {"corporateJets": {"last_sync_at": NU.isoformat(), "last_error": ""}})
    assert o["gehaald"] is True and acc.weigering(o) is None
    assert "voor " + OUD in o["regel"] and "gehaald" in o["regel"]


def test_andere_soorten_blokkeren_niet():
    assert acc.oordeel({"soort": "code", "criteria": []}, {}) is None
    assert acc.na_meting(Db([]), {"metadata": {"acceptatie": {"soort": "onderzoek"}}}) is None
    assert acc.na_meting(Db([]), {"metadata": {}}) is None


def test_maak_taak_neemt_acceptatie_mee():
    import manager_werk as mw
    from test_manager_betrouwbaar import DB
    db = DB()
    db.rijen["intel_sync_log"] = [{"feed_id": "corporateJets", "last_sync_at": OUD, "last_error": "timeout"}]
    t = mw.maak_taak(db, "tradingos", "Repareer de corporateJets feed die niet ververst", NU, "m1")
    assert t["metadata"]["acceptatie"]["voor"]["corporateJets"]["last_error"] == "timeout"
    assert "ACCEPTATIE (feed" in t["goal"]


def test_lus_weigert_klaar_als_de_feed_niet_ververste(monkeypatch, tmp_path):
    """De echte lus: bewijs slaagt, maar de acceptatie meet opnieuw en weigert."""
    import agent_loop as al
    monkeypatch.setattr(al, "WORKSPACE", str(tmp_path))
    taak = {"id": "t1", "metadata": {"acceptatie": {
        "soort": "feed", "feeds": ["corporateJets"],
        "voor": {"corporateJets": {"last_sync_at": OUD, "last_error": "timeout"}}}}}
    db = Db([{"feed_id": "corporateJets", "last_sync_at": OUD, "last_error": ""}], [taak])
    monkeypatch.setattr(al, "_stoel_db", lambda: db)
    stappen = iter([
        {"parts": [{"functionCall": {"name": "finish", "args": {
            "summary": "Feed gerepareerd.", "verify_command": "echo feed-ok", "expect_in_output": "feed-ok"}}}]},
        {"parts": [{"functionCall": {"name": "finish", "args": {
            "summary": "Het lukte niet: de bron geeft nog steeds geen data.",
            "verify_command": "echo bron-leeg", "expect_in_output": "bron-leeg"}}}]},
    ])

    async def model(_c, _k):
        return next(stappen)

    monkeypatch.setattr(al, "_call_model", model)
    events = []

    async def ev(soort, tekst, data=None):
        events.append((soort, tekst))

    uit = asyncio.run(al.run_agent_loop("Repareer de corporateJets feed", "t1", ev))
    assert any(s == "verification.failed" and "Acceptance not met" in t for s, t in events)
    assert uit["summary"].startswith("MILESTONE: blocked")


def test_verslag_toont_de_meting_voor_en_na():
    import taak_verslag as tv
    v = tv.verslag({"title": "x"}, "completed", {"summary": "Feed gerepareerd.", "verification": {"passed": True},
                                                 "acceptatie": {"regel": "feed corporateJets: voor a -> na b = gehaald"}})
    assert "acceptatie: feed corporateJets: voor a -> na b = gehaald" in v["werkte"]
