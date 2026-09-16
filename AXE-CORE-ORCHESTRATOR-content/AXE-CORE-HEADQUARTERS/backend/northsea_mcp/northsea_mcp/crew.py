"""De grens met CrewAI: één adapter, twee uitvoerders.

## Architectuur

AXE CORE is de enige globale orchestrator. De NorthSea-flow is een begrensde
domeinlaag daaronder. `CrewGateway.run(action, handoff)` is de vaste interface die
de servicelaag gebruikt; wat erachter draait mag veranderen zonder dat één MCP-tool
of servicemethode verandert.

| Rol | Uitvoerder | Waar |
|---|---|---|
| PRIMAIR | De toegewijde NorthSea CrewAI-workforce (CrewAI Studio / AMP-deployment) | per crew een eigen URL + token: `POST /kickoff`, `GET /status/{id}`, `GET /inputs` |
| FALLBACK | De bestaande algemene AXE CORE-crew | axe-core-api `/crew/run`, venv `/opt/axe-crew-venv`, slots in zuinig.py |

Routes (expliciet, geen raden). De router wijst naar de VOLLEDIGE
specialist-crews, niet naar de nested mini-crews in de Studio-flow:

    discovery_run    -> NorthSea Counterparty Intelligence & Sourcing (7 YAML-agents)
    deal_run         -> NorthSea Deal Execution Crew                  (8 agents)
    intelligence_run -> NorthSea Intelligence & Operations            (8 agents)
    operations_run   -> NorthSea Intelligence & Operations            (zelfde 8-agent crew)
    unroutable       -> geen crew

Studio-AMP is optioneel. De primaire uitvoerder is de lokale Python-runtime.

## Fallback is nooit stil

De algemene crew wordt alleen gebruikt als de toegewijde crew niet kan, en alleen
voor redenen die het fallback-beleid toestaat:

    dedicated_backend_not_configured   er is (nog) geen deployment voor deze route
    dedicated_backend_unavailable      deployment weigert of is onbereikbaar
    health_check_failed                GET /inputs faalt
    capacity_exhausted                 deployment meldt drukte (429/503)
    timeout                            de toegewijde run haalde de deadline niet

Elk resultaat en elke auditregel noemt: gevraagde crew, route, backend, uitgevoerde
crew, fallback_used, fallback_reason, run-id, modellen, skills + versies,
tools/providers, budgetgebruik, tijden, validatie, en elke poging.

## Wat de algemene crew NIET is

Die bewijst de keten MCP -> gateway -> crew -> getypt resultaat -> audit (gemeten
15 sep 2026). Het is niet de NorthSea-workforce; een run via de fallback telt nooit
als acceptatie van een NorthSea-route.

## Wat een crew teruggeeft

ANALYSE, gemarkeerd als ongeverifieerd. Nooit opgeslagen als feit, nooit een poort
gepasseerd. CrewAI wordt alleen aangeroepen bij `depth="deep"`.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from .models import CrewRunInfo
from .crews.catalog import CREW_DISPLAY_NAME, CREW_SPECS, SPECIALIST_FOR_ROUTE

ROUTE_FOR_ACTION: dict[str, str] = {
    "research_counterparty": "discovery_run", "find_suppliers": "discovery_run", "find_buyers": "discovery_run",
    "assess_match": "discovery_run",
    "qualify_opportunity": "deal_run", "investigate_blockers": "deal_run", "prepare_outreach": "deal_run",
    "process_reply": "deal_run", "review_deal": "deal_run", "get_next_actions": "deal_run",
    "market_signal": "intelligence_run",
    "stale_deal": "operations_run", "provider_failure": "operations_run",
}
CREW_FOR_ROUTE: dict[str, str] = dict(CREW_DISPLAY_NAME)
ROLES_FOR_ROUTE: dict[str, list[str]] = {
    route: list(CREW_SPECS[cid].agent_roles) for route, cid in SPECIALIST_FOR_ROUTE.items()
}
# Korte naam in CrewRunInfo.crew (bestaand veld; tests en clients lezen "deal", "discovery").
SHORT_NAME = {"discovery_run": "discovery", "deal_run": "deal", "intelligence_run": "intelligence", "operations_run": "operations"}
# Terugwaarts: sommige code kende actie -> korte crewnaam.
CREW_FOR_ACTION = {a: SHORT_NAME[r] for a, r in ROUTE_FOR_ACTION.items()}

GENERAL_CREW = "AXE CORE general crew"
FALLBACK_REASONS = ("dedicated_backend_not_configured", "dedicated_backend_unavailable", "health_check_failed",
                    "capacity_exhausted", "timeout")
MIN_FALLBACK_S = 20.0

PROHIBITED = [
    "Do not send any message.",
    "Do not accept prices, payment terms, commissions or contracts.",
    "Do not disclose buyer or seller identities.",
    "Do not mark any claim as verified; public sources are unverified.",
    "Do not invent contacts, inventory, allocation, authority, pricing, KYC status or readiness.",
]


@dataclass(frozen=True)
class StudioRoute:
    url: str
    token: str


class DedicatedCrewOutput(BaseModel):
    """Het contract dat de toegewijde NorthSea-crews teruggeven in `result.output` (JSON).

    Alleen `analysis` is verplicht; de rest is provenance die de audit nodig heeft.
    Onbekende extra velden mogen (de crews groeien)."""
    model_config = {"extra": "allow"}
    analysis: str = Field(min_length=1)
    claims: list[dict[str, Any]] = Field(default_factory=list)
    blockers: list[Any] = Field(default_factory=list)
    recommendations: list[Any] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    skills: list[dict[str, Any]] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    budget_usage: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = None


def parse_dedicated_output(raw: Any) -> tuple[DedicatedCrewOutput | None, str | None]:
    tekst = raw
    if isinstance(raw, dict) and "output" in raw:
        tekst = raw["output"]
    if isinstance(tekst, str):
        s = tekst.strip()
        m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", s, re.S)
        s = m.group(1) if m else s
        try:
            tekst = json.loads(s)
        except ValueError:
            return None, "output is not JSON matching the NorthSea crew contract"
    try:
        return DedicatedCrewOutput.model_validate(tekst), None
    except ValidationError as e:
        return None, f"output failed contract validation ({e.error_count()} error(s))"


@dataclass
class Attempt:
    backend: str
    outcome: str
    detail: str | None = None
    seconds: float = 0.0

    def as_dict(self) -> dict:
        return {"backend": self.backend, "outcome": self.outcome, "detail": self.detail, "seconds": round(self.seconds, 2)}


@dataclass
class _Run:
    status: str                       # ok | capacity | unavailable | timeout | error | invalid | busy
    run_id: str | None = None
    analysis: str | None = None
    detail: str | None = None
    output: DedicatedCrewOutput | None = None
    specialists: list[str] = field(default_factory=list)
    execution_s: float | None = None


class StudioBackend:
    """De toegewijde NorthSea-workforce op CrewAI AMP. Eén deployment per route."""

    def __init__(self, routes: dict[str, StudioRoute], client: httpx.AsyncClient, *, poll_s: float = 3.0, health_ttl_s: float = 60.0):
        self.routes = {r: v for r, v in routes.items() if v.url and v.token}
        self._client = client
        self._poll_s = poll_s
        self._health_ttl = health_ttl_s
        self._health: dict[str, tuple[float, bool, str]] = {}

    def configured(self, route: str) -> bool:
        return route in self.routes

    def _h(self, route: str) -> dict:
        return {"Authorization": f"Bearer {self.routes[route].token}", "Content-Type": "application/json"}

    async def health(self, route: str) -> tuple[bool, str]:
        nu = time.monotonic()
        eerder = self._health.get(route)
        if eerder and nu - eerder[0] < self._health_ttl:
            return eerder[1], eerder[2]
        try:
            r = await self._client.get(f"{self.routes[route].url.rstrip('/')}/inputs", headers=self._h(route), timeout=10)
            ok, reden = r.status_code == 200, f"GET /inputs {r.status_code}"
        except httpx.HTTPError as e:
            ok, reden = False, f"GET /inputs unreachable ({type(e).__name__})"
        self._health[route] = (nu, ok, reden)
        return ok, reden

    async def run(self, route: str, inputs: dict, deadline: float) -> _Run:
        basis = self.routes[route].url.rstrip("/")
        try:
            r = await self._client.post(f"{basis}/kickoff", headers=self._h(route),
                                        json={"inputs": inputs, "meta": {"source": "northsea-mcp", "route": route}},
                                        timeout=max(1.0, min(30.0, deadline - time.monotonic())))
        except httpx.TimeoutException:
            return _Run("timeout", detail="kickoff timed out")
        except httpx.HTTPError as e:
            return _Run("unavailable", detail=f"kickoff unreachable ({type(e).__name__})")
        if r.status_code in (429, 503):
            return _Run("capacity", detail=f"kickoff {r.status_code}")
        if r.status_code >= 400:
            return _Run("unavailable", detail=f"kickoff {r.status_code}")
        kickoff_id = str((r.json() or {}).get("kickoff_id") or "")
        if not kickoff_id:
            return _Run("unavailable", detail="kickoff returned no kickoff_id")
        while True:
            rest = deadline - time.monotonic()
            if rest <= 0:
                return _Run("timeout", run_id=kickoff_id, detail="dedicated crew did not complete before the deadline")
            try:
                s = await self._client.get(f"{basis}/status/{kickoff_id}", headers=self._h(route), timeout=max(1.0, min(15.0, rest)))
            except httpx.TimeoutException:
                continue
            except httpx.HTTPError as e:
                return _Run("unavailable", run_id=kickoff_id, detail=f"status unreachable ({type(e).__name__})")
            if s.status_code >= 400:
                return _Run("unavailable", run_id=kickoff_id, detail=f"status {s.status_code}")
            body = s.json() or {}
            staat = str(body.get("status") or "").lower()
            if staat == "completed":
                uitvoer, fout = parse_dedicated_output(body.get("result"))
                if not uitvoer:
                    return _Run("invalid", run_id=kickoff_id, detail=fout, execution_s=body.get("execution_time"))
                agents = [t.get("agent") for t in ((body.get("result") or {}).get("tasks") or []) if isinstance(t, dict) and t.get("agent")]
                return _Run("ok", run_id=kickoff_id, analysis=uitvoer.analysis, output=uitvoer, specialists=agents,
                            execution_s=body.get("execution_time"))
            if staat == "error":
                return _Run("error", run_id=kickoff_id, detail=str(body.get("error") or "crew execution error")[:300],
                            execution_s=body.get("execution_time"))
            await asyncio.sleep(min(self._poll_s, max(0.0, rest)))


class GeneralCrewBackend:
    """FALLBACK: de bestaande algemene AXE CORE-crew via axe-core-api /crew/run. Niet verwijderen."""

    def __init__(self, *, axe_api_url: str, axe_api_key: str, crew_venv_py: str, client: httpx.AsyncClient):
        self._api = axe_api_url.rstrip("/")
        self._key = axe_api_key
        self._venv = crew_venv_py
        self._client = client

    def available(self) -> tuple[bool, str]:
        if not self._key:
            return False, "AXE API key not configured for the crew boundary"
        if self._venv and not os.path.exists(self._venv):
            return False, "CrewAI venv not present on this host"
        return True, "ok"

    async def run(self, route: str, action: str, handoff: dict, timeout: float) -> _Run:
        crew = SHORT_NAME[route]
        task = (f"NorthSea {crew} analysis, action {action}. Analyse the structured handoff and return: key risks, what "
                "evidence is missing, and the safest next steps. Use only the facts in the handoff. Constraints: " + " ".join(PROHIBITED))
        context = json.dumps({"crew": crew, "route": route, **handoff}, default=str)[:12000]
        try:
            r = await self._client.post(f"{self._api}/crew/run", headers={"Authorization": f"Bearer {self._key}"},
                                        json={"task": task, "context": context}, timeout=timeout)
        except httpx.TimeoutException:
            return _Run("timeout", detail=f"general crew did not finish within {timeout:.0f}s")
        except httpx.HTTPError as e:
            return _Run("unavailable", detail=f"crew boundary unreachable ({type(e).__name__})")
        if r.status_code >= 400:
            return _Run("error", detail=f"crew run failed ({r.status_code})")
        body = r.json() if r.content else {}
        status = str(body.get("status") or "unknown")
        if status != "ok" and re.search(r"bezig|busy|slot", str(body.get("error") or ""), re.I):
            return _Run("busy", detail="all CrewAI slots on the host are in use; retry later")
        if status != "ok":
            return _Run("error", detail=str(body.get("error") or "")[:300] or "crew run failed")
        tekst = body.get("result")
        return _Run("ok", analysis=str(tekst)[:6000] if tekst else None, specialists=[str(s) for s in (body.get("specialists") or [])])


class CrewGateway:
    # 170 s totaal voor primair + fallback: binnen de deep-timeout van de guard (190 s) en nginx (200 s).
    def __init__(self, *, axe_api_url: str, axe_api_key: str, crew_venv_py: str, timeout: float = 170.0,
                 client: httpx.AsyncClient | None = None, studio_routes: dict[str, StudioRoute] | None = None,
                 fallback_on: tuple[str, ...] | list[str] = FALLBACK_REASONS, studio_poll_s: float = 3.0,
                 min_fallback_s: float = MIN_FALLBACK_S, local=None, local_enabled: bool = True):
        from .crews.runtime import LocalCrewBackend
        self._timeout = timeout
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self.local = local if local is not None else LocalCrewBackend(enabled=local_enabled)
        if local is None:
            self.local.enabled = local_enabled
        self.studio = StudioBackend(studio_routes or {}, self._client, poll_s=studio_poll_s)
        self.general = GeneralCrewBackend(axe_api_url=axe_api_url, axe_api_key=axe_api_key, crew_venv_py=crew_venv_py, client=self._client)
        self.fallback_on = tuple(r for r in fallback_on if r in FALLBACK_REASONS)
        self._min_fallback_s = min_fallback_s

    def available(self) -> tuple[bool, str]:
        if getattr(self.local, "enabled", False):
            return True, ("local specialist crews: Deal Execution 8, Intelligence & Operations 8, "
                          "Counterparty Sourcing 7; Studio AMP optional")
        toegewijd = sorted(self.studio.routes)
        gen_ok, gen_reden = self.general.available()
        if toegewijd:
            return True, f"dedicated routes: {', '.join(toegewijd)}; fallback: {'ok' if gen_ok else gen_reden}"
        return gen_ok, (f"no dedicated NorthSea crews configured; fallback general crew: {gen_reden}")

    def status(self) -> dict:
        gen_ok, gen_reden = self.general.available()
        local_on = bool(getattr(self.local, "enabled", False))
        return {
            "local": {
                "enabled": local_on,
                "specialists": {r: {"crew": CREW_FOR_ROUTE[r], "agents": len(ROLES_FOR_ROUTE[r]),
                                    "specialist_id": SPECIALIST_FOR_ROUTE[r]} for r in SPECIALIST_FOR_ROUTE},
            },
            "routes": {r: {"crew": CREW_FOR_ROUTE[r], "dedicated_configured": self.studio.configured(r),
                           "local": local_on and r in SPECIALIST_FOR_ROUTE,
                           "nested_studio_copy": False} for r in CREW_FOR_ROUTE},
            "fallback": {"backend": "axe_general_crew", "available": gen_ok, "detail": gen_reden,
                         "permitted_reasons": list(self.fallback_on)},
            "studio_optional": True,
        }

    async def aclose(self) -> None:
        await self._client.aclose()

    async def run(self, action: str, handoff: dict[str, Any]) -> CrewRunInfo:
        if action == "unroutable" or ROUTE_FOR_ACTION.get(action) == "unroutable":
            return CrewRunInfo(used=False, status="unroutable", route="unroutable",
                               reason="event is unroutable; no specialist crew executed", validation="not_validated")
        route = ROUTE_FOR_ACTION.get(action, "deal_run")
        gevraagd = CREW_FOR_ROUTE[route]
        t0 = time.monotonic()
        deadline = t0 + self._timeout
        pogingen: list[Attempt] = []
        timings: dict[str, float] = {}
        basis = dict(route=route, requested_crew=gevraagd, crew=SHORT_NAME[route])

        # ── PRIMAIR: lokale specialist-crew (Studio mag down zijn) ───────────
        if getattr(self.local, "enabled", False) and self.local.configured(route):
            l0 = time.monotonic()
            local_res = await self.local.run(route, action, handoff, deadline)
            timings["local_run_s"] = round(time.monotonic() - l0, 2)
            pogingen.append(Attempt("northsea_local", local_res.status, local_res.detail, time.monotonic() - l0))
            if local_res.status == "ok" and local_res.output:
                timings["total_s"] = round(time.monotonic() - t0, 2)
                if local_res.execution_s is not None:
                    timings["crew_execution_s"] = float(local_res.execution_s)
                o = local_res.output
                return CrewRunInfo(used=True, run_id=local_res.run_id, status="ok", analysis=o.analysis[:6000],
                                   backend="northsea_local", actual_crew=gevraagd, fallback_used=False,
                                   models=o.models, skills=o.skills, tools=o.tools, budget_usage=o.budget_usage,
                                   timings=timings, validation="valid",
                                   attempts=[p.as_dict() for p in pogingen], **basis)
            # lokale fout: NorthSea stopt niet; Studio is optioneel, daarna zichtbare fallback

        # ── OPTIONEEL: Studio-AMP als die geconfigureerd is ──────────────────
        reden: str | None
        if not self.studio.configured(route):
            reden = "dedicated_backend_not_configured"
            pogingen.append(Attempt("northsea_crewai", "not_configured"))
        else:
            h0 = time.monotonic()
            ok, waarom = await self.studio.health(route)
            timings["dedicated_health_s"] = round(time.monotonic() - h0, 2)
            if not ok:
                reden = "health_check_failed"
                pogingen.append(Attempt("northsea_crewai", "health_check_failed", waarom, time.monotonic() - h0))
            else:
                r0 = time.monotonic()
                inputs = {"route": route, "action": action, "handoff": json.dumps(handoff, default=str)[:20000],
                          "roles": ", ".join(ROLES_FOR_ROUTE[route]), "prohibited_actions": " ".join(PROHIBITED)}
                res = await self.studio.run(route, inputs, deadline)
                timings["dedicated_run_s"] = round(time.monotonic() - r0, 2)
                pogingen.append(Attempt("northsea_crewai", res.status, res.detail, time.monotonic() - r0))
                if res.status == "ok" and res.output:
                    timings["total_s"] = round(time.monotonic() - t0, 2)
                    if res.execution_s is not None:
                        timings["crew_execution_s"] = float(res.execution_s)
                    o = res.output
                    return CrewRunInfo(used=True, run_id=res.run_id, status="ok", analysis=o.analysis[:6000], backend="northsea_crewai",
                                       actual_crew=gevraagd, fallback_used=False, models=o.models, skills=o.skills, tools=o.tools,
                                       budget_usage=o.budget_usage, timings=timings, validation="valid",
                                       attempts=[p.as_dict() for p in pogingen], **basis)
                if res.status == "invalid":
                    # Ongeldige uitvoer is geen reden om stil iets anders te draaien: melden.
                    timings["total_s"] = round(time.monotonic() - t0, 2)
                    return CrewRunInfo(used=True, run_id=res.run_id, status="invalid_output", backend="northsea_crewai",
                                       actual_crew=gevraagd, fallback_used=False, validation="invalid", timings=timings,
                                       reason=res.detail, attempts=[p.as_dict() for p in pogingen], **basis)
                reden = {"capacity": "capacity_exhausted", "timeout": "timeout", "unavailable": "dedicated_backend_unavailable"}.get(res.status)
                if reden is None:  # crew-uitvoerfout: geen toegestane fallbackreden
                    timings["total_s"] = round(time.monotonic() - t0, 2)
                    return CrewRunInfo(used=True, run_id=res.run_id, status="error", backend="northsea_crewai", actual_crew=gevraagd,
                                       fallback_used=False, validation="not_validated", timings=timings, reason=res.detail,
                                       attempts=[p.as_dict() for p in pogingen], **basis)

        # ── FALLBACK: algemene AXE CORE-crew, alleen als het beleid het toestaat ──
        if reden not in self.fallback_on:
            timings["total_s"] = round(time.monotonic() - t0, 2)
            return CrewRunInfo(used=False, status="unavailable", backend=None, fallback_used=False, validation="not_validated",
                               timings=timings, attempts=[p.as_dict() for p in pogingen],
                               reason=f"{gevraagd} not executed ({reden}); fallback to the general crew is not permitted by policy", **basis)
        gen_ok, gen_reden = self.general.available()
        rest = deadline - time.monotonic()
        if not gen_ok or rest < self._min_fallback_s:
            waarom = gen_reden if not gen_ok else f"only {rest:.0f}s left before the deadline"
            pogingen.append(Attempt("axe_general_crew", "not_attempted", waarom))
            timings["total_s"] = round(time.monotonic() - t0, 2)
            return CrewRunInfo(used=gen_ok, status="unavailable" if not gen_ok else "timeout", backend=None, fallback_used=False,
                               fallback_reason=reden, validation="not_validated", timings=timings,
                               attempts=[p.as_dict() for p in pogingen],
                               reason=f"{gevraagd} not executed ({reden}); fallback not possible: {waarom}", **basis)
        f0 = time.monotonic()
        res = await self.general.run(route, action, handoff, timeout=rest)
        timings["fallback_run_s"] = round(time.monotonic() - f0, 2)
        timings["total_s"] = round(time.monotonic() - t0, 2)
        pogingen.append(Attempt("axe_general_crew", res.status, res.detail, time.monotonic() - f0))
        return CrewRunInfo(
            used=True, run_id=res.run_id or str(uuid.uuid4()), status=res.status if res.status in ("ok", "busy", "timeout") else "error",
            analysis=res.analysis if res.status == "ok" else None, backend="axe_general_crew",
            actual_crew=GENERAL_CREW, fallback_used=True, fallback_reason=reden,
            models=[], skills=[], tools=[f"specialist:{s}" for s in res.specialists], budget_usage={}, timings=timings,
            validation="not_validated", attempts=[p.as_dict() for p in pogingen],
            reason=None if res.status == "ok" else res.detail, **basis)
