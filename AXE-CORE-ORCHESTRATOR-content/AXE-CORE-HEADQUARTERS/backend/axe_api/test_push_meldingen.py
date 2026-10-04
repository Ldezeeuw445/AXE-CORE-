"""
Dezelfde voorbeelden als src/domain/pushBericht.test.ts.

Die twee bestanden zijn twee uitvoeringen van één regel -- de app bouwt de
melding in TypeScript, de zender hier in Python. Lopen ze uit elkaar, dan ziet
je slotscherm iets anders dan de bel in de app. Daarom staan hier letterlijk
dezelfde gevallen: wijzig je er één, dan wordt de ander rood.
"""
from push_meldingen import push_bericht_van, tag_van, titel_en_detail


def rij(message, **over):
    return {"id": "n1", "type": "warning", "message": message, **over}


def test_splitst_onderwerp_en_detail():
    p = push_bericht_van(rij("OpenAI (Primair) is niet meer bereikbaar: AXE valt terug op Groq."))
    assert p["titel"] == "OpenAI (Primair) is niet meer bereikbaar"
    assert p["body"] == "AXE valt terug op Groq."


def test_herhaalt_de_titel_niet_als_body():
    p = push_bericht_van(rij("Backup klaar"))
    assert p["titel"] == "Backup klaar"
    assert p["body"] == ""


def test_een_bui_krijgt_een_tag():
    a = push_bericht_van(rij("Provider weggevallen: 3 van de 5 modellen antwoorden niet"))
    b = push_bericht_van(rij("Provider weggevallen: 4 van de 5 modellen antwoorden niet"))
    assert a["tag"] == b["tag"]


def test_ander_onderwerp_andere_tag():
    a = push_bericht_van(rij("Provider weggevallen: iets"))
    b = push_bericht_van(rij("Taak klaar: iets anders"))
    assert a["tag"] != b["tag"]


def test_springt_naar_de_plek_waar_het_over_gaat():
    assert push_bericht_van(rij("Agent gestopt: de crew gaf een fout"))["url"] == "/agents"


def test_en_anders_naar_de_app_zelf():
    assert push_bericht_van(rij("Zomaar iets zonder bekend onderwerp"))["url"] == "/"


def test_meldt_niets_bij_een_leeg_bericht():
    assert push_bericht_van(rij("")) is None
    assert push_bericht_van(rij("   ")) is None
    assert push_bericht_van({"id": "n1", "message": None}) is None


def test_tag_blijft_leesbaar_en_begrensd():
    p = push_bericht_van(rij("x" * 200))
    assert len(p["tag"]) <= 45
    assert p["tag"].startswith("axe-")


def test_een_lange_eerste_regel_is_geen_onderwerp():
    # Zelfde grens als MAX_TITLE_LENGTH: een dubbele punt op tekenpositie 200
    # maakt geen kop die iemand kan lezen.
    lang = "a" * 200 + ": detail"
    titel, detail = titel_en_detail(lang)
    assert titel == lang
    assert detail == ""


def test_tag_zonder_bruikbare_letters():
    assert tag_van("123 !!!") == "axe-melding"
