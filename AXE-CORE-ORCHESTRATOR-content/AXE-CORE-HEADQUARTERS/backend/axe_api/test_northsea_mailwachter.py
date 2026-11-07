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
    assert uit == {"nu": 1, "gewoon": 1, "al_gemeld": 0, "analyses": 1}
    analyse = next(r for r in db.rows("core_tasks") if r.get("requested_by") == mw.ANALYSE_DOOR)
    assert analyse["assignee"] == "northseamgr" and analyse["execution_mode"] == "read"
    assert analyse["payload"]["free_models"] is True and "c1" in analyse["goal"]
    kaart = db.rows("core_approvals")[0]
    assert kaart["kind"] == "northsea_mail" and kaart["task_id"]
    assert kaart["metadata"]["northsea_communication_id"] == "c1"
    berichten = [r["message"] for r in db.rows("core_notifications")]
    assert len(berichten) == 2
    assert any(b.startswith("NorthSea mail van Harcros - RE  NCNDA + FPA: Belangrijk") for b in berichten)

    tweede = asyncio.run(mw.ronde(db, claim, NU, o))
    assert tweede == {"nu": 0, "gewoon": 0, "al_gemeld": 2, "analyses": 0}
    assert len(db.rows("core_notifications")) == 2


def test_gateway_kent_de_leesactie_en_niets_schrijvends():
    import northsea_gateway as g
    spec = g.ACTIONS["list_recent_inbound"]
    assert spec.tool == "northsea_list_recent_inbound" and not spec.fixed


def test_dagbudget_voor_duidingen():
    db = FakeDb()
    m = mw.beoordeel_mail(GETEKEND)
    for _ in range(mw.MAX_ANALYSES_PER_DAG):
        assert mw.zet_analyse_klaar(db, m, NU) is True
    assert mw.zet_analyse_klaar(db, m, NU) is False


def test_afgeronde_duiding_bereikt_luka_een_keer():
    import grok_managers as gm
    db = FakeDb()
    db.table("core_tasks").insert({"requested_by": mw.ANALYSE_DOOR, "status": "completed",
                                   "title": "Duiden: NorthSea mail van Harcros", "metadata": {},
                                   "result": {"summary": "Harcros stuurde NCNDA getekend terug. DEAL-002. Jij: tekenen."}}).execute()
    assert gm.meld_mailduidingen(db) == 1
    assert any("NCNDA getekend" in r.get("message", "") for r in db.rows("core_notifications"))
    assert any("NCNDA getekend" in (r.get("body") or "") for r in db.rows("core_manager_messages"))
    assert gm.meld_mailduidingen(db) == 0


def test_desk_agent_leest_alleen():
    import northsea_gateway as g
    from agent_workspace import AGENT_WORKSPACES
    for a in ("northsea", "northseamgr"):
        tools = AGENT_WORKSPACES[a]["tools"]
        assert "northsea_read" in tools and "write_file" not in tools
    for actie in g.AGENT_LEESACTIES:
        assert not g.ACTIONS[actie].tool.startswith(("northsea_research", "northsea_prepare", "northsea_send", "northsea_approve"))
