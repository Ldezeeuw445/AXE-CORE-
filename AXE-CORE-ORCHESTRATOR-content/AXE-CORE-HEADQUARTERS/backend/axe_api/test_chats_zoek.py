"""Chats-pagina: zoeken en overzicht over het AXE-gesprek en de managergesprekken."""
from datetime import datetime, timezone

import chats_zoek as cz

NU = datetime(2026, 11, 25, 20, 0, tzinfo=timezone.utc)

AXE = [
    {"id": "a1", "conversation_id": "c1", "role": "user", "content": "Hoe staat de corporateJets feed?",
     "created_at": "2026-11-25T10:00:00+00:00"},
    {"id": "a2", "conversation_id": "c1", "role": "assistant", "content": "De feed ververst weer, laatst om 18:35.",
     "created_at": "2026-11-25T10:00:05+00:00"},
]
MGR = [
    {"id": "m1", "from_agent": "luka", "to_agent": "companionmgr", "body": "Repareer de corporateJets feed",
     "created_at": "2026-11-24T01:00:00+00:00"},
    {"id": "m2", "from_agent": "companionmgr", "to_agent": "luka", "body": "Klaar: feed ververst zonder fout.",
     "created_at": "2026-11-24T23:25:00+00:00"},
    {"id": "m3", "from_agent": "tradingos", "to_agent": "luka", "body": "Oude melding", "created_at": "2026-10-01T00:00:00+00:00"},
]


def test_treffers_hebben_bron_wie_en_tijd_nieuwste_eerst():
    uit = cz.treffers(AXE, MGR[:2], "feed")
    assert [t["id"] for t in uit] == ["a2", "a1", "m2", "m1"]
    assert uit[0]["gesprek"] == "AXE" and uit[0]["wie"] == "AXE"
    assert uit[2]["gesprek"] == "companionmgr" and uit[2]["wie"] == "companionmgr"
    assert uit[3]["wie"] == "Luka"


def test_stukje_toont_de_tekst_rond_het_zoekwoord():
    tekst = "a " * 200 + "corporateJets" + " b" * 200
    s = cz.stukje(tekst, "corporatejets", breedte=10)
    assert "corporateJets" in s and s.startswith("...") and s.endswith("...")


def test_overzicht_per_gesprek_met_laatste_drie_regels_en_weektelling():
    uit = cz.overzicht(AXE, MGR, NU)
    assert [g["gesprek"] for g in uit] == ["AXE", "companionmgr", "tradingos"]
    comp = uit[1]
    assert comp["deze_week"] == 2
    assert [r["wie"] for r in comp["laatste_regels"]] == ["Luka", "companionmgr"]
    assert uit[2]["deze_week"] == 0


def test_jokers_in_de_zoekvraag_zijn_letterlijk():
    assert cz._like("50%_x") == "%50\\%\\_x%"
