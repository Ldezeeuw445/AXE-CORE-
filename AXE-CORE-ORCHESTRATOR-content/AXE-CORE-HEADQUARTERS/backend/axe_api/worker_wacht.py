"""Een stille Mac-worker moet een melding geven (gat G1, 1 nov 2026).

De computer-worker (infra/computer-worker/worker.mjs) schrijft elke 15 s een
heartbeat naar core_computer_workers. Faalt dat, dan logt hij alleen lokaal
`heartbeat FAILED`: de Mac Mini kon uren stil liggen zonder dat Luka het zag.

Deze ronde draait mee in de bestaande dax-wacht (elke 5 min). Is een worker
langer dan DREMPEL_S stil, dan komt er één warning-rij in core_notifications.
Die rij verschijnt op Home (Tauri) en op de telefoon (/device/notifications).
Dezelfde machine geeft niet opnieuw een melding zolang de vorige ongelezen is
(24 uur), en een machine die al een week weg is telt als afgevoerd: geen
eindeloze bel voor een oude iMac.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from goedkeuring_melding import LUKA_USER_ID

DREMPEL_S = 180            # 3 min = 12 gemiste heartbeats van 15 s
AFGEVOERD_NA = timedelta(days=7)
HERHAAL_NA = timedelta(hours=24)
KOP = "Computer offline"


def _tijd(v: Any) -> datetime | None:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if not v:
        return None
    try:
        t = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def naam(rij: dict[str, Any]) -> str:
    return str(rij.get("host") or rij.get("device_id") or "onbekende computer")


def stille_workers(rijen: list[dict[str, Any]], nu: datetime, drempel_s: int = DREMPEL_S) -> list[dict[str, Any]]:
    """Workers die langer dan drempel_s stil zijn, maar nog geen week weg."""
    uit = []
    for rij in rijen:
        beat = _tijd(rij.get("heartbeat_at"))
        if beat is None:
            continue
        stil = nu - beat
        if timedelta(seconds=drempel_s) < stil <= AFGEVOERD_NA:
            uit.append({**rij, "stil_s": int(stil.total_seconds())})
    return uit


def bericht(rij: dict[str, Any]) -> str:
    beat = _tijd(rij.get("heartbeat_at"))
    lokaal = beat.astimezone().strftime("%d-%m %H:%M") if beat else "?"
    minuten = int(rij.get("stil_s", 0)) // 60
    return (f"{KOP}: {naam(rij)} geeft geen heartbeat meer sinds {lokaal} "
            f"({minuten} min). Check of de Mac aan staat en de worker draait "
            f"(launchctl list | grep -i axe).")[:1900]


def _al_gemeld(db: Any, rij: dict[str, Any], nu: datetime, voorvoegsel: str | None = None) -> bool:
    sinds = (nu - HERHAAL_NA).isoformat()
    voorvoegsel = voorvoegsel or f"{KOP}: {naam(rij)} "
    try:
        er = (db.table("core_notifications").select("id").eq("read", False)
              .like("message", f"{voorvoegsel}%").gt("created_at", sinds)
              .limit(1).execute().data) or []
    except Exception:  # noqa: BLE001 — bij twijfel liever geen dubbele bel
        return True
    return bool(er)


def ronde(db: Any, nu: datetime | None = None) -> dict[str, Any]:
    """Eén controle. Geeft terug wat stil is en wat gemeld is; slikt fouten."""
    nu = nu or datetime.now(timezone.utc)
    try:
        rijen = (db.table("core_computer_workers")
                 .select("device_id,host,heartbeat_at").execute().data) or []
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)[:300]}
    stil = stille_workers(rijen, nu)
    gemeld: list[str] = []
    for rij in stil:
        if _al_gemeld(db, rij, nu):
            continue
        try:
            db.table("core_notifications").insert({
                "recipient": LUKA_USER_ID, "type": "warning", "message": bericht(rij),
            }).execute()
            gemeld.append(naam(rij))
        except Exception:  # noqa: BLE001
            pass
    return {"checked": len(rijen), "silent": [naam(r) for r in stil], "notified": gemeld}


DAX_KOP = "DAX geblokkeerd"


def dax_meldingen(db: Any, bots: dict[str, Any], nu: datetime | None = None) -> list[str]:
    """Een DAX-bot die in deze ronde net op blocked ging (of onbereikbaar is) geeft
    één warning op Home en telefoon. Zelfde regel als bij de Mac: niet opnieuw
    zolang de vorige ongelezen is (24 uur). Slikt fouten."""
    nu = nu or datetime.now(timezone.utc)
    gemeld: list[str] = []
    for agent, verslag in (bots or {}).items():
        m = (verslag or {}).get("mission") or {}
        net_geblokkeerd = m.get("action") == "blocked" or (m.get("action") == "created" and m.get("status") == "blocked")
        if not net_geblokkeerd:
            continue
        voor = f"{DAX_KOP}: {agent} "
        if _al_gemeld(db, {}, nu, voor):
            continue
        reden = str(m.get("reason") or verslag.get("error") or "onbekende reden")[:300]
        try:
            db.table("core_notifications").insert({
                "recipient": LUKA_USER_ID, "type": "warning",
                "message": f"{voor}kan zijn vaste missie niet draaien: {reden}"[:1900],
            }).execute()
            gemeld.append(agent)
        except Exception:  # noqa: BLE001
            pass
    return gemeld


# ── Andersom: de Mac bewaakt de VPS (24/7, 3 nov 2026) ─────────────────────────
# G1 laat de VPS (dax-wacht) een stille Mac melden. Maar stopt de VPS-crontab of
# de API op de VPS, dan draait dax-wacht zelf niet meer en meldt niemand iets:
# /health zet het wel in `degraded`, maar daar kijkt Luka niet naar. Daarom kijkt
# de Mac-uitvoerder (_mac_lus in main.py, elke minuut, ander apparaat) of de
# dax-wacht nog loopt. Twee machines die elkaar bewaken.

VPS_KOP = "VPS-wacht stil"
VPS_JOB = "axe_core:dax-wacht"
VPS_DREMPEL = timedelta(minutes=15)   # dax-wacht draait elke 5 min: drie gemiste rondes


def vps_stil(schema: dict[str, Any] | None, nu: datetime, drempel: timedelta = VPS_DREMPEL) -> timedelta | None:
    """Hoe lang de dax-wacht al niet gedraaid heeft, of None als alles goed is
    (of als Luka hem bewust heeft uitgezet / hij nog nooit gedraaid heeft)."""
    if not schema or not schema.get("enabled"):
        return None
    laatst = _tijd(schema.get("last_run_at"))
    if laatst is None:
        return None
    stil = nu - laatst
    return stil if drempel < stil <= AFGEVOERD_NA else None


def vps_ronde(db: Any, nu: datetime | None = None) -> dict[str, Any]:
    """Eén controle vanaf de Mac. Eén warning op Home en telefoon; niet opnieuw
    zolang de vorige ongelezen is (24 uur). Slikt fouten."""
    nu = nu or datetime.now(timezone.utc)
    try:
        schema = ((db.table("core_schedules").select("job_key,enabled,last_run_at")
                   .eq("job_key", VPS_JOB).limit(1).execute().data) or [None])[0]
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)[:300]}
    stil = vps_stil(schema, nu)
    if stil is None:
        return {"silent": False, "notified": False}
    voor = f"{VPS_KOP}: "
    if _al_gemeld(db, {}, nu, voor):
        return {"silent": True, "notified": False}
    laatst = _tijd(schema.get("last_run_at"))
    lokaal = laatst.astimezone().strftime("%d-%m %H:%M") if laatst else "?"
    try:
        db.table("core_notifications").insert({
            "recipient": LUKA_USER_ID, "type": "warning",
            "message": (f"{voor}de DAX-wacht op de VPS draaide niet meer sinds {lokaal} "
                        f"({int(stil.total_seconds()) // 60} min). Check de VPS-crontab (/cron/tick) "
                        f"en de API op de VPS.")[:1900],
        }).execute()
    except Exception:  # noqa: BLE001
        return {"silent": True, "notified": False}
    return {"silent": True, "notified": True}
