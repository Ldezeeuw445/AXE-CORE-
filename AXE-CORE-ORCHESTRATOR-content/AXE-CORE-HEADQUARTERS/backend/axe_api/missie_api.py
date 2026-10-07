"""HTTP voor missies, agent-activiteit, DAX en observability.

Eigen router, niet in main.py: main.py is al 5000+ regels. main.py hangt hem
op met dezelfde AUTH-muur als /tasks. De app leest hier alles wat Home nodig
heeft; de database zelf blijft service_role-only.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("axe_core_api.missions")


class MissieAanvraag(BaseModel):
    title: str
    goal: str
    owner_agent: str
    supporting_agents: list[str] = Field(default_factory=list)
    milestones: list[Any] = Field(default_factory=list)
    priority: str = "medium"
    continue_until: str = "complete"
    recurring_interval_seconds: Optional[int] = None
    max_attempts_per_milestone: Optional[int] = None
    max_iterations_per_milestone: Optional[int] = None
    requested_by: str = "luka"
    metadata: dict[str, Any] = Field(default_factory=dict)


class MissieBesluit(BaseModel):
    by: str = "luka"
    reason: Optional[str] = None
    note: Optional[str] = None


def maak_router(client_factory: Callable[[], Any]) -> APIRouter:
    from agent_activiteit import Activiteit
    from agent_workspace import AGENT_WORKSPACES
    from missies import MissieRepository

    router = APIRouter()
    missies = lambda: MissieRepository(client_factory)  # noqa: E731
    activiteit = lambda: Activiteit(client_factory)  # noqa: E731

    def fout(exc: Exception, wat: str) -> HTTPException:
        if isinstance(exc, (ValueError, KeyError)) or exc.__class__.__name__ == "WorkspaceOntbreekt":
            return HTTPException(422, str(exc))
        if isinstance(exc, LookupError):
            return HTTPException(404, f"{wat} not found")
        log.exception("%s failed", wat)
        return HTTPException(503, f"{wat} unavailable: {exc}")

    # ── Missies ──────────────────────────────────────────────────────────────
    @router.post("/missions", status_code=202)
    async def maak_missie(req: MissieAanvraag):
        try:
            return {"mission": await asyncio.to_thread(missies().maak, req.model_dump())}
        except Exception as exc:
            raise fout(exc, "mission") from exc

    @router.get("/missions")
    async def lijst_missies(status: Optional[str] = None, limit: int = 50):
        try:
            return {"missions": await asyncio.to_thread(missies().lijst, status, limit)}
        except Exception as exc:
            raise fout(exc, "missions") from exc

    @router.get("/missions/{mission_id}")
    async def haal_missie(mission_id: str, after_sequence: int = 0):
        try:
            data = await asyncio.to_thread(missies().haal, mission_id, max(after_sequence, 0))
        except ValueError as exc:
            raise HTTPException(404, "mission not found") from exc
        except Exception as exc:
            raise fout(exc, "mission") from exc
        if not data:
            raise HTTPException(404, "mission not found")
        return data

    async def _zet(mission_id: str, status: str, req: MissieBesluit):
        try:
            return {"mission": await asyncio.to_thread(
                missies().zet_status, mission_id, status, door=req.by, reden=req.reason, notitie=req.note)}
        except LookupError as exc:
            raise HTTPException(404, "mission not found") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except Exception as exc:
            raise fout(exc, "mission") from exc

    @router.post("/missions/{mission_id}/pause")
    async def pauzeer(mission_id: str, req: MissieBesluit = MissieBesluit()):
        return await _zet(mission_id, "paused", req)

    @router.post("/missions/{mission_id}/resume")
    async def hervat(mission_id: str, req: MissieBesluit = MissieBesluit()):
        return await _zet(mission_id, "active", req)

    @router.post("/missions/{mission_id}/cancel")
    async def annuleer(mission_id: str, req: MissieBesluit = MissieBesluit()):
        return await _zet(mission_id, "cancelled", req)

    # ── Agents ───────────────────────────────────────────────────────────────
    @router.get("/agents/activity")
    async def agent_activiteit(events: int = 8):
        try:
            agents = await asyncio.to_thread(activiteit().overzicht, list(AGENT_WORKSPACES), max(1, min(events, 50)))
            return {"agents": agents, "at": datetime.now(timezone.utc).isoformat()}
        except Exception as exc:
            raise fout(exc, "agent activity") from exc

    @router.get("/agents/{agent}/events")
    async def agent_events(agent: str, limit: int = 50, since: Optional[str] = None):
        if agent not in AGENT_WORKSPACES:
            raise HTTPException(404, "unknown agent")
        from agent_activiteit import tijdlijn
        try:
            return {"agent": agent, "events": tijdlijn(await asyncio.to_thread(activiteit().events, agent, limit, since))}
        except Exception as exc:
            raise fout(exc, "agent events") from exc

    # ── Terug van weg ────────────────────────────────────────────────────────
    @router.get("/axe/since")
    async def sinds(since: Optional[str] = None, hours: int = 12):
        moment = since or (datetime.now(timezone.utc) - timedelta(hours=max(1, min(hours, 24 * 14)))).isoformat()
        try:
            return await asyncio.to_thread(activiteit().sinds, moment)
        except Exception as exc:
            raise fout(exc, "since") from exc

    # ── DAX ──────────────────────────────────────────────────────────────────
    @router.get("/dax")
    async def dax_lijst():
        from dax import DaxRegister, dax_aan, max_zwaar
        try:
            reg = DaxRegister(client_factory)
            return {"enabled": dax_aan(), "max_heavy": max_zwaar(),
                    "computers": await asyncio.to_thread(reg.rijen),
                    "slots": await asyncio.to_thread(reg.bezette_slots)}
        except Exception as exc:
            raise fout(exc, "dax") from exc

    async def _dax_actie(dax_id: str, actie: str) -> dict[str, Any]:
        from dax import DaxRegister, runtime_voor
        reg = DaxRegister(client_factory)
        computer = await asyncio.to_thread(reg.haal, dax_id)
        if computer is None:
            raise HTTPException(404, "unknown DAX computer")
        rt = runtime_voor(computer)
        try:
            if actie == "start":
                uit = await asyncio.to_thread(rt.ensure_running, computer)
                await asyncio.to_thread(reg.meld, dax_id, status="running")
            elif actie == "stop":
                uit = await asyncio.to_thread(rt.stop, computer)
                await asyncio.to_thread(reg.meld, dax_id, status="sleeping")
            else:
                uit = await asyncio.to_thread(rt.stats, computer)
                await asyncio.to_thread(reg.meld, dax_id, stats=uit,
                                        status="running" if uit.get("state") == "running" else None)
            return {"dax": dax_id, **uit}
        except HTTPException:
            raise
        except Exception as exc:
            await asyncio.to_thread(reg.meld, dax_id, status="error", fout=str(exc))
            raise HTTPException(502, f"DAX {dax_id}: {exc}") from exc

    @router.post("/dax/{dax_id}/start")
    async def dax_start(dax_id: str):
        return await _dax_actie(dax_id, "start")

    @router.post("/dax/{dax_id}/stop")
    async def dax_stop(dax_id: str):
        return await _dax_actie(dax_id, "stop")

    @router.get("/dax/{dax_id}/stats")
    async def dax_stats(dax_id: str):
        return await _dax_actie(dax_id, "stats")

    # ── Observability ────────────────────────────────────────────────────────
    @router.get("/observability")
    async def observability():
        try:
            return await asyncio.to_thread(activiteit().observability)
        except Exception as exc:
            raise fout(exc, "observability") from exc

    return router
