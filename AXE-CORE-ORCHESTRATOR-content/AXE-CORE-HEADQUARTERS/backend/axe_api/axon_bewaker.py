"""Wat de AXON Memory Manager elke pulse naloopt in het geheugen van AXE.

## Waarom dit bestaat

Tot 9 november zei `run_axon` elke 20 minuten "memory seen 50, rag 20": hij
telde een vaste limiet rijen en zag niets. Intussen:

* zette de Obsidian-sync elke nacht dezelfde notities opnieuw in rag_memories
  (de scorecards 3-4 keer per nacht), zodat de daglimiet van 120 om 03:18 op
  was en geen agent de rest van de dag nog iets kon leren;
* bestond 82% van de RAG (23.110 van 28.084 rijen) uit kopieën van 1.196
  notities.

De oorzaak is gerepareerd in memory_schrijfhek (een bekende notitie wordt
vervangen). Deze bewaker ziet het als het ooit terugkomt.

## Grenzen

`beoordeel` is puur: alleen de rijen van vandaag, geen netwerk, geen klok.
Lezen is licht (alleen id/agent/key/bron van vandaag): de NorthSea-database
liep 8 nov vast op een manager die elke minuut alles las.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from memory_schrijfhek import GEHEUGEN_MAG_PER_DAG, is_noop, is_run_log

LES_VERWACHT_NA_UUR = 12  # Amsterdam: na de middag hoort er iets geleerd te zijn


@dataclass(frozen=True)
class Bevinding:
    code: str
    voor: str  # "luka" of "info"
    titel: str
    detail: str


def _bron(r: dict[str, Any]) -> str:
    meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
    if meta.get("source") == "obsidian" or str(r.get("content") or "").startswith("[obsidian:"):
        return "obsidian"
    return str(r.get("bron") or meta.get("source") or "les")


def tel(rag: list[dict[str, Any]], memory: list[dict[str, Any]]) -> dict[str, int]:
    notities = sum(1 for r in rag if _bron(r) == "obsidian")
    ruis = [r for r in memory if is_run_log(r.get("key")) or is_noop(r.get("content"))]
    return {
        "rag": len(rag),
        "notities": notities,
        "lessen": (len(rag) - notities) + (len(memory) - len(ruis)),
        "memory": len(memory),
        "ruis": len(ruis),
    }


def beoordeel(rag: list[dict[str, Any]], memory: list[dict[str, Any]], lokaal_uur: int) -> list[Bevinding]:
    """Rijen van vandaag (UTC-dag, zoals de daglimiet telt). Dringendste eerst."""
    t = tel(rag, memory)
    uit: list[Bevinding] = []

    if t["rag"] >= GEHEUGEN_MAG_PER_DAG:
        if t["notities"] * 2 > t["rag"]:
            uit.append(Bevinding(
                # Vaste titel: _vraag_luka ontdubbelt op titel.
                "limiet_vol_door_notities", "luka", "Geheugenlimiet vol door de notitiesync",
                f"{t['notities']} van de {t['rag']} RAG-rijen van vandaag zijn Obsidian-notities. "
                "De agents kunnen vandaag niets meer leren. De sync voegt notities weer toe "
                "in plaats van ze te vervangen (memory_schrijfhek).",
            ))
        else:
            uit.append(Bevinding("limiet_vol", "info", "Daglimiet geheugen bereikt",
                                 f"{t['rag']} RAG-rijen vandaag, {t['lessen']} echte lessen."))

    if t["ruis"]:
        uit.append(Bevinding(
            "ruis_in_geheugen", "luka", "Ruis komt langs het geheugenhek",
            f"{t['ruis']} rijen vandaag zijn HOLD/skip of run-logs. Iets schrijft buiten "
            "memory_schrijfhek om in memory.",
        ))

    if t["lessen"] == 0 and lokaal_uur >= LES_VERWACHT_NA_UUR:
        uit.append(Bevinding("niets_geleerd", "info", "Vandaag nog niets geleerd",
                             "Geen enkele nieuwe les in memory of rag_memories sinds middernacht."))

    return sorted(uit, key=lambda b: 0 if b.voor == "luka" else 1)
