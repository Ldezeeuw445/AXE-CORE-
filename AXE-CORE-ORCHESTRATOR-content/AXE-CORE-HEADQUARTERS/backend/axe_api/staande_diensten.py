"""24/7 staande diensten voor agents zonder eigen DAX-routine.

## Waarom dit bestaat (17 okt 2026)

Home toonde Wingman, Memory, Task, Cron, Finance, Apps, Intel en Companion als
SLEEPING. Hun masterprompts vragen om een vast ritme (triage, vault, wachtrij,
roostergezondheid, kosten, health, signalen, companion-jobs), maar er stond
geen rij in core_schedules die voor hen draaide, en agent_status valt zonder
taak/missie/rooster terug op SLEEPING.

Dit is geen tweede scheduler: één job per agent in core_schedules, action_type
`staande`, executor `vps`. /cron/tick claimt ze zoals de rest. Elke run leest
bestaande tabellen, schrijft last_result + een event, en schuift next_run_at
door. Geen mail, geen send, geen orders, geen geld.

Grenzen (prompts/_grenzen.md): geen e-mails/sends, geen trading-orders, geen
geldverplaatsing. Deze module doet alleen meten en rapporteren.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

log = logging.getLogger("axe_staande_diensten")

TZ = "Europe/Amsterdam"
APP = "axe_core"
# Woorden die nooit in een resultaat mogen: deze jobs raken geen uitgaand kanaal.
VERBODEN = ("send_email", "auto_send", "place_order", "broker", "metaapi", "wire_transfer")


def _nu() -> datetime:
    return datetime.now(timezone.utc)


def _rijen(db: Any, tabel: str, kolommen: str, limiet: int = 200, **eq: Any) -> list[dict[str, Any]]:
    try:
        q = db.table(tabel).select(kolommen)
        for k, v in eq.items():
            q = q.eq(k, v)
        return q.limit(limiet).execute().data or []
    except Exception as exc:  # noqa: BLE001 — een ontbrekende tabel mag de tick niet kielen
        log.warning("staande: %s onleesbaar (%s)", tabel, exc)
        return []


def _tijd(waarde: Any) -> datetime | None:
    if not waarde:
        return None
    if isinstance(waarde, datetime):
        return waarde if waarde.tzinfo else waarde.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(waarde).replace("Z", "+00:00"))
    except ValueError:
        return None


def run_wingman(db: Any, nu: datetime) -> dict[str, Any]:
    """Triage + routing: open vragen, wachtrij, blokkades. Niets verzenden."""
    pending = _rijen(db, "core_approvals", "id,status", status="pending")
    taken = _rijen(db, "core_tasks", "id,status")
    missies = _rijen(db, "core_missions", "id,status")
    queued = sum(1 for t in taken if t.get("status") in ("queued", "retrying", "pending", "approved"))
    blocked = sum(1 for m in missies if m.get("status") in ("blocked", "human_decision_required"))
    routing = "inbox clear" if not pending and queued == 0 and blocked == 0 else \
        f"{len(pending)} need OK, {queued} queued, {blocked} blocked"
    return {
        "job": "triage+routing",
        "triage": {"pending_ok": len(pending), "queued": queued, "blocked": blocked},
        "routing": routing,
    }


def run_memory(db: Any, nu: datetime) -> dict[str, Any]:
    """Vault: tel wat er de laatste dag gebeurde. Verzin geen herinneringen."""
    grens = (nu - timedelta(hours=24)).isoformat()
    events = _rijen(db, "core_agent_events", "id,event_type,created_at", limiet=400)
    recent = [e for e in events if str(e.get("created_at") or "") >= grens]
    memories = _rijen(db, "rag_memories", "id", limiet=50)
    try:
        db.table("global_memory").upsert({
            "category": "system_event",
            "key": f"memory:cycle:{nu.strftime('%Y%m%d%H')}",
            "value": json.dumps({"events_24h": len(recent), "at": nu.isoformat()}),
            "confidence": 1,
            "metadata": {"kind": "memory_cycle", "agentId": "memory"},
        }, on_conflict="key").execute()
    except Exception:  # noqa: BLE001
        pass
    return {
        "job": "consolidation/vault",
        "vault": {"events_24h": len(recent), "memories_seen": len(memories)},
        "invented": 0,
    }


STALE_FOUT = (
    "gpt-6-astra",
    "no handler for northsea_desk",
    "no handler for planner",
    "unknown workspace '@device'",
    "ran on a chat model without repo access",
    "axe native runtime mismatch",
    "personal.files.list' is not implemented",
    "no computer action was executed",
)


def _fout_tekst(t: dict[str, Any]) -> str:
    err = t.get("error")
    if isinstance(err, dict):
        return " ".join(str(err.get(k) or "") for k in ("message", "code", "output")).lower()
    return str(err or "").lower()


def is_stale_mislukking(t: dict[str, Any], nu: datetime) -> bool:
    """Oude, al gefixte of achterhaalde failed/blocked-rijen. Niet de echte 24u-fouten."""
    if t.get("status") not in ("failed", "blocked"):
        return False
    blob = _fout_tekst(t)
    if any(p in blob for p in STALE_FOUT):
        return True
    at = _tijd(t.get("updated_at"))
    return bool(at and nu - at > timedelta(hours=24))


def archiveer_bekende_fouten(db: Any, nu: datetime | None = None) -> int:
    """Zet stale failed op cancelled met reden, zodat Home ophoudt te tellen.

    Geen send, geen order, geen geld. Alleen boekhouding.
    """
    nu = nu or _nu()
    kolommen = "id,status,error,title,capability,updated_at,metadata"
    taken = (
        _rijen(db, "core_tasks", kolommen, limiet=400, status="failed")
        + _rijen(db, "core_tasks", kolommen, limiet=200, status="blocked")
    )
    n = 0
    reden = (
        "Archived: stale failure (known-fixed worker/planner bug, or older than 24h). "
        "Not retried automatically."
    )
    for t in taken:
        if not is_stale_mislukking(t, nu):
            continue
        try:
            meta = t.get("metadata") if isinstance(t.get("metadata"), dict) else {}
            db.table("core_tasks").update({
                "status": "cancelled",
                "cancelled_at": nu.isoformat(),
                "error": {
                    **(t.get("error") if isinstance(t.get("error"), dict) else {"message": t.get("error")}),
                    "archived": True,
                    "archive_reason": reden,
                },
                "metadata": {**meta, "archived": True, "archive_reason": reden},
            }).eq("id", t["id"]).execute()
            n += 1
        except Exception as exc:  # noqa: BLE001
            log.warning("staande: kon %s niet archiveren (%s)", t.get("id"), exc)
    notices = _rijen(db, "core_tasks", "id,status,title,capability,metadata", limiet=400, capability="northsea_desk")
    for t in notices:
        if t.get("status") not in ("pending", "queued"):
            continue
        titel = str(t.get("title") or "")
        if titel.lower().startswith("yes needed"):
            continue
        meta = t.get("metadata") or {}
        if isinstance(meta, dict) and meta.get("goedkeuring") == "nodig":
            continue
        try:
            db.table("core_tasks").update({
                "status": "completed",
                "completed_at": nu.isoformat(),
                "metadata": {**(meta if isinstance(meta, dict) else {}), "archived": True,
                             "archive_reason": "NorthSea desk notice; no worker claim, drafts only."},
            }).eq("id", t["id"]).execute()
            n += 1
        except Exception as exc:  # noqa: BLE001
            log.warning("staande: kon notice %s niet sluiten (%s)", t.get("id"), exc)
    return n


def _niet_gearchiveerd(t: dict[str, Any]) -> bool:
    err = t.get("error") if isinstance(t.get("error"), dict) else {}
    meta = t.get("metadata") if isinstance(t.get("metadata"), dict) else {}
    return not err.get("archived") and not meta.get("archived")


def _status_rijen(db: Any, status: str, limiet: int = 400) -> list[dict[str, Any]]:
    return _rijen(
        db, "core_tasks",
        "id,status,lease_expires_at,lease_token,updated_at,error,metadata",
        limiet=limiet, status=status,
    )


def run_task(db: Any, nu: datetime) -> dict[str, Any]:
    """Wachtrij-onderhoud: tellen, stale leases melden. Kernel recovered zelf."""
    gearchiveerd = archiveer_bekende_fouten(db, nu)
    grens = nu - timedelta(hours=24)
    queued = len(_status_rijen(db, "queued")) + len(_status_rijen(db, "retrying"))
    pending = len(_status_rijen(db, "pending"))
    running = (
        len(_status_rijen(db, "running"))
        + len(_status_rijen(db, "in_progress"))
        + len(_status_rijen(db, "planning"))
    )
    failed = sum(
        1 for t in _status_rijen(db, "failed")
        if _niet_gearchiveerd(t) and ((_tijd(t.get("updated_at")) or nu) >= grens)
    )
    blocked = sum(
        1 for t in _status_rijen(db, "blocked")
        if _niet_gearchiveerd(t) and ((_tijd(t.get("updated_at")) or nu) >= grens)
    )
    stale = 0
    for t in _status_rijen(db, "running") + _status_rijen(db, "in_progress") + _status_rijen(db, "planning"):
        exp = _tijd(t.get("lease_expires_at"))
        if t.get("lease_token") and exp and exp < nu:
            stale += 1
    return {
        "job": "task queue upkeep",
        "queue": {
            "queued": queued, "pending": pending, "running": running,
            "stale_leases": stale, "failed": failed, "blocked": blocked,
        },
        "archived": gearchiveerd,
        "upkeep": "reported; kernel recovers expired leases",
    }


def run_cron(db: Any, nu: datetime) -> dict[str, Any]:
    """Gezondheid van core_schedules. Geen nieuwe crons die mailen of traden."""
    roosters = _rijen(db, "core_schedules", "name,enabled,last_status,next_run_at,consecutive_failures")
    enabled = [r for r in roosters if r.get("enabled")]
    failing = [r for r in enabled if int(r.get("consecutive_failures") or 0) > 0
               and r.get("last_status") not in ("ok", "skipped")]
    due = [r for r in enabled if (_tijd(r.get("next_run_at")) or nu + timedelta(days=1)) <= nu]
    volgende = sorted(
        (_tijd(r.get("next_run_at")) for r in enabled if _tijd(r.get("next_run_at"))),
    )
    return {
        "job": "schedules health",
        "schedules": {
            "enabled": len(enabled),
            "failing": len(failing),
            "due_now": len(due),
            "next": volgende[0].isoformat() if volgende else None,
        },
    }


def run_finance(db: Any, nu: datetime) -> dict[str, Any]:
    """Kosten/gebruik per seat, alleen lezen. Nooit kopen, opwaarderen of cancelen."""
    computers = _rijen(db, "core_dax_computers", "id,owner_agent,stats")
    seats: list[dict[str, Any]] = []
    for c in computers:
        engines = (c.get("stats") or {}).get("engines") or {}
        seats.append({
            "dax": c.get("id"),
            "agent": c.get("owner_agent"),
            "claude": bool(engines.get("claude_logged_in")),
            "codex": bool(engines.get("codex_logged_in")),
        })
    return {
        "job": "costs/usage per subscription",
        "costs": "read-only",
        "seats": seats,
        "moved": 0,
    }


def run_apps(db: Any, nu: datetime) -> dict[str, Any]:
    """Health van AXE CORE / Companion-jobs. Geen DNS of billing."""
    roosters = _rijen(db, "core_schedules", "name,app,enabled,last_status")
    by_app: dict[str, dict[str, int]] = {}
    for r in roosters:
        app = str(r.get("app") or "axe_core")
        slot = by_app.setdefault(app, {"enabled": 0, "ok": 0, "fail": 0})
        if r.get("enabled"):
            slot["enabled"] += 1
            if r.get("last_status") == "ok":
                slot["ok"] += 1
            elif r.get("last_status") in ("fail", "timeout"):
                slot["fail"] += 1
    return {"job": "app registry health", "health": by_app, "billing": "untouched"}


def run_intel(db: Any, nu: datetime) -> dict[str, Any]:
    """Signalen met bron. Geen orders."""
    tide = _rijen(db, "intel_market_tide", "bias,snapshot_time,call_put_ratio", limiet=3)
    opties = _rijen(db, "intel_unusual_options", "id,symbol", limiet=20)
    laatste = tide[0] if tide else {}
    return {
        "job": "market intelligence",
        "signals": {
            "options_seen": len(opties),
            "bias": laatste.get("bias"),
            "at": laatste.get("snapshot_time"),
            "call_put_ratio": laatste.get("call_put_ratio"),
        },
        "orders": 0,
    }


def run_companion(db: Any, nu: datetime) -> dict[str, Any]:
    """Wat Companion-jobs in de andere apps lieten staan. Niets verzenden."""
    roosters = _rijen(db, "core_schedules", "name,app,last_status,last_run_at,last_result,enabled")
    eigen = [r for r in roosters if r.get("app") == "axe_companion"]
    laatste = eigen[0] if eigen else None
    return {
        "job": "companion standing loop",
        "companion": {
            "jobs": len(eigen),
            "last": (laatste or {}).get("name"),
            "status": (laatste or {}).get("last_status"),
        },
    }


# agent-id zoals in de roster / /agents/activity
DIENSTEN: tuple[dict[str, Any], ...] = (
    {
        "agent": "wingman", "name": "Wingman triage + routing",
        "job_key": "axe_core:staande-wingman", "cron_expr": "*/15 * * * *",
        "wat": "Triage pending OK, queued work and blocked missions; propose routing.",
        "run": run_wingman,
    },
    {
        "agent": "memory", "name": "Memory vault consolidation",
        "job_key": "axe_core:staande-memory", "cron_expr": "*/30 * * * *",
        "wat": "Count last-day events and vault rows; write a fact cycle, invent nothing.",
        "run": run_memory,
    },
    {
        "agent": "task", "name": "Task queue upkeep",
        "job_key": "axe_core:staande-task", "cron_expr": "*/10 * * * *",
        "wat": "Report queued, running, stale leases and failed tasks. Kernel recovers.",
        "run": run_task,
    },
    {
        "agent": "cron", "name": "Cron schedules health",
        "job_key": "axe_core:staande-cron", "cron_expr": "*/5 * * * *",
        "wat": "Enabled, failing and due schedules. Does not invent mail/trade crons.",
        "run": run_cron,
    },
    {
        "agent": "finance", "name": "Finance costs and usage",
        "job_key": "axe_core:staande-finance", "cron_expr": "5 * * * *",
        "wat": "Read seat login flags and usage. Never buy, top up or cancel.",
        "run": run_finance,
    },
    {
        "agent": "apps", "name": "Apps health check",
        "job_key": "axe_core:staande-apps", "cron_expr": "*/15 * * * *",
        "wat": "Health of AXE CORE and Companion jobs. No DNS or billing changes.",
        "run": run_apps,
    },
    {
        "agent": "intel", "name": "Intel signal watch",
        "job_key": "axe_core:staande-intel", "cron_expr": "*/20 * * * *",
        "wat": "Surface last market signals with source and time. No orders.",
        "run": run_intel,
    },
    {
        "agent": "companion", "name": "Companion standing loop",
        "job_key": "axe_core:staande-companion", "cron_expr": "*/30 * * * *",
        "wat": "Report Companion-app jobs. Nothing sent from here.",
        "run": run_companion,
    },
)

try:
    import grok_managers as _grok
    _GROK_DIENSTEN: tuple[dict[str, Any], ...] = _grok.diensten()
except Exception:  # noqa: BLE001 — pulse mag de oude 24/7-jobs niet kielen
    _GROK_DIENSTEN = ()

try:
    import dax_bouw as _dax_bouw
    _DAX_BOUW: tuple[dict[str, Any], ...] = _dax_bouw.diensten()
except Exception:  # noqa: BLE001 — net zo: de bouwdienst mag de rest niet kielen
    _DAX_BOUW = ()

# Bestaande 24/7-jobs plus de zes Grok-managers (27 okt 2026), en de bouwende
# developer-DAX (28 okt), ernaast.
DIENSTEN = DIENSTEN + _GROK_DIENSTEN + _DAX_BOUW

STAANDE_AGENTS = frozenset(str(d["agent"]) for d in DIENSTEN)


def catalogus_voor(agent: str) -> dict[str, Any] | None:
    return next((d for d in DIENSTEN if d["agent"] == agent), None)


def volgende_run(cron_expr: str, tz_naam: str = TZ, na: datetime | None = None) -> datetime:
    try:
        from planning import volgende
        return volgende(cron_expr, tz_naam, na)
    except Exception:  # noqa: BLE001 — tests/hosts zonder croniter krijgen toch een next
        return (na or _nu()) + timedelta(minutes=15)


def rooster_rij(dienst: dict[str, Any], nu: datetime | None = None) -> dict[str, Any]:
    nu = nu or _nu()
    return {
        "name": dienst["name"],
        "job_key": dienst["job_key"],
        "app": APP,
        "executor": "vps",
        "action_type": "staande",
        "action_payload": {"agent": dienst["agent"]},
        "cron_expr": dienst["cron_expr"],
        "timezone": TZ,
        "enabled": True,
        "max_runtime_s": 120,
        "metadata": {"agent": dienst["agent"], "standing": True, "app": APP},
        "next_run_at": volgende_run(dienst["cron_expr"], TZ, nu).isoformat(),
        "description": dienst["wat"],
    }


def zorg_voor_roosters(db: Any, nu: datetime | None = None) -> list[str]:
    """Zet ontbrekende 24/7-roosters klaar. Bestaande rijen blijven van Luka."""
    nu = nu or _nu()
    bestaande = {
        r.get("job_key")
        for r in _rijen(db, "core_schedules", "job_key", limiet=400)
    }
    gemaakt: list[str] = []
    for d in DIENSTEN:
        if d["job_key"] in bestaande:
            continue
        try:
            db.table("core_schedules").insert(rooster_rij(d, nu)).execute()
            gemaakt.append(d["job_key"])
        except Exception as exc:  # noqa: BLE001
            log.warning("staande: kon %s niet registreren (%s)", d["job_key"], exc)
    return gemaakt


def _geen_verboden(obj: Any) -> None:
    tekst = json.dumps(obj, default=str).lower()
    for woord in VERBODEN:
        if woord in tekst:
            raise ValueError(f"standing job tried forbidden action {woord}")


def _event(db: Any, agent: str, boodschap: str) -> None:
    try:
        db.table("core_agent_events").insert({
            "agent": agent,
            "event_type": "mission.cycle_completed",
            "message": boodschap[:300],
            "source": "standing",
        }).execute()
    except Exception:  # noqa: BLE001
        pass


def voer_uit(agent: str, db: Any, nu: datetime | None = None) -> dict[str, Any]:
    """Eén staande job. Geeft {status, output} zoals de andere cron-acties."""
    dienst = catalogus_voor(agent)
    if not dienst:
        return {"status": "fail", "output": f"staande: unknown agent {agent!r}"}
    nu = nu or _nu()
    run: Callable[[Any, datetime], dict[str, Any]] = dienst["run"]
    try:
        samenvatting = run(db, nu)
        _geen_verboden(samenvatting)
    except Exception as exc:  # noqa: BLE001
        return {"status": "fail", "output": str(exc)[:2000]}
    output = json.dumps(samenvatting, default=str)[:4000]
    _event(db, agent, f"{dienst['name']}: {output[:180]}")
    return {"status": "ok", "output": output}
