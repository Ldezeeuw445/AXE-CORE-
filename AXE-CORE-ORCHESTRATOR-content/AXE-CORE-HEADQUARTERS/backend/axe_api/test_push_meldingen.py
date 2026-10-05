"""
Dezelfde voorbeelden als src/domain/pushBericht.test.ts.

Die twee bestanden zijn twee uitvoeringen van één regel -- de app bouwt de
melding in TypeScript, de zender hier in Python. Lopen ze uit elkaar, dan ziet
je slotscherm iets anders dan de bel in de app. Daarom staan hier letterlijk
dezelfde gevallen: wijzig je er één, dan wordt de ander rood.
"""
import asyncio
import json
import sys
import types
from datetime import datetime, timezone

from goedkeuring_melding import vraag_luka
from push_meldingen import (
    lees_abonnementen,
    push_bericht_van,
    stuur_meldingen,
    tag_van,
    titel_en_detail,
    verborgen,
)


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


def test_ook_als_de_cijfers_in_het_onderwerp_zelf_staan():
    # De bui hierboven heeft zijn cijfers in het DETAIL, dat nooit in de tag komt;
    # hier staan ze in het onderwerp dat de tag wordt.
    a = push_bericht_van(rij("3 van de 5 modellen antwoorden niet"))
    b = push_bericht_van(rij("4 van de 5 modellen antwoorden niet"))
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


# --- Privacy per apparaat: zelfde gevallen als pushBericht.test.ts ----------------


def test_verborgen_toont_geen_inhoud():
    p = verborgen(push_bericht_van(rij("OpenAI is niet meer bereikbaar: AXE valt terug op Groq.")))
    assert p["titel"] == "AXE has something"
    assert p["body"] == ""
    # Niets van het origineel mag nog in de tekst staan.
    assert "OpenAI" not in json.dumps(p)


def test_verborgen_meldingen_vervangen_elkaar():
    a = verborgen(push_bericht_van(rij("Provider weggevallen: iets")))
    b = verborgen(push_bericht_van(rij("Taak klaar: iets anders")))
    assert a["tag"] == b["tag"]


def test_verborgen_houdt_de_route_zodat_een_tik_nog_ergens_heen_gaat():
    assert verborgen(push_bericht_van(rij("Agent gestopt: de crew gaf een fout")))["url"] == "/agents"


