"""Optionele CrewAI-wrapper om dezelfde YAML/catalog-crews lokaal te kickoff'en.

Golden tests en de default LocalCrewBackend gebruiken dit NIET. CrewAI is een
optionele dependency: ontbreekt het package, dan is de golden runtime de
productie-uitvoerder. Geen secrets hier.
"""
from __future__ import annotations

from typing import Any

from .catalog import CREW_SPECS, SPECIALIST_FOR_ROUTE


def crewai_available() -> bool:
    try:
        import crewai  # noqa: F401
        return True
    except ImportError:
        return False


def build_crew(route: str):
    """Bouw een crewai.Crew uit de catalogus. Raises ImportError als crewai ontbreekt."""
    from crewai import Agent, Crew, Process, Task

    cid = SPECIALIST_FOR_ROUTE[route]
    spec = CREW_SPECS[cid]
    agents = {}
    for a in spec.agents:
        agents[a.key] = Agent(
            role=a.role,
            goal=a.goal,
            backstory=a.backstory or a.goal,
            allow_delegation=False,
            verbose=False,
        )
    tasks = [
        Task(description=t.description, expected_output=t.expected_output, agent=agents[t.agent])
        for t in spec.tasks
    ]
    return Crew(agents=list(agents.values()), tasks=tasks, process=Process.sequential, verbose=False)


def kickoff_if_available(route: str, action: str, handoff: dict[str, Any]) -> dict[str, Any]:
    if not crewai_available():
        raise RuntimeError("crewai is not installed; use GoldenRuntime")
    crew = build_crew(route)
    return {"raw": crew.kickoff(inputs={"action": action, "handoff": handoff})}
