"""
claude_runner.py — Claude Code als één motor van agent_runner.

Dit bestand was de hele Branch C: whitelist, branchbewaking, sleutels strippen,
de CLI aanroepen. Toen Codex erbij kwam — dezelfde vorm, een CLI op een
abonnement — waren er twee keuzes: dit kopiëren en de vlaggen aanpassen, of de
bewakingen delen.

Kopiëren zou betekenen dat de whitelist, de main/master-regel en het strippen van
API-sleutels op twee plekken staan. Die lopen binnen een week uit elkaar en dan
is niet te zien welke van de twee een aanroep heeft geweigerd. Dus staat de kern
in agent_runner.py en is dit wat het altijd al had moeten zijn: de naam van één
motor.

De namen hieronder blijven bestaan omdat main.py ze importeert. Wie nieuw werk
schrijft gebruikt agent_runner direct.
"""
from __future__ import annotations

from agent_runner import (  # noqa: F401
    ALLOWED_PERMISSION_MODES,
    DEFAULT_PERMISSION_MODE,
    PROTECTED_BRANCHES,
    ENGINES,
    engine_status,
    repo_status,
    run_agent,
    whitelisted_repos,
)
from agent_runner import cli_available as _cli_available


def run_claude(repo: str, prompt: str, permission_mode: str = None, timeout: int = None) -> dict:
    """Ongewijzigde vorm voor bestaande aanroepers; draait Claude Code."""
    return run_agent(repo, prompt, permission_mode, timeout, engine="claude")


def cli_available() -> bool:
    """Of de Claude Code CLI op deze host staat."""
    return _cli_available("claude")
