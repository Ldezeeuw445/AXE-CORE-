"""Wat doet elke agent echt? Status en tijdlijn uit de database, niets verzonnen.

Home toonde bijna altijd IDLE: de kaart keek naar de chat, niet naar het werk
dat op de server liep. Hier komt de status uit drie echte bronnen:

  * core_tasks       -- heeft deze agent een taak met een levende lease?
  * core_missions    -- hangt zijn missie op een goedkeuring, blokkade, interval?
  * core_agent_events -- wat gebeurde er als laatste, en wanneer?

WORKING is alleen waar als er een taak `running`/`in_progress`/`planning` staat
met een lease die nog niet verlopen is. Een verlopen lease is geen werk; dat is
een worker die weg is, en de kernel geeft die taak vanzelf aan een ander.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable

STATUSSEN = (
    "WORKING", "VERIFYING", "WAITING_TOOL", "WAITING_AGENT", "WAITING_APPROVAL",
    "QUEUED", "BLOCKED", "ERROR", "MONITORING", "MISSION_COMPLETE", "SLEEPING",
)
BEZIG = {"running", "in_progress", "planning"}
WACHTRIJ = {"queued", "retrying", "pending", "approved"}
RECENT_FOUT = timedelta(hours=6)
RECENT_KLAAR = timedelta(hours=24)


def _tijd(waarde: Any) -> datetime | None:
    if not waarde:
        return None
    if isinstance(waarde, datetime):
        return waarde if waarde.tzinfo else waarde.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(waarde).replace("Z", "+00:00"))
    except ValueError:
        return None


def _lease_leeft(taak: dict[str, Any], moment: datetime) -> bool:
    verloopt = _tijd(taak.get("lease_expires_at"))
    return bool(taak.get("lease_token")) and verloopt is not None and verloopt > moment


# ── Een event in mensentaal-categorie, puur op wat er staat ──────────────────

_SOORT_PATROON: list[tuple[str, re.Pattern[str]]] = [
    ("shell", re.compile(r"^Step \d+: \$ ")),
    ("file", re.compile(r"^Step \d+: (reading|writing) ")),
    ("crew", re.compile(r"CrewAI", re.I)),
    ("device", re.compile(r"^Step \d+: (checking which Macs|on (mac-mini|imac|vps))", re.I)),
]

EVENT_SOORTEN = {
    "task.queued": "task_queued", "task.claimed": "work_started", "task.running": "work_started",
    "task.verifying": "verifying", "task.completed": "result_returned", "task.failed": "error",
    "task.retrying": "retry", "task.cancelled": "cancelled", "task.waiting_approval": "waiting_approval",
    "task.deferred": "waiting_capacity", "approval.requested": "waiting_approval",
    "approval.approved": "resumed", "approval.rejected": "blocked",
    "verification.passed": "verified", "verification.failed": "verification_failed",
    "dax.ready": "dax", "mission.assigned": "mission_assigned", "task.selected": "task_selected",
    "mission.action_chosen": "next_action", "mission.step_verified": "verified",
    "milestone.completed": "milestone_completed", "mission.completed": "mission_completed",
    "mission.blocked": "blocked", "mission.needs_human": "waiting_human",
    "mission.waiting_approval": "waiting_approval", "mission.resumed": "resumed",
    "mission.paused": "paused", "mission.step_failed": "error", "mission.error": "error",
    "mission.cycle_completed": "milestone_completed", "agent.message": "message",
}


def soort_van(event: dict[str, Any]) -> str:
    et = str(event.get("event_type") or "")
    if et == "axe.progress":
        bericht = str(event.get("message") or "")
        for soort, patroon in _SOORT_PATROON:
            if patroon.search(bericht):
                return soort
        return "progress"
    return EVENT_SOORTEN.get(et, et.split(".")[-1] or "event")


def tijdlijn(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    uit = []
    for e in events:
        uit.append({
            "at": e.get("created_at"), "kind": soort_van(e), "event_type": e.get("event_type"),
            "message": e.get("message"), "task_id": e.get("task_id"), "mission_id": e.get("mission_id"),
            "source": e.get("source"),
        })
    return uit


# ── De status van één agent ──────────────────────────────────────────────────

def agent_status(
    agent: str,
    taken: list[dict[str, Any]],
    missies: list[dict[str, Any]],
    laatste_event: dict[str, Any] | None = None,
    moment: datetime | None = None,
) -> dict[str, Any]:
    """Status + waarom, uit de taken/missies van deze agent. Puur."""
    moment = moment or datetime.now(timezone.utc)
    mijn_taken = [t for t in taken if (t.get("assignee") or "axe") == agent]
    mijn_missies = [m for m in missies if m.get("owner_agent") == agent]

    def resultaat(status: str, reden: str, taak: dict[str, Any] | None = None,
                  missie: dict[str, Any] | None = None) -> dict[str, Any]:
        return {"agent": agent, "status": status, "reason": reden,
                "task": _taak_kort(taak), "mission": _missie_kort(missie)}

    def missie_van(taak: dict[str, Any] | None) -> dict[str, Any] | None:
        if not taak or not taak.get("mission_id"):
            return None
        return next((m for m in missies if m.get("id") == taak["mission_id"]), None)

    levend = [t for t in mijn_taken if t.get("status") in BEZIG and _lease_leeft(t, moment)]
    if levend:
        t = max(levend, key=lambda x: str(x.get("heartbeat_at") or ""))
        uit = resultaat("WORKING", f"Running task with a live lease (worker {t.get('worker_id')}).", t, missie_van(t))
        if laatste_event and laatste_event.get("task_id") == t.get("id"):
            uit["current_action"] = laatste_event.get("message")
            # De lus meldt een shell-/apparaatstap vóórdat hij draait en niets
            # erna: is dat het laatste event, dan wacht de agent op dat gereedschap.
            if soort_van(laatste_event) in ("shell", "device", "crew"):
                uit["status"] = "WAITING_TOOL"
        return uit

    verif = [t for t in mijn_taken if t.get("status") == "verifying" and _lease_leeft(t, moment)]
    if verif:
        return resultaat("VERIFYING", "Checking the proof of its last step.", verif[0], missie_van(verif[0]))

    wacht = [t for t in mijn_taken if t.get("status") == "waiting_approval"]
    wacht_m = [m for m in mijn_missies if m.get("status") == "waiting_approval"]
    if wacht or wacht_m:
        t = wacht[0] if wacht else None
        return resultaat("WAITING_APPROVAL", "A step is waiting for Luka's approval.", t, wacht_m[0] if wacht_m else missie_van(t))

    agent_wacht = [m for m in mijn_missies if m.get("status") == "waiting_agent"]
    if agent_wacht:
        return resultaat("WAITING_AGENT", "Waiting on another agent's step.", None, agent_wacht[0])

    vast = [m for m in mijn_missies if m.get("status") in ("blocked", "human_decision_required")]
    if vast:
        m = vast[0]
        return resultaat("BLOCKED", str(m.get("blocked_reason") or m["status"]), None, m)

    rij = [t for t in mijn_taken if t.get("status") in WACHTRIJ
           or (t.get("status") in BEZIG and not _lease_leeft(t, moment))]
    if rij:
        t = rij[0]
        reden = "Queued; a worker will pick it up." if t.get("status") in WACHTRIJ else \
            "Its worker stopped; the task will be recovered by the next claim."
        if laatste_event and laatste_event.get("task_id") == t.get("id") and soort_van(laatste_event) == "waiting_capacity":
            reden = "Waiting for DAX capacity."
        return resultaat("QUEUED", reden, t, missie_van(t))

    fouten = [t for t in mijn_taken if t.get("status") == "failed"
              and (_tijd(t.get("updated_at")) or moment) > moment - RECENT_FOUT]
    gelukt_na = [t for t in mijn_taken if t.get("status") in ("completed", "done")]
    if fouten:
        f = max(fouten, key=lambda x: str(x.get("updated_at") or ""))
        later_goed = any(str(g.get("updated_at") or "") > str(f.get("updated_at") or "") for g in gelukt_na)
        if not later_goed:
            fout = f.get("error") or {}
            return resultaat("ERROR", str(fout.get("message") if isinstance(fout, dict) else fout)[:300], f, missie_van(f))

    loop = [m for m in mijn_missies if m.get("status") in ("monitoring", "active")]
    if loop:
        m = loop[0]
        if m.get("status") == "monitoring":
            return resultaat("MONITORING", f"Next cycle at {m.get('next_run_at')}.", None, m)
        return resultaat("QUEUED", "Mission active; choosing its next step.", None, m)

    klaar = [m for m in mijn_missies if m.get("status") == "completed"
             and (_tijd(m.get("completed_at")) or moment - 2 * RECENT_KLAAR) > moment - RECENT_KLAAR]
    if klaar:
        return resultaat("MISSION_COMPLETE", f"Completed: {klaar[0].get('title')}", None, klaar[0])

    return resultaat("SLEEPING", "Nothing runnable for this agent.")


def _taak_kort(t: dict[str, Any] | None) -> dict[str, Any] | None:
    if not t:
        return None
    payload = t.get("payload") or {}
    return {"id": t.get("id"), "title": t.get("title"), "status": t.get("status"),
            "attempt": t.get("attempt"), "heartbeat_at": t.get("heartbeat_at"),
            "engine": payload.get("engine") or (t.get("result") or {}).get("engine"),
            "model": payload.get("model") or (t.get("result") or {}).get("model")}


def _missie_kort(m: dict[str, Any] | None) -> dict[str, Any] | None:
    if not m:
        return None
    mijlpalen = m.get("milestones") or []
    i = int(m.get("current_milestone") or 0)
    return {"id": m.get("id"), "title": m.get("title"), "status": m.get("status"),
            "progress": float(m.get("progress") or 0), "next_action": m.get("next_action"),
            "current_milestone": mijlpalen[i]["title"] if 0 <= i < len(mijlpalen) else None,
            "milestones_total": len(mijlpalen), "blocked_reason": m.get("blocked_reason")}


# ── Alles bij elkaar, uit de database ────────────────────────────────────────

class Activiteit:
    def __init__(self, client_factory: Callable[[], Any]):
        self._client_factory = client_factory

    def _db(self) -> Any:
        return self._client_factory()

    def _taken(self, limit: int = 300) -> list[dict[str, Any]]:
        return (self._db().table("core_tasks")
                .select("id,title,status,assignee,mission_id,worker_id,lease_token,lease_expires_at,"
                        "heartbeat_at,attempt,error,payload,result,created_at,updated_at,completed_at")
                .order("updated_at", desc=True).limit(limit).execute().data or [])

    def _missies(self) -> list[dict[str, Any]]:
        return (self._db().table("core_missions").select("*")
                .order("updated_at", desc=True).limit(200).execute().data or [])

    def events(self, agent: str | None = None, limit: int = 20, sinds: str | None = None) -> list[dict[str, Any]]:
        q = self._db().table("core_agent_events").select("*").order("created_at", desc=True).limit(max(1, min(limit, 500)))
        if agent:
            q = q.eq("agent", agent)
        if sinds:
            q = q.gt("created_at", sinds)
        return q.execute().data or []

    def overzicht(self, agents: Iterable[str], events_per_agent: int = 8) -> list[dict[str, Any]]:
        from agent_workspace import laad_workspace
        taken = self._taken()
        missies = self._missies()
        uit = []
        for agent in agents:
            recent = self.events(agent, events_per_agent)
            status = agent_status(agent, taken, missies, recent[0] if recent else None)
            ws = laad_workspace(agent)
            status.update({
                "role": ws.get("role"), "dax_computer": ws.get("dax_computer"),
                "crew": ws.get("crew") or [], "events": tijdlijn(recent),
                "last_event_at": recent[0].get("created_at") if recent else None,
            })
            uit.append(status)
        return uit

    def sinds(self, sinds: str) -> dict[str, Any]:
        """Wat er veranderde sinds Luka er was. Alleen uit echte events.

        Geeft een korte Engelse samenvatting mee (de UI is Engels) zodat AXE hem
        als context kan gebruiken; elk zinsdeel is te herleiden tot een rij.
        """
        events = self.events(None, 500, sinds)
        per = lambda soorten: [e for e in events if soort_van(e) in soorten]  # noqa: E731
        klaar_missies = per({"mission_completed"})
        mijlpalen = per({"milestone_completed"})
        fouten = per({"error", "verification_failed"})
        blokkades = per({"blocked", "waiting_human"})
        try:
            open_vragen = (self._db().table("core_approvals").select("id,title,task_id,created_at")
                           .eq("status", "pending").order("created_at").limit(20).execute().data or [])
        except Exception:
            open_vragen = []
        actief = [m for m in self._missies() if m.get("status") in ("active", "monitoring", "waiting_agent")]

        zinnen = []
        if mijlpalen:
            per_agent: dict[str, int] = {}
            for e in mijlpalen:
                per_agent[e.get("agent") or "axe"] = per_agent.get(e.get("agent") or "axe", 0) + 1
            zinnen.append("Milestones completed: " + ", ".join(f"{a} {n}" for a, n in sorted(per_agent.items())) + ".")
        for e in klaar_missies[:5]:
            zinnen.append(f"{e.get('agent')} completed a mission: {e.get('message')}.")
        if blokkades:
            zinnen.append(f"{len(blokkades)} item(s) blocked or waiting for a decision.")
        if open_vragen:
            zinnen.append(f"{len(open_vragen)} approval(s) waiting for you.")
        if fouten:
            zinnen.append(f"{len(fouten)} failure event(s) (retried or blocked).")
        if actief:
            zinnen.append(f"{len(actief)} mission(s) still running.")
        return {
            "since": sinds,
            "summary": " ".join(zinnen) if zinnen else "Nothing significant happened since you were last here.",
            "counts": {"events": len(events), "milestones_completed": len(mijlpalen),
                       "missions_completed": len(klaar_missies), "failures": len(fouten),
                       "blocked": len(blokkades), "approvals_waiting": len(open_vragen),
                       "missions_active": len(actief)},
            "highlights": tijdlijn([*klaar_missies, *mijlpalen, *blokkades, *fouten][:30]),
            "approvals": open_vragen,
        }

    def observability(self) -> dict[str, Any]:
        moment = datetime.now(timezone.utc)
        taken = self._taken(500)
        missies = self._missies()
        tel = lambda rijen, veld: {  # noqa: E731
            k: sum(1 for r in rijen if r.get(veld) == k) for k in sorted({r.get(veld) for r in rijen if r.get(veld)})
        }
        try:
            dax = self._db().table("core_dax_computers").select("*").order("id").execute().data or []
            slots = self._db().table("core_dax_slots").select("*").execute().data or []
        except Exception:
            dax, slots = [], []
        try:
            vragen = (self._db().table("core_approvals").select("id,title,task_id,created_at")
                      .eq("status", "pending").order("created_at").limit(50).execute().data or [])
        except Exception:
            vragen = []
        levend = [t for t in taken if t.get("status") in BEZIG and _lease_leeft(t, moment)]
        fouten = [t for t in taken if t.get("status") == "failed"][:10]
        return {
            "at": moment.isoformat(),
            "missions": {
                "by_status": tel(missies, "status"),
                "runnable": [_missie_kort(m) for m in missies if m.get("status") in ("active", "monitoring", "waiting_agent")
                             and (_tijd(m.get("next_run_at")) or moment) <= moment],
                "blocked": [_missie_kort(m) for m in missies if m.get("status") in ("blocked", "human_decision_required")],
            },
            "tasks": {
                "by_status": tel(taken, "status"),
                "active": [dict(_taak_kort(t) or {}, assignee=t.get("assignee"), worker_id=t.get("worker_id"),
                                lease_expires_at=t.get("lease_expires_at")) for t in levend],
                "queued": sum(1 for t in taken if t.get("status") in WACHTRIJ),
                "completed_24h": sum(1 for t in taken if t.get("status") in ("completed", "done")
                                     and (_tijd(t.get("completed_at")) or moment - timedelta(days=2)) > moment - timedelta(hours=24)),
                "latest_errors": [{"id": t.get("id"), "title": t.get("title"), "assignee": t.get("assignee"),
                                   "error": t.get("error"), "at": t.get("updated_at")} for t in fouten],
            },
            "dax": {
                "computers": [{k: d.get(k) for k in ("id", "owner_agent", "members", "status", "host", "stats",
                                                     "last_heartbeat_at", "last_error", "heavy_slots",
                                                     "cpu_limit", "memory_limit_mb")} for d in dax],
                "slots_in_use": len(slots),
                "slots": slots,
            },
            "approvals_waiting": vragen,
        }
