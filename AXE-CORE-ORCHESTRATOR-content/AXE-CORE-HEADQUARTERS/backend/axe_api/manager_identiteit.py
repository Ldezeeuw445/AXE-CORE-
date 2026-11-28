"""Eén canonieke identiteit voor AXE CORE managers en DAX-bots.

Luka, 26 nov 2026 (ADR-2026-11-26-managers-zijn-dax, op zijn akkoord live gezet in
98e705ad) en 27 nov (Issue #355): managers en DAX-bots zijn één. Elke manager is
een DAX-bot met een eigen computer; er blijft per terrein één manager over, en er
mag niets verloren gaan.

Richting (Luka's keuze, 27 nov, na de vraag welke naam overblijft): de zes
managers zijn canoniek; de oude DAX-botnamen zijn aliassen van hun manager. Zo
klopt het met wat al live staat: core_dax_computers.owner_agent (migratie
20261126210000_managers_zijn_dax.sql), Home met zes managers, agent_workspace.

- Eén canonieke lijst managers.
- Oude namen blijven geldig als alias (northsea -> northseamgr, trading -> tradingos,
  developer -> projectsmgr, thinktank -> axemanager): leesbaar in logs, database en API.
- Code normaliseert met normaliseer_manager() voordat hij context, gesprek, status,
  taken of lessen opzoekt, en leest bestaande rijen met namen_van() zodat data onder
  een oude naam bij dezelfde manager blijft horen.
- Browser is geen agent meer maar een gedeelde computer (dax-browser-01) die elke
  manager gebruikt; "browser" is dus geen manager en geen alias.
"""
from __future__ import annotations

from typing import Any, Final

CANONIEKE_MANAGERS: Final[tuple[str, ...]] = (
    "axemanager",
    "projectsmgr",
    "companionmgr",
    "axon",
    "tradingos",
    "northseamgr",
)

# De oude DAX-bots en de manager die hun computer kreeg (ADR 26 nov). Ook
# agent_workspace.MANAGER_VAN_DAX_BOT komt hier vandaan: één bron.
DAX_BOT_VAN_MANAGER: Final[dict[str, str]] = {
    "thinktank": "axemanager",
    "developer": "projectsmgr",
    "northsea": "northseamgr",
    "trading": "tradingos",
}

# Oude of alternatieve namen wijzen naar één canonieke manager.
# Niets wordt verwijderd: een alias blijft leesbaar in logs, database en API.
ALIAS_NAAR_CANONIEK: Final[dict[str, str]] = {
    **DAX_BOT_VAN_MANAGER,
    "northsea_desk": "northseamgr",
    "northsea-desk": "northseamgr",
}

GEDEELDE_COMPUTERS: Final[dict[str, str]] = {"browser": "dax-browser-01"}

MANAGER_NAAM: Final[dict[str, str]] = {
    "axemanager": "AXE CORE Manager",
    "projectsmgr": "Projects Manager",
    "companionmgr": "AXE Companion Manager",
    "axon": "AXON Memory Manager",
    "tradingos": "Trading OS Manager",
    "northseamgr": "NorthSea Desk Manager",
}

MANAGER_TERREIN: Final[dict[str, str]] = {
    "axemanager": "AXE CORE, de app en de VPS (met de ThinkTank-computer)",
    "projectsmgr": "Projecten, code en builds (met de Developer-computer)",
    "companionmgr": "AXE Companion en axecompanion.com",
    "axon": "AXON Memory en het geheugen",
    "tradingos": "Trading OS, de marktfeeds en de Trading-computer (geen live orders zonder Luka)",
    "northseamgr": "NorthSea Desk, deals en mail (met de NorthSea-computer)",
}


def normaliseer_manager(agent: str | None) -> str:
    """Zet een oude of alternatieve naam om naar de ene canonieke manager.

    Een onbekende naam komt ongewijzigd (in kleine letters) terug; is_manager zegt
    of het een manager is."""
    key = str(agent or "").strip().lower()
    if not key:
        return ""
    return ALIAS_NAAR_CANONIEK.get(key, key)


def canoniek_of_zelf(agent: Any) -> Any:
    """Een alias wordt zijn manager; elke andere waarde (luka, log-agents, None) blijft
    precies wat hij was. Voor plekken die ook niet-managers doorgeven, zoals de draad."""
    if not isinstance(agent, str):
        return agent
    return ALIAS_NAAR_CANONIEK.get(agent.strip().lower(), agent)


def is_manager(agent: str | None) -> bool:
    """True alleen voor een canonieke manager, na alias-normalisatie."""
    return normaliseer_manager(agent) in CANONIEKE_MANAGERS


def namen_van(agent: str | None) -> tuple[str, ...]:
    """De canonieke naam plus elke alias ervan: om bestaande rijen onder een oude
    naam (requested_by, from_agent, to_agent) mee te lezen. Canoniek eerst."""
    canoniek = normaliseer_manager(agent)
    if not canoniek:
        return ()
    return (canoniek, *sorted(a for a, c in ALIAS_NAAR_CANONIEK.items() if c == canoniek))


def alle_namen() -> tuple[str, ...]:
    """Alle managers met al hun aliassen, voor één query over de hele lus."""
    return tuple(n for m in CANONIEKE_MANAGERS for n in namen_van(m))


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
