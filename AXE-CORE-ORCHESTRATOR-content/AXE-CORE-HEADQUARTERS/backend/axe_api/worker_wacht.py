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


def _al_gemeld(db: Any, rij: dict[str, Any], nu: datetime) -> bool:
    sinds = (nu - HERHAAL_NA).isoformat()
    try:
        er = (db.table("core_notifications").select("id").eq("read", False)
              .like("message", f"{KOP}: {naam(rij)} %").gt("created_at", sinds)
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
