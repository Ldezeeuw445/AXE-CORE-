"""Missies: een uitkomst boven losse taken, die zichzelf voortzet.

## Waarom dit bestaat

De kernel (task_runtime.py) voert één taak duurzaam uit: lease, heartbeat,
retry, approval, bewijs. Maar na die ene taak stopte alles tot Luka "ga door"
zei. Een missie onthoudt het grotere doel, en na elke afgeronde stap kiest de
missielus (mission_engine.py) zelf de volgende:

    KIJK → KIES VOLGENDE ACTIE → VOER UIT → VERIFIEER → LEG VAST → WERK MISSIE BIJ → KIES ...

Uitvoeren is altijd een gewone core_task. Er is dus geen tweede uitvoerder:
dezelfde worker, dezelfde approvals, dezelfde bewijsplicht.

## Wanneer stopt een missie

Alleen als (a) het doel bereikt is en elke mijlpaal bewijs heeft, (b) hij echt
vastzit, (c) er een beslissing van Luka nodig is, of (d) Luka hem pauzeert.
Een plan is nooit een eindresultaat: de agent moet `finish` aanroepen met een
commando dat het resultaat aantoont, en de worker controleert dat.

`continue_until` bepaalt wat er tussen mijlpalen gebeurt:
  - complete / blocked (default): automatisch door naar de volgende mijlpaal.
  - human_decision_required: na elke mijlpaal Luka laten beslissen.
  - paused: na elke mijlpaal pauzeren (stapmodus).

## Dit bestand

Alleen de pure beslisregel en de opslag. Geen lus, geen timers -- die zitten
in mission_engine.py en draaien in het worker-proces op de server, nooit in de
app. Alles hier is los te testen zonder database.
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import UUID

MISSIE_STATUSSEN = (
    "draft", "active", "monitoring", "waiting_agent", "waiting_approval",
    "blocked", "human_decision_required", "paused", "completed", "failed", "cancelled",
)
RUNNABLE = {"active", "monitoring", "waiting_agent", "waiting_approval"}
EINDE = {"completed", "failed", "cancelled"}
CONTINUE_UNTIL = ("complete", "blocked", "human_decision_required", "paused")

TAAK_BEZIG = {"pending", "queued", "planning", "running", "in_progress", "verifying", "retrying", "approved", "blocked"}
TAAK_KLAAR = {"completed", "done"}

# Hoe lang de lus wegblijft als er niets te kiezen is. De trigger op core_tasks
# zet next_run_at terug op nu() zodra een missie-taak van status wisselt, dus
# dit is alleen het vangnet, niet de reactietijd.
WACHT_TAAK_LOOPT = 120
WACHT_GOEDKEURING = 600


def nu() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()


# ── Wat de agent aan het eind zegt ───────────────────────────────────────────

_RAPPORT = re.compile(
    r"MILESTONE\s*:\s*(done|continue|blocked|human)\b(.*)$",
    re.IGNORECASE | re.MULTILINE,
)


def lees_rapport(samenvatting: str | None) -> tuple[str, str | None]:
    """('done'|'continue'|'blocked'|'human', toelichting).

    Zonder regel is het 'done': de worker heeft het bewijs al gecontroleerd,
    dus een geverifieerde taak zonder rapport heeft zijn mijlpaal gehaald.
    De laatste MILESTONE-regel telt -- een agent die eerst "continue" en dan
    "done" schrijft, is klaar.
    """
    tekst = str(samenvatting or "")
    treffers = list(_RAPPORT.finditer(tekst))
    if not treffers:
        return "done", None
    laatste = treffers[-1]
    oordeel = laatste.group(1).lower()
    rest = laatste.group(2).strip()
    rest = re.sub(r"^(NEXT_ACTION|REASON)\s*:\s*", "", rest, flags=re.IGNORECASE)
    rest = re.sub(r"^[-—:\s]+", "", rest)
    rest = re.sub(r"^(NEXT_ACTION|REASON)\s*:\s*", "", rest, flags=re.IGNORECASE)
    return oordeel, (rest or None)


def normaliseer_mijlpalen(ruw: list[Any] | None) -> list[dict[str, Any]]:
    """Strings of dicts → de vaste vorm die de lus verwacht."""
    uit: list[dict[str, Any]] = []
    for i, item in enumerate(ruw or []):
        if isinstance(item, str):
            item = {"title": item}
        if not isinstance(item, dict) or not str(item.get("title") or "").strip():
            raise ValueError(f"milestone {i} needs a title")
        uit.append({
            "key": str(item.get("key") or f"m{i + 1}"),
            "title": str(item["title"]).strip(),
            "goal": str(item.get("goal") or item["title"]).strip(),
            "status": str(item.get("status") or "pending"),
            "task_id": item.get("task_id"),
            "attempts": int(item.get("attempts") or 0),
            "iterations": int(item.get("iterations") or 0),
            "next_action": item.get("next_action"),
            "evidence": item.get("evidence"),
            "last_error": item.get("last_error"),
            "completed_at": item.get("completed_at"),
        })
    keys = [m["key"] for m in uit]
    if len(keys) != len(set(keys)):
        raise ValueError("milestone keys must be unique")
    return uit


def voortgang(mijlpalen: list[dict[str, Any]]) -> float:
    if not mijlpalen:
        return 0.0
    klaar = sum(1 for m in mijlpalen if m.get("status") == "completed")
    return round(klaar / len(mijlpalen), 4)


# ── De beslisregel ───────────────────────────────────────────────────────────

@dataclass
class NieuweTaak:
    """De volgende stap, als gewone core_task voor de eigenaar-agent."""
    mijlpaal_index: int
    title: str
    request: str
    idempotency_key: str
    agent: str


@dataclass
class Besluit:
    status: str
    velden: dict[str, Any] = field(default_factory=dict)
    taak: NieuweTaak | None = None
    events: list[tuple[str, str, dict[str, Any]]] = field(default_factory=list)
    wacht_seconden: int = 0
    melding: tuple[str, str] | None = None   # (titel, detail) voor Luka


def _cyclus(missie: dict[str, Any]) -> int:
    return int((missie.get("metadata") or {}).get("cycle") or 0)


def bouw_verzoek(missie: dict[str, Any], mijlpalen: list[dict[str, Any]], index: int) -> str:
    """De opdracht aan de agent. Doen, niet plannen; bewijzen, niet beweren."""
    m = mijlpalen[index]
    vorige = None
    for eerder in reversed(mijlpalen[: index + 1]):
        ev = eerder.get("evidence") or {}
        if ev.get("summary"):
            vorige = f"{eerder['title']}: {str(ev['summary'])[:800]}"
            break
    regels = [
        f"[AXE mission] {missie['title']}",
        f"Mission goal: {missie['goal']}",
        f"Milestone {index + 1}/{len(mijlpalen)}: {m['title']}",
        f"Milestone goal: {m['goal']}",
    ]
    if m.get("next_action"):
        regels.append(f"Next action (chosen after the previous step): {m['next_action']}")
    else:
        regels.append("Next action: decide the most useful concrete step for this milestone and do it.")
    if vorige:
        regels.append(f"Previous verified result: {vorige}")
    if m.get("last_error"):
        regels.append(f"The previous attempt failed with: {str(m['last_error'])[:800]}. Fix the cause, do not repeat it.")
    if missie.get("supporting_agents"):
        regels.append("Supporting agents you may delegate to: " + ", ".join(missie["supporting_agents"]))
    regels += [
        "",
        "Execution contract:",
        "- Do the work. A plan is input to execution, not the result.",
        "- Finish only with a verify_command that proves the result exists.",
        "- End your finish summary with exactly one line:",
        "  MILESTONE: done",
        "  MILESTONE: continue NEXT_ACTION: <the next concrete step for this milestone>",
        "  MILESTONE: blocked REASON: <what blocks you and what would unblock it>",
        "  MILESTONE: human REASON: <the decision only Luka can make>",
    ]
    return "\n".join(regels)


def _nieuwe_taak(missie: dict[str, Any], mijlpalen: list[dict[str, Any]], index: int) -> NieuweTaak:
    m = mijlpalen[index]
    sleutel = (
        f"mission:{missie['id']}:c{_cyclus(missie)}:r{int((missie.get('metadata') or {}).get('resumes') or 0)}:{m['key']}"
        f":i{int(m.get('iterations') or 0)}:a{int(m.get('attempts') or 0)}"
    )
    return NieuweTaak(
        mijlpaal_index=index,
        title=f"{missie['title']} · {m['title']}"[:200],
        request=bouw_verzoek(missie, mijlpalen, index),
        idempotency_key=sleutel,
        agent=str(missie.get("owner_agent") or "axe"),
    )


def _bewijs(taak: dict[str, Any]) -> dict[str, Any] | None:
    resultaat = taak.get("result") or {}
    verificatie = resultaat.get("verification")
    if not isinstance(verificatie, dict) or not verificatie.get("passed"):
        return None
    return {
        "task_id": taak.get("id"),
        "summary": str(resultaat.get("summary") or "")[:2000],
        "verification": verificatie,
        "completed_at": taak.get("completed_at"),
    }


def _afronden(missie: dict[str, Any], mijlpalen: list[dict[str, Any]], moment: datetime) -> Besluit:
    """Alle mijlpalen klaar. Eenmalig → completed; doorlopend → volgende ronde."""
    zonder_bewijs = [m["title"] for m in mijlpalen if not (m.get("evidence") or {}).get("verification")]
    if zonder_bewijs:
        # Mag niet kunnen, maar een missie zonder bewijs afronden is precies de
        # fout die deze laag moet voorkomen.
        return Besluit(
            status="blocked",
            velden={"blocked_reason": "Milestones without evidence: " + ", ".join(zonder_bewijs),
                    "last_stop_reason": "no_evidence"},
            events=[("mission.blocked", "Refusing to complete without evidence.", {"missing": zonder_bewijs})],
        )
    interval = missie.get("recurring_interval_seconds")
    if interval:
        cyclus = _cyclus(missie) + 1
        vers = [dict(m, status="pending", task_id=None, attempts=0, iterations=0,
                     next_action=None, last_error=None, completed_at=None)
                for m in mijlpalen]
        meta = dict(missie.get("metadata") or {}, cycle=cyclus, last_cycle_completed_at=iso(moment))
        return Besluit(
            status="monitoring",
            velden={"milestones": vers, "current_milestone": 0, "progress": 0,
                    "next_action": f"Next cycle at {iso(moment + timedelta(seconds=int(interval)))}",
                    "metadata": meta, "blocked_reason": None},
            wacht_seconden=int(interval),
            events=[("mission.cycle_completed", f"Cycle {cyclus} completed; monitoring until the next one.",
                     {"cycle": cyclus, "interval_seconds": int(interval)})],
        )
    return Besluit(
        status="completed",
        velden={"milestones": mijlpalen, "current_milestone": len(mijlpalen), "progress": 1,
                "completed_at": iso(moment), "next_action": None, "blocked_reason": None,
                "last_stop_reason": "complete"},
        events=[("mission.completed", f"Mission complete: {missie['title']}",
                 {"milestones": len(mijlpalen)})],
        melding=("Mission complete", missie["title"]),
    )


def beslis(missie: dict[str, Any], taak: dict[str, Any] | None, moment: datetime | None = None) -> Besluit:
    """Kies de volgende stap op basis van de echte staat. Puur: schrijft niets.

    `taak` is de core_task van de huidige mijlpaal (of None als er geen is).
    """
    moment = moment or nu()
    mijlpalen = copy.deepcopy(normaliseer_mijlpalen(missie.get("milestones")))
    status = missie.get("status") or "active"
    if status not in RUNNABLE:
        return Besluit(status=status)
    if not mijlpalen:
        return Besluit(
            status="human_decision_required",
            velden={"blocked_reason": "Mission has no milestones yet.", "last_stop_reason": "no_milestones"},
            events=[("mission.needs_human", "Mission has no milestones; AXE needs a plan from Luka.", {})],
            melding=("Mission needs milestones", missie["title"]),
        )

    index = int(missie.get("current_milestone") or 0)
    if index >= len(mijlpalen):
        return _afronden(missie, mijlpalen, moment)

    m = mijlpalen[index]
    max_pogingen = int(missie.get("max_attempts_per_milestone") or 3)
    max_iteraties = int(missie.get("max_iterations_per_milestone") or 5)

    def start(i: int, waarom: str, extra_events: list[tuple[str, str, dict[str, Any]]] | None = None) -> Besluit:
        mijlpalen[i]["status"] = "working"
        mijlpalen[i]["task_id"] = None
        nieuw = dict(missie, milestones=mijlpalen, current_milestone=i)
        t = _nieuwe_taak(nieuw, mijlpalen, i)
        return Besluit(
            status="active",
            velden={"milestones": mijlpalen, "current_milestone": i, "progress": voortgang(mijlpalen),
                    "next_action": mijlpalen[i].get("next_action") or f"Work on: {mijlpalen[i]['title']}",
                    "blocked_reason": None},
            taak=t,
            events=(extra_events or []) + [("mission.action_chosen", waarom,
                                            {"milestone": mijlpalen[i]["key"], "idempotency_key": t.idempotency_key})],
            wacht_seconden=WACHT_TAAK_LOOPT,
        )

    # Nog geen taak voor deze mijlpaal (of hij is verdwenen): begin.
    if not m.get("task_id") or taak is None:
        return start(index, f"Starting milestone {index + 1}: {m['title']}")

    ts = str(taak.get("status") or "")

    if ts == "waiting_approval":
        events = []
        if status != "waiting_approval":
            events.append(("mission.waiting_approval", "A step needs Luka's approval; progress is preserved.",
                           {"task_id": taak.get("id")}))
        return Besluit(
            status="waiting_approval",
            velden={"next_action": "Waiting for Luka's approval on: " + str(taak.get("title") or "")[:160]},
            events=events,
            wacht_seconden=WACHT_GOEDKEURING,
        )

    if ts in TAAK_BEZIG:
        doel = "waiting_agent" if (taak.get("assignee") and taak.get("assignee") != missie.get("owner_agent")) else "active"
        events = []
        if status == "waiting_approval":
            events.append(("mission.resumed", "Approval decided; the step continues.", {"task_id": taak.get("id")}))
        return Besluit(status=doel, events=events, wacht_seconden=WACHT_TAAK_LOOPT)

    if ts in TAAK_KLAAR:
        bewijs = _bewijs(taak)
        if bewijs is None:
            ts = "failed"   # "klaar" zonder bewijs telt niet als klaar.
            taak = dict(taak, error={"message": "Task completed without verification evidence."})
        else:
            oordeel, toelichting = lees_rapport(bewijs["summary"])
            m["evidence"] = bewijs
            m["last_error"] = None
            stap_event = ("mission.step_verified", f"Verified step for {m['title']}",
                          {"task_id": taak.get("id"), "verdict": oordeel})
            if oordeel == "continue" and int(m.get("iterations") or 0) + 1 < max_iteraties:
                m["iterations"] = int(m.get("iterations") or 0) + 1
                m["next_action"] = toelichting or "Continue the milestone."
                return start(index, f"Next action for {m['title']}: {m['next_action'][:200]}", [stap_event])
            if oordeel == "blocked":
                m["status"] = "blocked"
                reden = toelichting or "Agent reported it is blocked."
                return Besluit(
                    status="blocked",
                    velden={"milestones": mijlpalen, "blocked_reason": reden, "last_stop_reason": "agent_blocked",
                            "next_action": None},
                    events=[stap_event, ("mission.blocked", reden, {"milestone": m["key"]})],
                    melding=(f"Mission blocked: {missie['title']}", reden),
                )
            if oordeel == "human":
                reden = toelichting or "Agent needs a decision from Luka."
                return Besluit(
                    status="human_decision_required",
                    velden={"milestones": mijlpalen, "blocked_reason": reden, "last_stop_reason": "human_decision",
                            "next_action": None},
                    events=[stap_event, ("mission.needs_human", reden, {"milestone": m["key"]})],
                    melding=(f"Decision needed: {missie['title']}", reden),
                )
            # done (of continue maar het iteratiebudget is op)
            m["status"] = "completed"
            m["completed_at"] = taak.get("completed_at") or iso(moment)
            m["next_action"] = None
            klaar_event = ("milestone.completed", f"Milestone {index + 1}/{len(mijlpalen)} complete: {m['title']}",
                           {"milestone": m["key"], "task_id": taak.get("id")})
            volgende = index + 1
            if volgende >= len(mijlpalen):
                b = _afronden(dict(missie, milestones=mijlpalen), mijlpalen, moment)
                b.events = [stap_event, klaar_event] + b.events
                return b
            stop = missie.get("continue_until") or "complete"
            if stop in ("paused", "human_decision_required"):
                return Besluit(
                    status="paused" if stop == "paused" else "human_decision_required",
                    velden={"milestones": mijlpalen, "current_milestone": volgende, "progress": voortgang(mijlpalen),
                            "next_action": f"Start: {mijlpalen[volgende]['title']}",
                            "last_stop_reason": f"continue_until={stop}"},
                    events=[stap_event, klaar_event,
                            ("mission.paused", f"Stopped after milestone by continue_until={stop}.", {})],
                    melding=(f"Milestone done: {m['title']}", f"Next: {mijlpalen[volgende]['title']}"),
                )
            return start(volgende, f"Continuing automatically with milestone {volgende + 1}: {mijlpalen[volgende]['title']}",
                         [stap_event, klaar_event])

    if ts == "failed":
        m["attempts"] = int(m.get("attempts") or 0) + 1
        fout = taak.get("error") or {}
        m["last_error"] = str(fout.get("message") if isinstance(fout, dict) else fout)[:1000] or "unknown error"
        if m["attempts"] < max_pogingen:
            return start(index, f"Retrying {m['title']} (attempt {m['attempts'] + 1}/{max_pogingen}) after: {m['last_error'][:160]}",
                         [("mission.step_failed", m["last_error"][:300], {"task_id": taak.get("id"), "attempts": m["attempts"]})])
        m["status"] = "blocked"
        reden = f"{m['title']} failed {m['attempts']}x: {m['last_error'][:300]}"
        return Besluit(
            status="blocked",
            velden={"milestones": mijlpalen, "blocked_reason": reden, "last_stop_reason": "retries_exhausted"},
            events=[("mission.blocked", reden, {"task_id": taak.get("id")})],
            melding=(f"Mission blocked: {missie['title']}", reden),
        )

    if ts == "rejected":
        reden = f"Luka rejected a step in {m['title']}."
        return Besluit(
            status="human_decision_required",
            velden={"milestones": mijlpalen, "blocked_reason": reden, "last_stop_reason": "rejected"},
            events=[("mission.needs_human", reden, {"task_id": taak.get("id")})],
        )

    if ts == "cancelled":
        return Besluit(
            status="paused",
            velden={"milestones": mijlpalen, "blocked_reason": "The current step was cancelled.",
                    "last_stop_reason": "task_cancelled"},
            events=[("mission.paused", "Current step was cancelled; mission paused.", {"task_id": taak.get("id")})],
        )

    return Besluit(status=status, wacht_seconden=WACHT_TAAK_LOOPT)


# ── Opslag ───────────────────────────────────────────────────────────────────

class MissieRepository:
    def __init__(self, client_factory: Callable[[], Any]):
        self._client_factory = client_factory

    def _db(self) -> Any:
        return self._client_factory()

    def event(self, mission_id: str, event_type: str, message: str = "", *,
              agent: str | None = None, task_id: str | None = None,
              data: dict[str, Any] | None = None) -> dict[str, Any]:
        from task_runtime import redact_event_data
        rij = {
            "mission_id": mission_id, "event_type": event_type, "message": message[:2000],
            "agent": agent, "task_id": task_id, "data": redact_event_data(data),
        }
        return self._db().table("core_mission_events").insert(rij).execute().data[0]

    def maak(self, payload: dict[str, Any]) -> dict[str, Any]:
        titel = str(payload.get("title") or "").strip()
        doel = str(payload.get("goal") or "").strip()
        eigenaar = str(payload.get("owner_agent") or "").strip()
        if not titel or not doel or not eigenaar:
            raise ValueError("title, goal and owner_agent are required")
        from agent_workspace import laad_workspace
        laad_workspace(eigenaar)   # onbekende agent = fout, geen stille AXE-val
        for steun in payload.get("supporting_agents") or []:
            laad_workspace(str(steun))
        stop = payload.get("continue_until") or "complete"
        if stop not in CONTINUE_UNTIL:
            raise ValueError(f"continue_until must be one of {CONTINUE_UNTIL}")
        mijlpalen = normaliseer_mijlpalen(payload.get("milestones"))
        rij = {
            "title": titel, "goal": doel, "owner_agent": eigenaar,
            "supporting_agents": [str(s) for s in payload.get("supporting_agents") or []],
            "status": "active" if mijlpalen else "human_decision_required",
            "priority": payload.get("priority") or "medium",
            "milestones": mijlpalen,
            "continue_until": stop,
            "recurring_interval_seconds": payload.get("recurring_interval_seconds"),
            "requested_by": payload.get("requested_by") or "luka",
            "next_action": f"Start: {mijlpalen[0]['title']}" if mijlpalen else "Needs milestones",
            "metadata": payload.get("metadata") or {},
        }
        for veld in ("max_attempts_per_milestone", "max_iterations_per_milestone"):
            if payload.get(veld):
                rij[veld] = int(payload[veld])
        missie = self._db().table("core_missions").insert(rij).execute().data[0]
        self.event(missie["id"], "mission.assigned", f"Mission assigned to {eigenaar}: {titel}",
                   agent=eigenaar, data={"milestones": len(mijlpalen), "continue_until": stop})
        return missie

    def haal(self, mission_id: str, na_sequence: int = 0) -> dict[str, Any] | None:
        UUID(str(mission_id))
        rijen = self._db().table("core_missions").select("*").eq("id", mission_id).limit(1).execute().data
        if not rijen:
            return None
        taken = (self._db().table("core_tasks")
                 .select("id,title,status,assignee,attempt,created_at,updated_at,completed_at,error")
                 .eq("mission_id", mission_id).order("created_at", desc=True).limit(50).execute().data)
        events = (self._db().table("core_mission_events").select("*")
                  .eq("mission_id", mission_id).gt("sequence", na_sequence)
                  .order("sequence").limit(500).execute().data)
        return {"mission": rijen[0], "tasks": taken, "events": events}

    def lijst(self, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        q = (self._db().table("core_missions").select("*")
             .order("updated_at", desc=True).limit(max(1, min(limit, 200))))
        if status:
            q = q.eq("status", status)
        return q.execute().data or []

    def claim(self, eigenaar: str, lease_seconds: int = 60) -> dict[str, Any] | None:
        rijen = self._db().rpc("claim_next_core_mission",
                               {"p_owner": eigenaar, "p_lease_seconds": lease_seconds}).execute().data
        return rijen[0] if rijen else None

    def taak(self, task_id: str | None) -> dict[str, Any] | None:
        if not task_id:
            return None
        rijen = self._db().table("core_tasks").select("*").eq("id", task_id).limit(1).execute().data
        return rijen[0] if rijen else None

    def schrijf(self, missie: dict[str, Any], velden: dict[str, Any], *, lease_token: str | None) -> dict[str, Any] | None:
        """Werk de missie bij en geef de lease vrij. Alleen met de eigen lease.

        Faalt stil (None) als iemand anders de missie intussen had: de lease
        was verlopen en de andere lus heeft hem. Die kiest zelf opnieuw, en de
        idempotency-sleutel van de taak voorkomt dat er dubbel werk ontstaat.
        """
        patch = dict(velden)
        patch["revision"] = int(missie.get("revision") or 0) + 1
        patch["updated_at"] = iso(nu())
        patch["lease_owner"] = None
        patch["lease_token"] = None
        patch["lease_expires_at"] = None
        q = self._db().table("core_missions").update(patch).eq("id", missie["id"])
        if lease_token:
            q = q.eq("lease_token", lease_token)
        rijen = q.execute().data
        return rijen[0] if rijen else None

    def zet_status(self, mission_id: str, status: str, *, door: str = "luka", reden: str | None = None,
                   notitie: str | None = None) -> dict[str, Any]:
        """Pauzeren, hervatten, annuleren door Luka. Overrulet een lease bewust.

        Hervatten na blocked/human_decision_required begint de huidige mijlpaal
        met een schone lei (pogingen op 0, geen dode taak meer), anders zou de
        lus meteen weer op dezelfde mislukte taak vastlopen. `notitie` is Luka's
        antwoord en wordt de volgende actie.
        """
        UUID(str(mission_id))
        if status not in ("active", "paused", "cancelled"):
            raise ValueError("status must be active, paused or cancelled")
        huidig = self._db().table("core_missions").select("*").eq("id", mission_id).limit(1).execute().data
        if not huidig:
            raise LookupError(mission_id)
        oud = huidig[0]
        if oud["status"] in EINDE:
            raise ValueError(f"mission is already {oud['status']}")
        patch: dict[str, Any] = {
            "status": status, "revision": int(oud.get("revision") or 0) + 1, "updated_at": iso(nu()),
            "lease_owner": None, "lease_token": None, "lease_expires_at": None,
            "last_stop_reason": reden or (f"{status}_by_{door}" if status != "active" else oud.get("last_stop_reason")),
        }
        if status == "active":
            patch["next_run_at"] = iso(nu())
            patch["blocked_reason"] = None
            mijlpalen = normaliseer_mijlpalen(oud.get("milestones"))
            i = int(oud.get("current_milestone") or 0)
            if i < len(mijlpalen):
                m = mijlpalen[i]
                lopend = self.taak(m.get("task_id"))
                # Ook een afgeronde taak: na "blocked"/"human" van de agent moet de
                # mijlpaal opnieuw, met Luka's antwoord, niet hetzelfde oordeel herlezen.
                if lopend is None or lopend.get("status") in {"failed", "cancelled", "rejected", "completed", "done"}:
                    m.update(task_id=None, attempts=0, status="pending")
                if notitie:
                    m["next_action"] = notitie
                    patch["next_action"] = notitie
                patch["milestones"] = mijlpalen
            # Nieuwe idempotency-ruimte: een hervatte mijlpaal mag niet de oude,
            # mislukte taak terugkrijgen omdat zijn sleutel toevallig gelijk is.
            meta = dict(oud.get("metadata") or {})
            meta["resumes"] = int(meta.get("resumes") or 0) + 1
            patch["metadata"] = meta
        rijen = self._db().table("core_missions").update(patch).eq("id", mission_id).execute().data
        soort = {"active": "mission.resumed", "paused": "mission.paused", "cancelled": "mission.cancelled"}[status]
        self.event(mission_id, soort, reden or f"{status} by {door}", agent=oud.get("owner_agent"),
                   data={"by": door, "from": oud["status"]})
        return rijen[0]