class _Q:
    """Net genoeg Supabase om stuur_meldingen te laten lopen."""

    def __init__(self, db, naam):
        self.db, self.naam, self.actie = db, naam, "select"

    def select(self, *_a):
        return self

    def insert(self, rij):
        self.actie, self.rij = "insert", dict(rij)
        return self

    def is_(self, *_a):
        return self

    def gte(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def update(self, waarden):
        self.actie, self.waarden = "update", waarden
        return self

    def delete(self):
        self.actie = "delete"
        return self

    def eq(self, kolom, waarde):
        self.filter = (kolom, waarde)
        return self

    def execute(self):
        if self.actie == "insert":
            rij = getattr(self, "rij", {})
            if "id" not in rij:
                rij["id"] = f"{self.naam}-{len(self.db.tabellen[self.naam]) + 1}"
            self.db.tabellen[self.naam].append(rij)
            return type("R", (), {"data": [rij]})()
        if self.actie == "update":
            self.db.updates.append((self.naam, getattr(self, "filter", None), self.waarden))
            if self.naam == "core_notifications" and getattr(self, "filter", None):
                kolom, waarde = self.filter
                for rij in self.db.tabellen[self.naam]:
                    if str(rij.get(kolom)) == str(waarde):
                        rij.update(self.waarden)
        elif self.actie == "delete":
            self.db.deletes.append((self.naam, getattr(self, "filter", None)))
        else:
            return type("R", (), {"data": self.db.tabellen[self.naam]})()
        return type("R", (), {"data": []})()


class _Db:
    def __init__(self, meldingen, abonnementen, legacy=None):
        self.tabellen = {
            "core_notifications": meldingen,
            "core_push_subscriptions": abonnementen,
            "push_subscriptions": legacy or [],
            "core_approvals": [],
        }
        self.updates, self.deletes = [], []

    def table(self, naam):
        if naam not in self.tabellen:
            self.tabellen[naam] = []
        return _Q(self, naam)


def test_het_ene_apparaat_krijgt_de_inhoud_en_het_andere_niet(monkeypatch):
    verstuurd = {}

    def nep_webpush(subscription_info, data, **_k):
        verstuurd[subscription_info["endpoint"]] = json.loads(data)

    # Een nep-module in plaats van de echte: pywebpush staat niet in elke venv
    # (de lokale heeft hem niet), en deze test gaat over wie wat krijgt, niet over
    # het versleutelen.
    nep = types.ModuleType("pywebpush")
    nep.webpush = nep_webpush
    nep.WebPushException = type("WebPushException", (Exception,), {})
    monkeypatch.setitem(sys.modules, "pywebpush", nep)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "/nergens.pem")
    db = _Db(
        [{"id": "n1", "type": "warning", "message": "Provider weggevallen: Groq antwoordt niet",
          "created_at": "2026-10-04T12:00:00+00:00"}],
        [
            {"endpoint": "https://push/iphone", "p256dh": "x", "auth": "y", "verberg_inhoud": True},
            {"endpoint": "https://push/mac", "p256dh": "x", "auth": "y", "verberg_inhoud": False},
            # Kolom leeg (rij van vóór de migratie, of None): gedrag van vroeger.
            {"endpoint": "https://push/oud", "p256dh": "x", "auth": "y", "verberg_inhoud": None},
        ],
    )

    uit = asyncio.run(stuur_meldingen(lambda: db, nu=datetime(2026, 10, 4, 12, 0, 30, tzinfo=timezone.utc)))

    assert uit["verstuurd"] == 3
    assert verstuurd["https://push/iphone"]["titel"] == "AXE has something"
    assert "Groq" not in json.dumps(verstuurd["https://push/iphone"])
    assert verstuurd["https://push/mac"]["titel"] == "Provider weggevallen"
    assert verstuurd["https://push/oud"]["body"] == "Groq antwoordt niet"
    # En de rij is gemarkeerd, anders gaat hij elke minuut opnieuw.
    assert db.updates and db.updates[0][0] == "core_notifications"


def test_leest_beide_tabellen_en_dedupliceert_op_endpoint():
    db = _Db(
        [],
        [{"endpoint": "https://push/iphone", "p256dh": "x", "auth": "y", "verberg_inhoud": True}],
        legacy=[
            {"endpoint": "https://push/iphone", "p256dh": "x", "auth": "y"},
            {"endpoint": "https://push/safari", "p256dh": "a", "auth": "b"},
        ],
    )
    abs_ = lees_abonnementen(db)
    assert {a["endpoint"] for a in abs_} == {"https://push/iphone", "https://push/safari"}


def test_nieuwe_pending_approval_duwt_een_keer_per_live_abonnement(monkeypatch):
    verstuurd = []

    def nep_webpush(subscription_info, data, **_k):
        verstuurd.append(subscription_info["endpoint"])

    nep = types.ModuleType("pywebpush")
    nep.webpush = nep_webpush
    nep.WebPushException = type("WebPushException", (Exception,), {})
    monkeypatch.setitem(sys.modules, "pywebpush", nep)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "/nergens.pem")

    db = _Db(
        [],
        [{"endpoint": "https://push/core", "p256dh": "x", "auth": "y", "verberg_inhoud": False}],
        legacy=[{"endpoint": "https://push/legacy", "p256dh": "x", "auth": "y"}],
    )
    vraag_luka(db, "taak-offer", titel="Dit is: een bericht versturen (offer).", detail="Aan wie: the buyer.", kind="leave_plan")
    assert len(db.tabellen["core_notifications"]) == 1
    db.tabellen["core_notifications"][0].update({
        "id": "n-approval",
        "created_at": "2026-10-05T06:00:00+00:00",
        "type": "warning",
    })

    uit = asyncio.run(stuur_meldingen(lambda: db, nu=datetime(2026, 10, 5, 6, 0, 30, tzinfo=timezone.utc)))
    assert uit["verstuurd"] == 2
    assert set(verstuurd) == {"https://push/core", "https://push/legacy"}
    assert db.tabellen["core_notifications"][0].get("pushed_at") or any(
        u[0] == "core_notifications" for u in db.updates
    )
