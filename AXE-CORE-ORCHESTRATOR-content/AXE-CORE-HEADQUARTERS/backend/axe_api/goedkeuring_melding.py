"""Eén vraag aan Luka: core_approvals + één core_notifications-rij.

De A17 leest pending rijen via GET /approvals (task_id, kind, title, detail)
en nieuwe core_notifications als gebruiker acff7a12-1111-481d-a7a9-cc07583b8069.
PWA/Tauri-push leest dezelfde notification-rij. Een besluit op één plek
zet de approval op approved/rejected/expired, zodat alle oppervlakken
dezelfde rij kwijt zijn.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

LUKA_USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069"
# Oude shell-vragen (useradd, systemctl) mogen nooit meer op het slotscherm.
OUDE_SHELL_DAGEN = 14


def melding_voor_goedkeuring(titel: str, detail: str = "") -> str:
    """Zelfde vorm als notificationText / pushBericht: onderwerp, dan de rest."""
    kop = (titel or "Goedkeuring nodig").strip() or "Goedkeuring nodig"
    rest = (detail or "").strip()
    if rest:
        return f"{kop}: {rest}"[:1900]
    return kop[:1900]


def schrijf_goedkeuring_melding(db: Any, titel: str, detail: str = "") -> dict[str, Any] | None:
    """Eén warning-rij. Fout slikken: de approval-rij is de bron.

    Staat dezelfde vraag (zelfde kop) er nog ongelezen van de afgelopen 24 uur,
    dan geen tweede: DEAL-002 stond er 8 keer, en een bel vol herhalingen is een
    bel die je negeert (10 okt)."""
    kop = (titel or "Goedkeuring nodig").strip() or "Goedkeuring nodig"
    try:
        from datetime import timedelta, timezone as _tz
        sinds = (datetime.now(_tz.utc) - timedelta(hours=24)).isoformat()
        er = (db.table("core_notifications").select("id").eq("read", False)
              .like("message", f"{kop}%").gt("created_at", sinds).limit(1).execute().data) or []
        if er:
            return er[0]
    except Exception:
        pass
    try:
        uit = db.table("core_notifications").insert({
            "recipient": LUKA_USER_ID,
            "type": "warning",
            "message": melding_voor_goedkeuring(titel, detail),
        }).execute()
        rijen = getattr(uit, "data", None) or []
        return rijen[0] if rijen else {"message": melding_voor_goedkeuring(titel, detail)}
    except Exception:
        return None


def bestaande_pending(db: Any, taak_id: str, kind: str) -> dict[str, Any] | None:
    try:
        rijen = (
            db.table("core_approvals").select("*")
            .eq("task_id", taak_id).eq("status", "pending").eq("kind", kind)
            .limit(1).execute().data
        ) or []
        return rijen[0] if rijen else None
    except Exception:
        return None


def vraag_luka(
    db: Any,
    taak_id: str,
    *,
    titel: str,
    detail: str,
    kind: str,
    requested_by: str = "axe",
) -> dict[str, Any] | None:
    """Schrijf de pending approval + precies één notification, of hergebruik de bestaande."""
    er = bestaande_pending(db, taak_id, kind)
    if er:
        return er
    row = {
        "task_id": taak_id,
        "target_type": "task",
        "target_id": taak_id,
        "kind": kind,
        "title": titel,
        "detail": detail,
        "requested_by": requested_by,
        "status": "pending",
        "metadata": {},
    }
    try:
        approval = db.table("core_approvals").insert(row).execute().data[0]
    except Exception:
        return bestaande_pending(db, taak_id, kind)
    schrijf_goedkeuring_melding(db, titel, detail)
    return approval


def verval_oude_shell_vragen(db: Any, nu: datetime | None = None) -> int:
    """Pending shell_command ouder dan OUDE_SHELL_DAGEN → expired, niet pushen."""
    nu = nu or datetime.now(timezone.utc)
    grens = (nu - timedelta(days=OUDE_SHELL_DAGEN)).isoformat()
    try:
        rijen = (
            db.table("core_approvals").update({
                "status": "expired",
                "decision_reason": "stale shell ask",
                "decided_at": nu.isoformat(),
            })
            .eq("status", "pending").eq("kind", "shell_command")
            .lt("created_at", grens)
            .execute().data
        ) or []
        return len(rijen)
    except Exception:
        return 0


def a17_velden(rij: dict[str, Any]) -> dict[str, Any]:
    """Wat de A17-watcher uit /approvals moet kunnen lezen."""
    return {
        "id": rij.get("id"),
        "task_id": rij.get("task_id"),
        "kind": rij.get("kind"),
        "title": rij.get("title"),
        "detail": rij.get("detail"),
        "status": rij.get("status") or "pending",
    }


def heeft_a17_velden(rij: dict[str, Any]) -> bool:
    return all(rij.get(k) not in (None, "") for k in ("task_id", "kind", "title", "detail"))
