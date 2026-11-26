"""Trading-accounts per app, voor Home (26 nov, Luka).

AXE Core (AXE Algo) heeft zijn eigen lijst in de app (cfg:trading_accounts).
AXE Companion heeft `user_broker_accounts` -- die leest de app niet zelf (RLS),
dus hier, met alleen wat Home mag zien: geen login, geen sleutel, geen token.
Trading OS heeft een eigen database waar deze server (nog) niet bij kan; dat
zeggen we eerlijk in plaats van een lege lijst te tonen.

Alleen lezen. Geen orders, geen wijzigingen aan accounts.
"""
from __future__ import annotations

from typing import Any

VELDEN = "id,label,provider,status,provider_status,connection_method,trading_mode,masked_login,last_sync_at,created_at"


def _is_demo_testrij(r: dict[str, Any]) -> bool:
    """De dubbele 'AXE Demo Account'-papierrijen van 11 sep: één groep, niet 28 regels."""
    return (r.get("connection_method") == "demo_paper" or r.get("provider") == "demo")


def companion_accounts(rijen: list[dict[str, Any]]) -> dict[str, Any]:
    echt = [r for r in rijen if not _is_demo_testrij(r)]
    demo = [r for r in rijen if _is_demo_testrij(r)]
    return {
        "accounts": [{
            "id": r.get("id"), "label": r.get("label") or "Account", "provider": r.get("provider"),
            "status": r.get("status"), "verbonden": (r.get("provider_status") or r.get("status")) in ("connected", "active"),
            "provider_status": r.get("provider_status"), "modus": r.get("trading_mode"),
            "login": r.get("masked_login"), "laatste_sync": r.get("last_sync_at"),
        } for r in sorted(echt, key=lambda x: str(x.get("last_sync_at") or ""), reverse=True)],
        "demo_testrijen": len(demo),
    }


def overzicht(db: Any) -> dict[str, Any]:
    uit: dict[str, Any] = {}
    try:
        rijen = db.table("user_broker_accounts").select(VELDEN).limit(500).execute().data or []
        uit["companion"] = companion_accounts(rijen)
    except Exception as e:  # noqa: BLE001
        uit["companion"] = {"fout": str(e)[:160]}
    uit["trading_os"] = {
        "bereikbaar": False,
        "reden": "Trading OS keeps its accounts in its own database; this server has no read access to it yet.",
    }
    return uit


__all__ = ["overzicht", "companion_accounts"]
