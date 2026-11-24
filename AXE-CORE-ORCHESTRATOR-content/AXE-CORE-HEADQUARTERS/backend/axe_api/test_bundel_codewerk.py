"""Codewerk van een manager wordt één taak (24 nov live: drie taken, drie worktrees)."""
import manager_werk as mw

OPDRACHT = ("Laat op de Mac mini met claude_code.run één test toevoegen in backend/axe_api/test_push_meldingen.py, "
            "draai pytest, commit op de eigen branch. Niet mergen.")


def test_drie_codestappen_worden_een_taak_met_de_opdracht_letterlijk():
    taken = ["Voeg in backend/axe_api/test_push_meldingen.py een test toe.",
             "Voer pytest op dat testbestand uit.",
             "Commit de wijziging op een nieuwe branch."]
    uit = mw.bundel_codewerk(taken, OPDRACHT)
    assert len(uit) == 1
    assert "(1) Voeg in" in uit[0] and "(3) Commit" in uit[0]
    assert "Mac mini" in uit[0] and "Niet mergen" in uit[0]


def test_gewone_taken_blijven_los():
    taken = ["Zoek uit waarom feed X niet ververst.", "Kijk of de Groq-sleutel nog werkt."]
    assert mw.bundel_codewerk(taken, "Waarom is de feed oud?") == taken


def test_geen_taken_blijft_geen_taken():
    assert mw.bundel_codewerk([], OPDRACHT) == []


def test_ronde_maakt_een_taak_van_codewerk():
    from datetime import datetime, timedelta, timezone
    from test_manager_betrouwbaar import DB
    nu = datetime.now(timezone.utc)
    db = DB()
    db.rijen["core_manager_messages"] = [{"id": "m1", "from_agent": "luka", "to_agent": "axemanager",
                                         "kind": "directive", "body": OPDRACHT,
                                         "created_at": (nu - timedelta(minutes=5)).isoformat()}]
    antwoord = ('{"antwoord": "Ik ga het doen", "taken": ["Voeg in backend/axe_api/test_push_meldingen.py een test toe",'
                ' "Draai pytest", "Commit op een branch"]}')
    mw.run(db, nu, chat=lambda m: (antwoord, "test"))
    taken = [r for r in db.rijen.get("core_tasks", []) if r.get("capability") == "agentic"]
    assert len(taken) == 1 and "Mac mini" in str(taken[0].get("goal") or taken[0].get("payload"))


def test_feed_reparatie_wordt_ook_een_taak_met_meting():
    opdracht = "De corporateJets-feed ververst sinds 01:35 niet meer (adsb_lol limiet 429). Laat hem weer verversen."
    taken = ["Bekijk de logs van de corporateJets-worker.", "Pas de worker-configuratie aan.",
             "Herstart de worker en controleer of de feed weer synchroniseert."]
    uit = mw.bundel_codewerk(taken, opdracht)
    assert len(uit) == 1 and "(3) Herstart" in uit[0] and "corporateJets-feed" in uit[0]
    import acceptatie
    assert acceptatie.soort(uit[0]) == "feed"
