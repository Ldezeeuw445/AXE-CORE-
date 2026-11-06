"""Mailwachter: een getekend document moet binnen een minuut bij Luka zijn.

Voorbeeld uit de echte desk: Harcros stuurde 29 okt NCNDA+FPA getekend terug.
Dat soort mail is "nu" (melding + kaart); een gewone reactie is een melding;
een afwezigheidsbericht of testrecord is niets. En nooit twee keer.
"""
import asyncio
from datetime import datetime, timezone

import northsea_mailwachter as mw
from test_northsea_bewaker import FakeDb

NU = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)


def mail(cid, onderwerp, preview="", minuten=5, **extra):
    return {"communication_id": cid, "direction": "inbound", "channel": "email",
            "occurred_at": f"2026-11-06T11:{60 - minuten:02d}:00+00:00",
            "subject": onderwerp, "preview": preview, "counterparty": {"name": "Harcros"}, **extra}


GETEKEND = mail("c1", "RE: NCNDA + FPA", "Please find attached the signed NCNDA and FPA.", deal="DEAL-002")
GEWOON = mail("c2", "Re: copper cathode availability", "Thanks, we will come back to you next week.", minuten=3)
AFWEZIG = mail("c3", "Automatic reply: copper", "I am out of the office until 10 Nov.")
TEST = mail("c4", "Signed contract", is_synthetic=True)


def test_getekend_document_is_nu():
    m = mw.beoordeel_mail(GETEKEND)
    assert m.niveau == "nu"
    assert "getekend document" in m.reden and "juridisch document" in m.reden
    assert m.titel.startswith("NorthSea mail van Harcros")
    assert ":" not in m.titel and len(m.titel) <= 78  # push knipt op ": "
    assert "DEAL-002" in m.detail


def test_gewone_reactie_is_wel_een_melding_maar_geen_kaart():
    assert mw.beoordeel_mail(GEWOON).niveau == "gewoon"


def test_afwezig_en_testrecords_zijn_geen_nieuws():
    assert mw.beoordeel_mail(AFWEZIG) is None
    assert mw.beoordeel_mail(TEST) is None
    assert mw.beoordeel_mail(dict(GEWOON, direction="outbound")) is None


def test_systeempost_zonder_tegenpartij_is_geen_nieuws():
    # Letterlijk de laatste inbound voor de stilte (8 okt).
    google = {"communication_id": "c6", "direction": "inbound", "channel": "email",
              "subject": "Your Google Workspace billing information was received",
              "counterparty": None, "contact": None, "analysis": {"classification": "unknown"},
              "preview": "Thanks for providing your billing info."}
    assert mw.beoordeel_mail(google) is None
    # Maar een getekend document van een onbekend adres wel.
    assert mw.beoordeel_mail(dict(google, subject="Signed NCNDA attached")).niveau == "nu"


def test_concept_dat_wacht_maakt_het_belangrijk():
    m = mw.beoordeel_mail(mail("c5", "Re: offer", analysis={"requires_human_approval": True}))
    assert m.niveau == "nu" and "concept wacht op jouw ok" in m.reden


def test_oude_mail_buiten_het_venster_niet():
    oud = dict(GETEKEND, communication_id="c9", occurred_at="2026-11-05T20:00:00+00:00")
    assert [m.communicatie_id for m in mw.nieuwe([oud, GEWOON, GETEKEND], NU)] == ["c1", "c2"]


def _claim():
    gezien = set()

    def claim(job, sleutel):
        if (job, sleutel) in gezien:
            return False
        gezien.add((job, sleutel))
        return True
    return claim


def _ophaler(items):
    async def f(actie, params):
        assert actie == "list_recent_inbound"
        return {"result": {"items": items}}
    return f


def test_ronde_meldt_kaart_en_melding_en_nooit_twee_keer():
    db, claim = FakeDb(), _claim()
    o = _ophaler([GETEKEND, GEWOON, AFWEZIG, TEST])
    uit = asyncio.run(mw.ronde(db, claim, NU, o))
    assert uit == {"nu": 1, "gewoon": 1, "al_gemeld": 0}
    kaart = db.rows("core_approvals")[0]
    assert kaart["kind"] == "northsea_mail" and kaart["task_id"]
    assert kaart["metadata"]["northsea_communication_id"] == "c1"
    berichten = [r["message"] for r in db.rows("core_notifications")]
    assert len(berichten) == 2
    assert any(b.startswith("NorthSea mail van Harcros - RE  NCNDA + FPA: Belangrijk") for b in berichten)

    tweede = asyncio.run(mw.ronde(db, claim, NU, o))
    assert tweede == {"nu": 0, "gewoon": 0, "al_gemeld": 2}
    assert len(db.rows("core_notifications")) == 2


def test_gateway_kent_de_leesactie_en_niets_schrijvends():
    import northsea_gateway as g
    spec = g.ACTIONS["list_recent_inbound"]
    assert spec.tool == "northsea_list_recent_inbound" and not spec.fixed
