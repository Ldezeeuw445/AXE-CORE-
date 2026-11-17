"""AXE Core praat zelf: één overzicht van wat er op Luka wacht en waar."""
from datetime import datetime, timedelta, timezone

import axe_overzicht as ao

NU = datetime(2026, 11, 17, 13, 0, tzinfo=timezone.utc)


def test_zegt_hoeveel_en_waar():
    t = ao.tekst(ao.Stand(axe_vragen=1, northsea=44, northsea_eerst="Re: Copper cathode", zelf_vandaag=12))
    assert "Er wachten 45 dingen op jou" in t
    assert "1 kun je meteen met ja of nee beantwoorden" in t
    assert "44 zijn van NorthSea" in t and "één klik" in t
    assert "'Wacht op jou'" in t
    assert "Als eerste bij NorthSea: Re: Copper cathode." in t
    assert "12 vragen zelf afgehandeld" in t


def test_niets_te_doen_en_desk_onleesbaar():
    assert ao.tekst(ao.Stand(0, 0)).startswith("Er wacht niets op jou.")
    t = ao.tekst(ao.Stand(0, None))
    assert "niet lezen" in t and "Er wacht niets" not in t


def test_hooguit_eens_per_drie_uur():
    assert ao.mag_nu(None, NU)
    assert not ao.mag_nu(NU - timedelta(hours=1), NU)
    assert ao.mag_nu(NU - timedelta(hours=3), NU)


def test_geen_id_in_de_tekst():
    t = ao.tekst(ao.Stand(0, 3, "Yes needed: 45389717-b8cf-4887-945b-951e8c5a22c2 — Copper Cathode"))
    assert "Als eerste bij NorthSea: Copper Cathode." in t
    assert "45389717" not in t
