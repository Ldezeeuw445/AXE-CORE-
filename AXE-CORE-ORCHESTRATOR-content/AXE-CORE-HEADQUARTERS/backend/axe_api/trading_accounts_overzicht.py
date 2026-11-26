"""Trading-accounts per app, voor Home (26 nov, Luka).

AXE Core (AXE Algo) heeft zijn eigen lijst in de app (cfg:trading_accounts).
AXE Companion heeft `user_broker_accounts` -- die leest de app niet zelf (RLS),
dus hier, met alleen wat Home mag zien: geen login, geen sleutel, geen token.
Trading OS deelt dezelfde database en broker-hub; daarbij komt zijn MT5-snapshot.

Alleen lezen. Geen orders, geen wijzigingen aan accounts.
"""
from __future__ import annotations

from typing import Any

VELDEN = "id,label,provider,status,provider_status,connection_method,trading_mode,masked_login,last_sync_at,created_at"


def _is_demo_testrij(r: dict[str, Any]) -> bool:
    """De dubbele 'AXE Demo Account'-papierrijen van 11 sep: één groep, niet 28 regels."""
    return (r.get("connection_method") == "demo_paper" or r.get("provider") == "demo")


def _rij(r: dict[str, Any], aantal: int = 1) -> dict[str, Any]:
    return {
        "id": r.get("id"), "label": r.get("label") or "Account", "provider": r.get("provider"),
        "status": r.get("status"), "verbonden": (r.get("provider_status") or r.get("status")) in ("connected", "active"),
        "provider_status": r.get("provider_status"), "modus": r.get("trading_mode"),
        "login": r.get("masked_login"), "laatste_sync": r.get("last_sync_at"), "aantal": aantal,
    }


def companion_accounts(rijen: list[dict[str, Any]]) -> dict[str, Any]:
    echt = [r for r in rijen if not _is_demo_testrij(r)]
    demo = [r for r in rijen if _is_demo_testrij(r)]
    # 26 nov: 39 identieke "AXE Alpaca Paper"-rijen -> één regel "×39".
    groepen: dict[tuple, list[dict[str, Any]]] = {}
    for r in echt:
        groepen.setdefault((r.get("label"), r.get("provider"), r.get("trading_mode")), []).append(r)
    accounts = []
    for leden in groepen.values():
        nieuwste = max(leden, key=lambda x: str(x.get("last_sync_at") or ""))
        accounts.append(_rij(nieuwste, len(leden)))
    # Live eerst, dan paper; binnen elk de laatst gesynchroniseerde bovenaan.
    accounts.sort(key=lambda a: str(a["laatste_sync"] or ""), reverse=True)
    accounts.sort(key=lambda a: a["modus"] != "live")
    return {"accounts": accounts, "demo_testrijen": len(demo)}


def overzicht(db: Any) -> dict[str, Any]:
    uit: dict[str, Any] = {}
    try:
        rijen = db.table("user_broker_accounts").select(VELDEN).limit(500).execute().data or []
        uit["companion"] = companion_accounts(rijen)
    except Exception as e:  # noqa: BLE001
        uit["companion"] = {"fout": str(e)[:160]}
    # 26 nov (Luka): Trading OS, Companion en AXE Core delen één Supabase. Trading OS
    # gebruikt dezelfde broker-hub (user_broker_accounts) als Companion; daarnaast een
    # MT5-snapshot. Die laten we zien, met hoe oud hij is.
    tos: dict[str, Any] = {"bereikbaar": True, "gedeeld_met_companion": True, "mt5": []}
    try:
        snaps = (db.table("mt5_account_snapshots").select("account_id,name,server,currency,updated_at")
                 .order("updated_at", desc=True).limit(10).execute().data) or []
        tos["mt5"] = [{"naam": r.get("name") or "MT5", "server": r.get("server"), "valuta": r.get("currency"),
                       "bijgewerkt": r.get("updated_at")} for r in snaps]
    except Exception as e:  # noqa: BLE001
        tos["fout"] = str(e)[:160]
    uit["trading_os"] = tos
    return uit


__all__ = ["overzicht", "companion_accounts"]
