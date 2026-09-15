"""De grens met CrewAI.

## Wat er vandaag WEL en NIET is

De canonieke NorthSea-pack beschrijft vier crews (Discovery, Deal, Intelligence,
Operations) met acht rollen. Die pack bevat op 15 september 2026 alleen een
scaffold: rollen in agents.yaml, crew-bouwers zonder taken, een router. Er zijn
geen NorthSea-crews die je kunt draaien.

Wat WEL draait is de AXE CORE-crew op de VPS: `/crew/run` op axe-core-api, in een
eigen venv (`/opt/axe-crew-venv`), met slots en een timeout (zuinig.py,
crew_runner.py). Deze module gebruikt precies die ingang, met een gestructureerde
NorthSea-handoff (crewai/HANDOFFS.md): entity-ids, geverifieerde feiten,
ongeverifieerde claims, blockers, verboden handelingen.

Zo is de grens echt en getest, en kunnen de NorthSea-crews later achter dezelfde
`run()` komen zonder dat één MCP-tool verandert.

## Wanneer CrewAI NIET wordt aangeroepen

Alleen bij `depth="deep"` en alleen voor tools die er in policy.TOOLS voor
gemarkeerd zijn. Een deal ophalen, gates tellen, acties rangschikken: dat is
deterministisch en hoort geen agent te kosten. Wat een crew teruggeeft is
ANALYSE, gemarkeerd als ongeverifieerd; het wordt nooit als feit opgeslagen.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

import httpx

from .models import CrewRunInfo

# Uit de NorthSea-pack (crewai/implementation/.../router.py): welke crew hoort bij welke actie.
CREW_FOR_ACTION = {
    "research_counterparty": "discovery", "find_suppliers": "discovery", "find_buyers": "discovery",
    "assess_match": "discovery", "qualify_opportunity": "deal", "investigate_blockers": "deal",
    "prepare_outreach": "deal", "process_reply": "deal", "review_deal": "deal", "get_next_actions": "deal",
}

PROHIBITED = [
    "Do not send any message.",
    "Do not accept prices, payment terms, commissions or contracts.",
    "Do not disclose buyer or seller identities.",
    "Do not mark any claim as verified; public sources are unverified.",
    "Do not invent contacts, inventory, allocation, authority, pricing, KYC status or readiness.",
]


class CrewGateway:
    # 170 s: binnen de guard-timeout voor deep (190 s) en nginx' proxy_read_timeout (200 s).
    # Wat langer duurt krijgt status "timeout"; de tool geeft dan wel zijn
    # deterministische resultaat terug in plaats van als geheel te falen.
    def __init__(self, *, axe_api_url: str, axe_api_key: str, crew_venv_py: str, timeout: float = 170.0,
                 client: httpx.AsyncClient | None = None):
        self._api = axe_api_url.rstrip("/")
        self._key = axe_api_key
        self._venv = crew_venv_py
        self._timeout = timeout
        self._client = client or httpx.AsyncClient(timeout=timeout)

    def available(self) -> tuple[bool, str]:
        if not self._key:
            return False, "AXE API key not configured for the crew boundary"
        if self._venv and not os.path.exists(self._venv):
            return False, "CrewAI venv not present on this host"
        return True, "ok"

    async def aclose(self) -> None:
        await self._client.aclose()

    async def run(self, action: str, handoff: dict[str, Any]) -> CrewRunInfo:
        crew = CREW_FOR_ACTION.get(action, "deal")
        ok, reason = self.available()
        if not ok:
            return CrewRunInfo(used=False, crew=crew, reason=reason)
        run_id = str(uuid.uuid4())
        task = (
            f"NorthSea {crew} crew, action {action}. Analyse the structured handoff and return: "
            "key risks, what evidence is missing, and the safest next steps. "
            "Use only the facts in the handoff. Constraints: " + " ".join(PROHIBITED)
        )
        context = json.dumps({"run_id": run_id, "crew": crew, **handoff}, default=str)[:12000]
        try:
            r = await self._client.post(f"{self._api}/crew/run", headers={"Authorization": f"Bearer {self._key}"},
                                        json={"task": task, "context": context}, timeout=self._timeout)
        except httpx.TimeoutException:
            return CrewRunInfo(used=True, crew=crew, run_id=run_id, status="timeout",
                               reason=f"crew did not finish within {self._timeout:.0f}s; deterministic result returned without crew analysis")
        except httpx.HTTPError as e:
            return CrewRunInfo(used=True, crew=crew, run_id=run_id, status="error",
                               reason=f"crew boundary unreachable ({type(e).__name__})")
        if r.status_code >= 400:
            return CrewRunInfo(used=True, crew=crew, run_id=run_id, status="error", reason=f"crew run failed ({r.status_code})")
        body = r.json() if r.content else {}
        status = str(body.get("status") or "unknown")
        # zuinig.py weigert een run als alle crew-slots bezet zijn ("2 crew-run(s) bezig").
        # Dat is geen fout van de crew maar drukte op de box; apart melden.
        if status != "ok" and re.search(r"bezig|busy|slot", str(body.get("error") or ""), re.I):
            return CrewRunInfo(used=True, crew=crew, run_id=run_id, status="busy",
                               reason="all CrewAI slots on the host are in use; retry later")
        text = body.get("result") if status == "ok" else None
        return CrewRunInfo(used=True, crew=crew, run_id=run_id, status=status,
                           analysis=str(text)[:6000] if text else None,
                           reason=None if status == "ok" else str(body.get("error") or "")[:300] or None)
