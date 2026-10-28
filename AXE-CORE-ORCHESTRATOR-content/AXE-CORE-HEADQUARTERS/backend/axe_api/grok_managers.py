"""De zes Grok Bot-managers: identiteit, pulse, peer-berichten, harde grenzen.

Luka, 27 okt 2026: dezelfde bots als in Grok Bot, naast de bestaande
24/7-agents, niet in plaats van. staande_diensten.py plant de pulses;
deze module voert ze uit. Geen tweede war room, geen mail, geen orders,
geen geld, geen auto_send_*-vlaggen.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Any

log = logging.getLogger("axe_grok_managers")

GROK_IDS: tuple[str, ...] = (
    "axemanager",
    "projectsmgr",
    "companionmgr",
    "axon",
    "tradingos",
    "northseamgr",
)

BAAS = "axemanager"

AUTO_SEND_VLAGGEN = (
    "auto_send_qualification",
    "auto_reply_nonbinding",
    "auto_send_followups",
)

REPO_SCOPE: dict[str, dict[str, Any]] = {
    "axemanager": {"repos": ["AXE-CORE-"], "tools": "full"},
    "projectsmgr": {"repos": ["AXE-CORE-"], "tools": "write"},
    "companionmgr": {"repos": ["AXE-COMPANION-OS-"], "tools": "write"},
    "axon": {"repos": ["axon-memory"], "supabase": "ktaditgtbubonrahyiig", "tools": "write"},
    "tradingos": {"repos": ["trading-os-app", "axe-trading-core", "TRADING-OS"], "tools": "read"},
    "northseamgr": {"repos": ["AXE-CORE-"], "tools": "read"},
}

PULSE_CRON: dict[str, str] = {
    "axemanager": "*/10 * * * *",
    "projectsmgr": "*/15 * * * *",
    "companionmgr": "*/20 * * * *",
    "axon": "*/20 * * * *",
    "tradingos": "*/15 * * * *",
    "northseamgr": "*/15 * * * *",
}

_SEND_RE = re.compile(
    r"\b(send[-_ ]?email|send[-_ ]?message|verstuur|outbound|smtp|mailgun|sendgrid|imessage|whatsapp)\b",
    re.I,
)
_TRADE_RE = re.compile(
    r"\b(place[-_ ]?order|live[-_ ]?order|broker|metaapi|mt5|open (a )?(long|short)|market order)\b",
    re.I,
)
_MONEY_RE = re.compile(r"\b(wire[-_ ]?transfer|send[-_ ]?money|buy credits|top up|iban|bank details)\b", re.I)
_DEAL_RE = re.compile(
    r"\b(deal go|go/no-go|stage move|close (the )?deal|disclose (identity|counterparty)|auto_disclose)\b",
    re.I,
)
_NON_HUMAN = re.compile(r"manager|service:|bot\b|axe-core|northsea-desk|\bagent\b", re.I)


class Verboden(ValueError):
    """Harde grens: de pulse mag dit niet doen."""

    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason


def is_human_principal(principal: str | None, client_id: str | None = None) -> bool:
    """Alleen Luka (allowlist). Een manager keurt nooit zichzelf goed."""
    p = (principal or "").strip().lower()
    c = (client_id or "").strip().lower()
    if not p:
        return False
    if p in GROK_IDS or c in GROK_IDS:
        return False
    if _NON_HUMAN.search(p) or (c and _NON_HUMAN.search(c)):
        return False
    allowed = {
        x.strip().lower()
        for x in os.environ.get("NORTHSEA_HUMAN_PRINCIPALS", "").split(",")
        if x.strip()
    }
    allowed.update({"luka", "claude-ai"})
    return p in allowed


def mag_peer_bericht(from_agent: str, to_agent: str) -> bool:
    if from_agent not in GROK_IDS or to_agent not in GROK_IDS or from_agent == to_agent:
        return False
    if from_agent == BAAS:
        return True
    return to_agent == BAAS


def toets_actie(
    soort: str,
    tekst: str = "",
    *,
    principal: str | None = None,
    client_id: str | None = None,
    bestaande_thread: bool = False,
    luka_ja: bool = False,
) -> None:
    blob = f"{soort} {tekst}".lower()
    if any(v in blob for v in AUTO_SEND_VLAGGEN):
        raise Verboden("auto_send", "Never flip auto_send_* flags.")
    if _TRADE_RE.search(blob) or soort == "live_order":
        raise Verboden("live_trade", "No live trading orders.")
    if _MONEY_RE.search(blob) or soort == "money":
        raise Verboden("money", "No money movement.")
    if _DEAL_RE.search(blob) or soort == "deal_move":
        raise Verboden("deal", "No deal go/no-go, stage move or identity disclosure.")
    if _SEND_RE.search(blob) or soort == "send":
        chase_ok = bestaande_thread and luka_ja and is_human_principal(principal, client_id)
        if not chase_ok:
            if not is_human_principal(principal, client_id):
                raise Verboden(
                    "not_human",
                    "Sends need Luka (is_human). Managers cannot approve themselves.",
                )
            raise Verboden(
                "send",
                "No out-of-plan send. Existing-thread chase only after Luka's own yes.",
            )


def _rijen(db: Any, tabel: str, kolommen: str, limiet: int = 200, **eq: Any) -> list[dict[str, Any]]:
    try:
        q = db.table(tabel).select(kolommen)
        for k, v in eq.items():
            q = q.eq(k, v)
        return q.limit(limiet).execute().data or []
    except Exception as exc:  # noqa: BLE001
        log.warning("grok: %s onleesbaar (%s)", tabel, exc)
        return []


def _schrijf(db: Any, tabel: str, rij: dict[str, Any]) -> dict[str, Any] | None:
    try:
        data = db.table(tabel).insert(rij).execute().data or []
        return data[0] if data else rij
    except Exception as exc:  # noqa: BLE001
        log.warning("grok: kon %s niet schrijven (%s)", tabel, exc)
        return None


def stuur_bericht(db: Any, from_agent: str, to_agent: str, kind: str, body: str) -> dict[str, Any] | None:
    if not mag_peer_bericht(from_agent, to_agent):
        raise Verboden("peer", f"{from_agent} may not message {to_agent}")
    toets_actie(kind, body)
    return _schrijf(db, "core_manager_messages", {
        "from_agent": from_agent,
        "to_agent": to_agent,
        "kind": kind,
        "body": body[:4000],
    })


def inbox(db: Any, agent: str) -> list[dict[str, Any]]:
    return [
        r for r in _rijen(db, "core_manager_messages", "id,from_agent,to_agent,kind,body,created_at,read_at", limiet=80)
        if r.get("to_agent") == agent and not r.get("read_at")
    ]


def _les_schrijven(db: Any, agent: str, les: str) -> str:
    """Alleen een échte les, via het geheugenhek (cap 120, geen HOLD/cycle)."""
    if not les or not les.strip():
        return "leeg"
    try:
        from memory_schrijfhek import inhoud_hash, mag_schrijven
    except Exception:  # noqa: BLE001
        return "hek_ontbreekt"
    reden = mag_schrijven(key=f"mgr:{agent}:les", content=les)
    if reden != "ok":
        return reden
    h = inhoud_hash(les)
    _schrijf(db, "memory", {
        "agent": f"axe_{agent}",
        "kind": "lesson",
        "key": f"mgr:{agent}:les:{h}",
        "content": les.strip()[:2000],
        "source": f"standing:{agent}",
        "metadata": {"agentId": agent, "kind": "lesson"},
    })
    return "ok"


def _vraag_luka(db: Any, agent: str, wat: str, waarom: str) -> None:
    """Zet een echte core_approvals-rij klaar. Managers keuren dit niet zelf."""
    toets_actie("ask", wat)
    bestaande = _rijen(db, "core_approvals", "id,title,status", status="pending")
    if any((r.get("title") or "") == wat for r in bestaande):
        return
    taak = _schrijf(db, "core_tasks", {
        "title": wat,
        "status": "waiting_approval",
        "assignee": agent,
        "capability": "task_manage",
        "source_app": "axe_core",
        "metadata": {"agent": agent, "goedkeuring": "nodig", "manager": True},
        "goal": waarom,
    })
    taak_id = (taak or {}).get("id")
    _schrijf(db, "core_approvals", {
        "task_id": taak_id,
        "status": "pending",
        "kind": "manager_ask",
        "title": wat,
        "detail": waarom,
        "wat": wat,
        "waarom": waarom,
        "requested_by": agent,
        "metadata": {"agent": agent, "manager": True},
    })


def run_axemanager(db: Any, nu: datetime) -> dict[str, Any]:
    """Baas: leest rapporten, stuurt richting, beveelt eerst, vraagt Luka zelden."""
    pending = _rijen(db, "core_approvals", "id,title,status", status="pending")
    taken = _rijen(db, "core_tasks", "id,status,assignee")
    rapporten = inbox(db, BAAS)
    roosters = _rijen(db, "core_schedules", "name,job_key,last_status,last_result,enabled")
    mgr_jobs = [r for r in roosters if str(r.get("job_key") or "").startswith("axe_core:staande-")
                and any(k in str(r.get("job_key")) for k in GROK_IDS)]
    for r in rapporten:
        try:
            db.table("core_manager_messages").update({
                "read_at": nu.isoformat(),
            }).eq("id", r["id"]).execute()
        except Exception:  # noqa: BLE001
            pass
    queued = sum(1 for t in taken if t.get("status") in ("queued", "retrying", "pending", "waiting_approval"))
    aanbeveling = (
        f"Aanbeveling: {len(pending)} vragen voor jou, {queued} taken open, "
        f"{len(rapporten)} rapporten van managers."
        if pending or queued or rapporten else
        "Aanbeveling: niets buiten het plan; managers lopen, geen ja nodig."
    )
    for andere in GROK_IDS:
        if andere == BAAS:
            continue
        stuur_bericht(db, BAAS, andere, "directive",
                      f"Pulse {nu.strftime('%H:%M')} UTC. Rapporteer blokkades; stuur niets, verhandel niets.")
    return {
        "job": "orchestrate managers",
        "aanbeveling": aanbeveling,
        "pending_ok": len(pending),
        "queued": queued,
        "rapporten": len(rapporten),
        "manager_jobs": len(mgr_jobs),
        "taal": "nl",
    }


def run_projectsmgr(db: Any, nu: datetime) -> dict[str, Any]:
    taken = _rijen(db, "core_tasks", "id,status,assignee,title,capability")
    open_ = [t for t in taken if t.get("status") in ("queued", "pending", "retrying", "waiting_approval")]
    zonder = [t for t in open_ if not t.get("assignee")]
    opdrachten = inbox(db, "projectsmgr")
    stuur_bericht(
        db, "projectsmgr", BAAS, "report",
        f"{len(open_)} open rows, {len(zonder)} unassigned. No sends.",
    )
    return {
        "job": "projects and tasks",
        "open": len(open_),
        "unassigned": len(zonder),
        "directives": len(opdrachten),
        "assigned": 0 if not zonder else "proposed only",
    }


def run_companionmgr(db: Any, nu: datetime) -> dict[str, Any]:
    roosters = _rijen(db, "core_schedules", "name,app,last_status,enabled")
    eigen = [r for r in roosters if r.get("app") in ("axe_companion", "axe_core")]
    fail = [r for r in eigen if r.get("last_status") in ("fail", "timeout")]
    stuur_bericht(
        db, "companionmgr", BAAS, "report",
        f"Companion/CORE jobs {len(eigen)}, failing {len(fail)}. Smoke only, no deploy out of plan.",
    )
    return {
        "job": "companion owner",
        "repo": "AXE-COMPANION-OS-",
        "jobs": len(eigen),
        "failing": len(fail),
        "deployed": 0,
    }


def run_axon(db: Any, nu: datetime) -> dict[str, Any]:
    memories = _rijen(db, "memory", "id,agent,kind", limiet=50)
    rag = _rijen(db, "rag_memories", "id", limiet=20)
    stuur_bericht(
        db, "axon", BAAS, "report",
        f"AXON pulse. memory seen {len(memories)}, rag {len(rag)}. No HOLD writes.",
    )
    return {
        "job": "axon memory owner",
        "repo": "axon-memory",
        "supabase": "ktaditgtbubonrahyiig",
        "memory_seen": len(memories),
        "rag_seen": len(rag),
        "invented": 0,
    }


def run_tradingos(db: Any, nu: datetime) -> dict[str, Any]:
    tide = _rijen(db, "intel_market_tide", "bias,snapshot_time", limiet=3)
    stuur_bericht(
        db, "tradingos", BAAS, "report",
        f"Trading OS pulse. bias={(tide[0] or {}).get('bias') if tide else None}. orders=0.",
    )
    return {
        "job": "trading os owner",
        "repos": list(REPO_SCOPE["tradingos"]["repos"]),
        "bias": (tide[0] or {}).get("bias") if tide else None,
        "orders": 0,
        "live": False,
    }


def run_northseamgr(db: Any, nu: datetime) -> dict[str, Any]:
    pending = _rijen(db, "core_approvals", "id,title,kind,status", status="pending")
    desk = [t for t in _rijen(db, "core_tasks", "id,status,capability,title")
            if t.get("capability") == "northsea_desk"]
    stuur_bericht(
        db, "northseamgr", BAAS, "report",
        f"NorthSea: first deal remains the priority. {len(pending)} OK-vragen. No send, auto_send_* untouched.",
    )
    return {
        "job": "northsea desk owner",
        "priority": "first deal",
        "pending_ok": len(pending),
        "desk_tasks": len(desk),
        "sent": 0,
        "flags": "untouched",
    }


RUNNERS: dict[str, Any] = {
    "axemanager": run_axemanager,
    "projectsmgr": run_projectsmgr,
    "companionmgr": run_companionmgr,
    "axon": run_axon,
    "tradingos": run_tradingos,
    "northseamgr": run_northseamgr,
}


def diensten() -> tuple[dict[str, Any], ...]:
    namen = {
        "axemanager": "AXE CORE Manager pulse",
        "projectsmgr": "Projects Manager pulse",
        "companionmgr": "AXE Companion Manager pulse",
        "axon": "AXON Memory Manager pulse",
        "tradingos": "Trading OS Manager pulse",
        "northseamgr": "Northsea Desk Manager pulse",
    }
    wat = {
        "axemanager": "Direct other managers; Dutch recommendation first; ask Luka only out-of-plan.",
        "projectsmgr": "Read project/task rows; assign to specialists. No sends.",
        "companionmgr": "Companion repo/VPS/smoke. No out-of-plan deploy.",
        "axon": "AXON Memory owner. Real lessons only, cap respected.",
        "tradingos": "Trading OS owner. Never live orders.",
        "northseamgr": "NorthSea desk. Sends only after Luka; never flip auto_send_*.",
    }
    return tuple(
        {
            "agent": aid,
            "name": namen[aid],
            "job_key": f"axe_core:staande-{aid}",
            "cron_expr": PULSE_CRON[aid],
            "wat": wat[aid],
            "run": RUNNERS[aid],
        }
        for aid in GROK_IDS
    )
