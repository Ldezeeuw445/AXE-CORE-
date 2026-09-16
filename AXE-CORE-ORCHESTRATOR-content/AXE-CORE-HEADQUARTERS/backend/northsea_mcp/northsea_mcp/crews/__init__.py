"""Lokale NorthSea specialist-crews.

Drie echte crews (YAML-export is de definitie). Master Orchestration is GEEN
vierde intelligence-systeem: dat is alleen de deterministische router in
`orchestration.py` + `catalog.SPECIALIST_FOR_ROUTE`.

    deal_execution            8 agents
    intelligence_operations   8 agents   (Intelligence én Operations-events)
    counterparty_sourcing     7 agents   (YAML-export; Studio-UI toonde 7)

Studio-nested mini-crews (3/2/2) worden lokaal niet gebruikt.
"""
from .catalog import (
    CREW_SPECS,
    NESTED_STUDIO_AGENT_COUNTS,
    SPECIALIST_FOR_ROUTE,
    specialist_agent_count,
    specialist_id_for_route,
)
from .runtime import GoldenRuntime, LocalCrewBackend

__all__ = [
    "CREW_SPECS",
    "NESTED_STUDIO_AGENT_COUNTS",
    "SPECIALIST_FOR_ROUTE",
    "GoldenRuntime",
    "LocalCrewBackend",
    "specialist_agent_count",
    "specialist_id_for_route",
]
