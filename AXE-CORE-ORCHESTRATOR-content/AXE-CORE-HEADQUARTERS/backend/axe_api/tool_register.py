"""Eén tool-register dat echt werkt (BOUWLIJST "Eerst", punt 6 -- 19 nov 2026).

Per tool: wat hij doet, input, output, rechten (wat goedkeuring vraagt), de
bekende fouten, en wie hem mag. Wat de code al weet wordt hier niet opnieuw
getypt maar afgeleid -- de input uit `agent_loop.TOOL_DECLARATIONS`, "wie mag
hem" uit `agent_workspace.AGENT_WORKSPACES` -- zodat het register niet kan
afdrijven van wat de lus doet. Alleen output/rechten/fouten zijn tekst, en een
test eist dat elke tool die tekst heeft.

En het register is ook de poort: `mag(agent, tool)` is wat de lus vraagt
vóór hij een tool uitvoert. Voorheen zag het model alleen zijn eigen tools,
maar riep het toch een andere aan, dan voerde de lus die gewoon uit.
"""
from __future__ import annotations

from typing import Any

# Wat de code niet zelf kan zeggen. Sleutels = precies de tools in TOOL_DECLARATIONS.
UITLEG: dict[str, dict[str, str]] = {
    "run_shell": {
        "output": "stdout, stderr en exit_code van het commando",
        "rechten": "vrij binnen de werkplek; alles wat het systeem of de buitenwereld raakt "
                   "(sudo, systemctl, git push, ssh, mail, orders) parkeert de taak tot Luka ja zegt "
                   "(agent_loop.approval_reason); in een alleen-lezen taak strenger",
        "fouten": "exit_code != 0; time-out; 'approval_required' = taak geparkeerd tot Luka ja zegt",
    },
    "read_file": {
        "output": "de tekst van het bestand (standaard max 60000 bytes)",
        "rechten": "vrij; alleen lezen",
        "fouten": "bestand bestaat niet; te groot (afgekapt)",
    },
    "write_file": {
        "output": "bytes_written, zodat je ziet dat het landde",
        "rechten": "alleen agents met deze tool; geweigerd in een alleen-lezen taak",
        "fouten": "'read-only task' bij een alleen-lezen taak; pad niet schrijfbaar",
    },
    "list_devices": {
        "output": "Luka's Macs, of ze online zijn en welke werkplekken ze hebben",
        "rechten": "vrij; alleen lezen",
        "fouten": "geen Mac online (lege lijst of alles offline)",
    },
    "run_on_device": {
        "output": "ok + het resultaat van de actie op de Mac (bij claude_code/codex/cursor.run ook een oplevering)",
        "rechten": "lezen vrij; klikken, typen en schrijven vragen goedkeuring; terminal.free, "
                   "git push/merge/PR en verwijderen vragen altijd Luka's exacte ok, nooit per stem",
        "fouten": "Mac offline; ontbrekend argument (bv. claude_code.run zonder prompt); "
                  "'approval_required' = geparkeerd",
    },
    "northsea_read": {
        "output": "deals, blokkades, mails en hun draad, wat op Luka wacht, gezondheid (afgekapt bij te veel)",
        "rechten": "alleen lezen via de NorthSea-gateway; kan nooit versturen, goedkeuren of wijzigen",
        "fouten": "onbekende actie; gateway niet bereikbaar; deal niet gevonden",
    },
    "run_crew": {
        "output": "status en uitkomst van de CrewAI-crew van deze agent",
        "rechten": "alleen agents met een crew in hun werkplek",
        "fouten": "geen crew ingesteld; crew-run mislukt",
    },
    "finish": {
        "output": "taak klaar -- maar alleen als het bewijscommando de verwachte tekst geeft",
        "rechten": "iedereen; de worker draait het bewijs zelf",
        "fouten": "'accepted: false' = bewijs hield niet, doorwerken",
    },
}


def _declaraties() -> list[dict[str, Any]]:
    from agent_loop import TOOL_DECLARATIONS
    return list(TOOL_DECLARATIONS)


def _werkplekken() -> dict[str, dict[str, Any]]:
    from agent_workspace import AGENT_WORKSPACES
    return AGENT_WORKSPACES


def tools_van(agent: str) -> list[str]:
    """Welke tools heeft agent X. Onbekende agent = geen tools."""
    ws = _werkplekken().get(agent)
    return [str(t) for t in (ws.get("tools") or ())] if ws else []


def mag(agent: str | None, tool: str) -> bool:
    """De poort die de lus vraagt vóór elke tool. Zonder agent: de AXE-werkplek."""
    return tool in tools_van(agent or "axe")


def register() -> list[dict[str, Any]]:
    """Alle tools met input, output, rechten, fouten en wie hem mag."""
    wp = _werkplekken()
    uit: list[dict[str, Any]] = []
    for d in _declaraties():
        naam = d["name"]
        params = d.get("parameters") or {}
        props = params.get("properties") or {}
        u = UITLEG.get(naam, {})
        uit.append({
            "name": naam,
            "wat": " ".join(str(d.get("description") or "").split())[:400],
            "input": {k: str((v or {}).get("type") or "any") for k, v in props.items()},
            "verplicht": list(params.get("required") or []),
            "output": u.get("output", ""),
            "rechten": u.get("rechten", ""),
            "fouten": u.get("fouten", ""),
            "wie": [a for a, ws in wp.items() if naam in (ws.get("tools") or ())],
        })
    return uit


def gaten() -> list[str]:
    """Wat er mis is tussen register, lus en werkplekken. Leeg = één register."""
    namen = {d["name"] for d in _declaraties()}
    uit = [f"{t}: geen uitleg (output/rechten/fouten)" for t in sorted(namen - set(UITLEG))]
    uit += [f"{t}: uitleg zonder tool" for t in sorted(set(UITLEG) - namen)]
    for agent, ws in _werkplekken().items():
        for t in ws.get("tools") or ():
            if t not in namen:
                uit.append(f"{agent}: heeft tool {t!r} die de lus niet kent")
    return uit
