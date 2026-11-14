"""Wat de NorthSea-manager elke pulse naloopt, en wanneer hij Luka roept.

## Waarom dit bestaat

Tot 6 november las `run_northseamgr` alleen `core_approvals` in het AXE-project.
NorthSea staat in een andere database (AXE Commodities), dus de manager zag
NorthSea helemaal niet, en rapporteerde elke kwartier "first deal remains the
priority" terwijl er twee dingen stillagen:

* **Er kwam geen mail meer binnen.** Sinds de week van 5 oktober nul inkomend,
  tegen ruim negentig uitgaand. De MX van northseacommodity.com wijst naar
  Google Workspace, dus antwoorden landen in Gmail en `resend-inbound` krijgt
  ze nooit (Resend's ontvangen-inbox was op 6 nov leeg).
* **De motor tikte niet meer.** De planner zei elk kwartier "ok", maar de
  laatste engine_tick in het auditlog was 29 oktober.

Geen van beide is van buiten te zien als je alleen naar "planner ok" kijkt.
Deze module kijkt naar wat er wérkelijk gebeurde.

## Wat hier wel en niet gebeurt

Alleen lezen, via `northsea_gateway` (dezelfde servicetoken die de Global
Trade Center gebruikt). `beoordeel` is puur: drie antwoorden erin, bevindingen
eruit, testbaar zonder netwerk. Wat er met een bevinding gebeurt (Luka vragen,
melding sturen) beslist de manager in grok_managers.py.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

# Zoveel weken zonder één inkomende mail, terwijl er wel post uitgaat, is geen
# stille markt meer maar een kapotte ontvangst.
STIL_WEKEN = 3
MIN_UITGAAND_IN_STILTE = 10
# De motor hoort elk kwartier te tikken; twee uur zonder tick is stilstand.
MOTOR_STIL_NA = timedelta(hours=2)


@dataclass(frozen=True)
class Bevinding:
    code: str
    # "luka" = hij moet iets doen; "info" = alleen in het dagoverzicht.
    voor: str
    titel: str
    detail: str


def _tijd(s: Any) -> datetime | None:
    if not isinstance(s, str) or not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _inbound_stil(metrics: dict[str, Any], nu: datetime) -> Bevinding | None:
    weken = metrics.get("by_week") or {}
    if not isinstance(weken, dict) or not weken:
        return None
    # Alleen hele weken tellen: de lopende week is nog niet af.
    grens = (nu - timedelta(days=nu.weekday())).date().isoformat()
    afgerond = sorted(k for k in weken if k < grens)[-STIL_WEKEN:]
    if len(afgerond) < STIL_WEKEN:
        return None
    inkomend = sum(int((weken[k] or {}).get("inbound") or 0) for k in afgerond)
    uitgaand = sum(int((weken[k] or {}).get("outbound") or 0) for k in afgerond)
    if inkomend > 0 or uitgaand < MIN_UITGAAND_IN_STILTE:
        return None
    laatste = max((k for k, v in weken.items() if int((v or {}).get("inbound") or 0) > 0), default=None)
    sinds = f"sinds de week van {laatste}" if laatste else f"in de laatste {STIL_WEKEN} weken"
    return Bevinding(
        code="inbound_stil",
        voor="luka",
        titel="NorthSea: er komt geen mail meer binnen",
        detail=(
            f"{sinds} 0 inkomende mails, tegen {uitgaand} uitgaande in {STIL_WEKEN} weken. "
            "Antwoorden van kopers bereiken de desk niet: sinds Google Workspace (8 okt) "
            "landt alle mail in Gmail. Laat Gmail trade@ en support@ ook afleveren op "
            "het Resend-ontvangstadres (Google Admin > Gmail > Routing)."
        ),
    )


def _motor_stil(health: dict[str, Any], nu: datetime) -> Bevinding | None:
    """Stilstand = de planner heeft de motor al twee uur niet gedraaid.

    Hier stond de laatste `engine_tick` uit live operations. Die leest het
    auditlog afgekapt in (health meldt `northsea_audit_events` als truncated)
    en gaf op 6 nov "29 oktober", terwijl core_job_runs elk kwartier een echte
    run met werk erin liet zien. Het eerste pulse na de uitrol zou Luka dus een
    valse "motor tikt niet" hebben gestuurd. De run-tijd van de planner is de
    meting die klopt.
    """
    s = health.get("scheduler") or {}
    if not s.get("enabled"):
        return None
    laatste = _tijd(s.get("last_run_at"))
    if laatste and nu - laatste < MOTOR_STIL_NA:
        return None
    wanneer = laatste.strftime("%d-%m %H:%M UTC") if laatste else "onbekend"
    return Bevinding(
        code="motor_stil",
        voor="luka",
        titel="NorthSea: de motor draait niet",
        detail=f"De laatste run van de NorthSea-motor was {wanneer}; hij hoort elk kwartier te draaien.",
    )


def _planner_fout(health: dict[str, Any]) -> Bevinding | None:
    s = health.get("scheduler") or {}
    fouten = int(s.get("consecutive_failures") or 0)
    # "skipped" is geen storing: de motor haalde zijn tijdsbudget, bewaarde zijn
    # voortgang en gaat de volgende ronde verder (main.py). Tot 10 nov las de
    # manager dat als "de planner faalt", 1-5 keer per dag. Zelfde regel als de
    # roosterbewaking in main.py: alleen een echte fout na een echte fout.
    if fouten <= 0 or s.get("last_status") in (None, "ok", "success", "skipped"):
        return None
    return Bevinding(
        code="planner_fout",
        voor="luka",
        titel="NorthSea: de planner faalt",
        # Zonder het oplopende getal: anders is elk kwartier een "nieuw" bericht
        # (14 nov: 61, 62, 63 keer... in Luka's chat).
        detail=f"Laatste status {s.get('last_status')!r}; hij lukt al meerdere rondes achter elkaar niet.",
    )


def _database(health: dict[str, Any]) -> Bevinding | None:
    db = health.get("database") or {}
    if db.get("reachable", True):
        return None
    return Bevinding("database_weg", "luka", "NorthSea: database onbereikbaar",
                     "De AXE Commodities-database antwoordt niet; de desk staat stil.")


def _wachtrij(ops: dict[str, Any]) -> Bevinding | None:
    goedkeuren = (ops.get("approval_required") or {})
    n = int(goedkeuren.get("count") or 0)
    wacht = int((ops.get("waiting") or {}).get("chase_waiting_reply") or 0)
    if not n and not wacht:
        return None
    onderwerpen = [str(i.get("subject") or "")[:70] for i in (goedkeuren.get("items") or [])[:3]]
    eerste = "; ".join(o for o in onderwerpen if o)
    return Bevinding(
        code="wachtrij",
        voor="info",
        titel=f"{n} wachten op jouw ok, {wacht} wachten op antwoord",
        detail=f"Eerst: {eerste}" if eerste else "",
    )


def beoordeel(health: dict[str, Any], ops: dict[str, Any], metrics: dict[str, Any],
              nu: datetime) -> list[Bevinding]:
    """Alle bevindingen, de dringendste eerst. Puur: geen netwerk, geen klok."""
    uit = [b for b in (
        _database(health),
        _planner_fout(health),
        _motor_stil(health, nu),
        _inbound_stil(metrics, nu),
        _wachtrij(ops),
    ) if b]
    return sorted(uit, key=lambda b: 0 if b.voor == "luka" else 1)


Ophaler = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


async def _haal_async(ophaler: Ophaler) -> tuple[dict, dict, dict]:
    antwoorden = await asyncio.gather(
        ophaler("get_system_health", {}),
        ophaler("get_live_operations", {}),
        ophaler("get_communications_metrics", {"weeks": 8}),
    )
    return tuple((a or {}).get("result") or {} for a in antwoorden)  # type: ignore[return-value]


def haal(ophaler: Ophaler | None = None) -> tuple[dict, dict, dict]:
    """De drie leesacties via de gateway. Draait in de pulse-thread, dus een eigen loop mag."""
    if ophaler is None:
        import northsea_gateway
        ophaler = northsea_gateway.call_action
    return asyncio.run(_haal_async(ophaler))
