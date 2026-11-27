"""Tests voor de fusie van managers en DAX-bots.

Luka, 27 nov 2026: managers en DAX-bots moeten één identiteit worden.
Er gaat niets verloren, maar er blijft per terrein één manager over.
"""
from manager_identiteit import (
    ALIAS_NAAR_CANONIEK,
    CANONIEKE_MANAGERS,
    alle_managers,
    is_manager,
    manager_naam,
    manager_terrein,
    normaliseer_manager,
)


def test_northseamgr_is_alias_van_northsea():
    assert normaliseer_manager("northseamgr") == "northsea"
    assert normaliseer_manager("NORTHSEAMGR") == "northsea"
    assert normaliseer_manager("northsea") == "northsea"


def test_oude_dax_botnamen_blijven_geldig():
    for agent in ("trading", "developer", "thinktank", "browser"):
        assert normaliseer_manager(agent) == agent
        assert is_manager(agent)


def test_alle_canonieke_managers_zijn_uniek():
    managers = alle_managers()
    assert len(managers) == len(set(managers))
    assert "northsea" in managers
    assert "northseamgr" not in managers


def test_elke_canonieke_manager_heeft_naam_en_terrein():
    for agent in alle_managers():
        assert manager_naam(agent)
        assert manager_terrein(agent)


def test_alias_verwijst_altijd_naar_canonieke_manager():
    for alias, canoniek in ALIAS_NAAR_CANONIEK.items():
        assert canoniek in CANONIEKE_MANAGERS
        assert normaliseer_manager(alias) == canoniek


def test_onbekende_naam_is_geen_manager():
    assert not is_manager("onbekende-agent")
    assert normaliseer_manager("") == ""
    assert normaliseer_manager(None) == ""
