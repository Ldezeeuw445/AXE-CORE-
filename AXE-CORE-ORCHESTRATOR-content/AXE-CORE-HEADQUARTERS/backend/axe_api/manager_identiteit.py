"""Eén canonieke identiteit voor AXE CORE managers en DAX-bots.

Luka, 27 nov 2026: managers en DAX-bots moeten één worden. Elke manager is
een DAX-bot met een eigen computer; elke DAX-bot is een manager met een eigen
rol. Er mag niets verloren gaan, maar er mag ook maar één manager overblijven.

Deze laag maakt dat mogelijk zonder directe datamigratie:

- Eén canonieke lijst managers.
- Oude namen blijven als alias bestaan (bijvoorbeeld northseamgr -> northsea).
- Bestaande code kan normaliseer_manager() gebruiken voordat hij context,
  gesprek, status, taken of lessen opzoekt.
- De UI toont straks één manager per canonieke ID.

Browser is bewust een uitzondering: hij deelt een computer, maar is wel een
eigen manager met eigen rol en eigen gesprek.
"""
from __future__ import annotations

from typing import Final

CANONIEKE_MANAGERS: Final[tuple[str, ...]] = (
    "axemanager",
    "projectsmgr",
    "companionmgr",
    "axon",
    "tradingos",
    "northsea",
    "developer",
    "thinktank",
    "browser",
)

# Oude of alternatieve namen wijzen naar één canonieke manager.
# Niets wordt verwijderd: een alias blijft leesbaar in logs, database en API.
ALIAS_NAAR_CANONIEK: Final[dict[str, str]] = {
    "northseamgr": "northsea",
    "northsea_desk": "northsea",
    "northsea-desk": "northsea",
    "trading": "trading",
    "tradingos": "tradingos",
    "developer": "developer",
    "thinktank": "thinktank",
    "browser": "browser",
    "axemanager": "axemanager",
    "projectsmgr": "projectsmgr",
    "companionmgr": "companionmgr",
    "axon": "axon",
}

MANAGER_NAAM: Final[dict[str, str]] = {
    "axemanager": "AXE CORE Manager",
    "projectsmgr": "Projects Manager",
    "companionmgr": "AXE Companion Manager",
    "axon": "AXON Memory Manager",
    "tradingos": "Trading OS Manager",
    "northsea": "NorthSea Manager",
    "developer": "Developer Manager",
    "thinktank": "ThinkTank Manager",
    "browser": "Browser Manager",
}

MANAGER_TERREIN: Final[dict[str, str]] = {
    "axemanager": "AXE CORE, de app en de VPS",
    "projectsmgr": "Projecten en de DAX-werkplekken",
    "companionmgr": "AXE Companion en axecompanion.com",
    "axon": "AXON Memory en het geheugen",
    "tradingos": "Trading OS en de marktfeeds",
    "northsea": "NorthSea Desk, deals en mail",
    "developer": "Code, builds en technische reparaties",
    "thinktank": "Denkwerk, onderzoek en strategie",
    "browser": "Browserwerk en webonderzoek",
}


def normaliseer_manager(agent: str | None) -> str:
    """Zet een oude of alternatieve naam om naar de ene canonieke manager."""
    key = str(agent or "").strip().lower()
    if not key:
        return ""
    return ALIAS_NAAR_CANONIEK.get(key, key)


def is_manager(agent: str | None) -> bool:
    """True alleen voor een canonieke manager, na alias-normalisatie."""
    return normaliseer_manager(agent) in CANONIEKE_MANAGERS


def manager_naam(agent: str | None) -> str:
    """Eén leesbare naam per canonieke manager."""
    canoniek = normaliseer_manager(agent)
    return MANAGER_NAAM.get(canoniek, canoniek)


def manager_terrein(agent: str | None) -> str:
    """Eén duidelijk terrein per canonieke manager."""
    canoniek = normaliseer_manager(agent)
    return MANAGER_TERREIN.get(canoniek, "")


def alle_managers() -> tuple[str, ...]:
    """De ene lijst die de UI, API en managerlus moeten gebruiken."""
    return CANONIEKE_MANAGERS
