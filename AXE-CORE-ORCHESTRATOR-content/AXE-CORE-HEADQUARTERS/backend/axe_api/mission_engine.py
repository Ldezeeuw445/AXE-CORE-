"""De missielus: kiest na elke stap zelf de volgende, op de server.

Draait in hetzelfde proces als de task-worker (task_worker.run_forever), niet
in de app en niet in de browser. Browser dicht, telefoon op slot, Luka offline:
de lus loopt door, want hij staat op de VPS onder systemd.

Eén ronde:
  1. lease één runnable missie (claim_next_core_mission, SKIP LOCKED)
  2. lees de taak van de huidige mijlpaal
  3. missies.beslis() kiest: niets / wachten / volgende taak / blocked / klaar
  4. maak de taak aan (idempotent), schrijf de missie, geef de lease terug

Uitvoeren doet de bestaande worker. Deze lus maakt alleen gewone core_tasks
aan, met mission_id erop, zodat de trigger op core_tasks de missie wakker
maakt zodra een stap van status wisselt.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from missies import Besluit, MissieRepository, beslis, iso, nu
from task_runtime import TaskRepository

log = logging.getLogger("axe_mission_engine")

IDLE_MIN, IDLE_MAX = 5, 60
LEASE_SECONDS = 60


def zwaarte(agent: str) -> str:
    """Taken van een agent met een DAX-computer tellen als zwaar."""
    try:
        from agent_workspace import laad_workspace
        return "heavy" if laad_workspace(agent).get("dax_computer") else "light"
    except Exception:
        return "light"


class MissieMotor:
    def __init__(self, missies: MissieRepository, taken: TaskRepository, *, eigenaar: str | None = None,
                 melden: Callable[[str, str], None] | None = None):
        self.missies = missies
        self.taken = taken
        self.eigenaar = eigenaar or f"{socket.gethostname()}:missions"
        self._melden = melden

    def ronde(self) -> bool:
        """Eén missie verder helpen. True als er een missie was."""
        missie = self.missies.claim(self.eigenaar, LEASE_SECONDS)
        if not missie:
            return False
        token = missie.get("lease_token")
        try:
            mijlpalen = missie.get("milestones") or []
            i = int(missie.get("current_milestone") or 0)
            taak_id = mijlpalen[i].get("task_id") if 0 <= i < len(mijlpalen) else None
            taak = self.missies.taak(taak_id)
            besluit = beslis(missie, taak)
            self._voer_uit(missie, besluit, token)
        except Exception as exc:  # noqa: BLE001 -- één kapotte missie mag de lus niet stoppen
            log.exception("[missions] round failed for %s", missie.get("id"))
            try:
                self.missies.event(missie["id"], "mission.error", str(exc)[:500], agent=missie.get("owner_agent"))
                self.missies.schrijf(missie, {"next_run_at": iso(nu() + timedelta(seconds=60))}, lease_token=token)
            except Exception:  # noqa: BLE001
                pass
        return True

    def _voer_uit(self, missie: dict[str, Any], besluit: Besluit, token: str | None) -> None:
        velden = dict(besluit.velden)
        velden["status"] = besluit.status
        taak_id = None
        if besluit.taak is not None:
            t = besluit.taak
            taak, nieuw = self.taken.create({
                "title": t.title,
                "goal": t.request,
                "description": f"Mission step for {missie['title']}",
                "priority": missie.get("priority") or "medium",
                "requested_by": "axe-missions",
                "capability": "agentic",
                "assignee": t.agent,
                "execution_mode": "execute",
                "idempotency_key": t.idempotency_key,
                "mission_id": missie["id"],
                "payload": {
                    "request": t.request, "agent": t.agent, "mission_id": missie["id"],
                    "milestone_index": t.mijlpaal_index, "weight": zwaarte(t.agent),
                },
                "metadata": {"mission_id": missie["id"], "source": "mission_engine"},
            })
            taak_id = taak["id"]
            mijlpalen = velden.get("milestones") or missie.get("milestones") or []
            mijlpalen[t.mijlpaal_index]["task_id"] = taak_id
            velden["milestones"] = mijlpalen
            if not nieuw:
                log.info("[missions] reused existing task %s (idempotent)", taak_id)
        wacht = besluit.wacht_seconden
        if besluit.status in ("active", "waiting_agent", "waiting_approval", "monitoring"):
            velden["next_run_at"] = iso(nu() + timedelta(seconds=max(wacht, 5)))
        geschreven = self.missies.schrijf(missie, velden, lease_token=token)
        if geschreven is None:
            log.warning("[missions] lease lost on %s; another loop will decide", missie["id"])
            return
        for soort, bericht, data in besluit.events:
            self.missies.event(missie["id"], soort, bericht, agent=missie.get("owner_agent"),
                               task_id=data.get("task_id") or taak_id, data=data)
        if besluit.taak is not None:
            self.missies.event(missie["id"], "task.selected", besluit.taak.title, agent=besluit.taak.agent,
                               task_id=taak_id, data={"milestone_index": besluit.taak.mijlpaal_index})
        if besluit.melding and self._melden:
            try:
                self._melden(*besluit.melding)
            except Exception:  # noqa: BLE001 -- een melding mag de missie niet breken
                pass


async def run_mission_engine(
    motor: MissieMotor,
    *,
    stop: Callable[[], bool] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Blijft missies verder helpen. Slaapt zuinig als er niets runnable is."""
    wacht: float = IDLE_MIN
    fouten = 0
    while stop is None or not stop():
        try:
            bezig = await asyncio.to_thread(motor.ronde)
            fouten = 0
        except Exception as exc:  # noqa: BLE001 -- Supabase-hik: later nog eens
            fouten += 1
            log.error("[missions] claim failed (consecutive=%s): %s", fouten, exc)
            await sleep(min(5 * fouten, IDLE_MAX))
            continue
        if bezig:
            wacht = IDLE_MIN
            continue
        await sleep(wacht)
        wacht = min(wacht * 2, IDLE_MAX)


def missies_aan() -> bool:
    return os.environ.get("AXE_MISSIONS", "1").strip().lower() not in ("0", "false", "no", "off")
