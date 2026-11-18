"""Luka keurt een mail goed vanuit AXE, met zijn eigen inlog.

Luka, 17 nov 2026: "er wachten nog 44 ergens maar ik kan nergens duidelijk zien
of vinden waar ik dat moet goedkeuren". Gemeten: in AXE stond geen knop. De
desk-schermen zijn alleen-lezen, en northsea_approve_draft weigert terecht
elke service-sleutel (AXE's gateway, Claude's connector): een ja moet van een
ingelogde mens komen.

Dit is de weg voor die mens. De app stuurt Luka's eigen AXE-sessie mee (het
Supabase access token van zijn login). Deze server vertrouwt AXE daarbij
niet: hij vraagt Supabase zelf wie dat token is, en alleen een id op de
allowlist (`allowed_user_ids`) wordt de principal. Daarna dezelfde regels als
altijd: `Caller.is_human` (NORTHSEA_HUMAN_PRINCIPALS, fail closed), het
gevoeligheidshek, het contactbeleid, en versturen alleen na die menselijke ja.

Geen nieuwe rechten: wat hier kan, kon Luka al in de Deal Desk. Alleen zit de
knop nu waar hij kijkt.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .policy import PolicyDenied
from .service import Caller, NotFound

log = logging.getLogger("northsea_mcp.mens")

# Geen "axe-"-voorvoegsel: dat telt (terecht) als bot. Deze naam zet de server
# zelf, pas nadat Supabase het token als Luka herkende.
CLIENT_ID = "luka-in-app"
SCOPES = frozenset({"northsea.admin", "northsea.deal.read"})
VENSTER_S = 60.0
MAX_PER_VENSTER = 120  # ~100 NorthSea-mails op een dag; één bulk mag die lijst leegmaken


async def wie_is_dit(http: httpx.AsyncClient, *, axe_url: str, axe_key: str, token: str,
                     toegestaan: frozenset[str]) -> str | None:
    """Supabase zegt wie het token is. Alleen een toegestane id komt terug."""
    if not token or len(token) > 4096:
        return None
    try:
        r = await http.get(f"{axe_url}/auth/v1/user",
                           headers={"apikey": axe_key, "Authorization": f"Bearer {token}"}, timeout=10)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    uid = (r.json() or {}).get("id")
    return uid if isinstance(uid, str) and uid in toegestaan else None


def _caller(uid: str) -> Caller:
    return Caller(principal=uid, client_id=CLIENT_ID, scopes=SCOPES)


async def keur_goed_en_verstuur(service: Any, uid: str, draft_id: str,
                                expected_updated_at: str | None = None) -> dict[str, Any]:
    """Eén concept: goedkeuren als Luka, en dan versturen. Weigert wat de regels weigeren."""
    goed = await beslis(service, uid, draft_id, "approve", expected_updated_at=expected_updated_at)
    if not goed.get("ok"):
        return goed
    verstuur = await beslis(service, uid, draft_id, "send")
    return {**goed, "ok": bool(verstuur.get("ok") or verstuur.get("sent") or verstuur.get("duplicate")),
            "sent": bool(verstuur.get("sent")), "duplicate": bool(verstuur.get("duplicate")),
            "message": verstuur.get("message") or goed.get("message"),
            "code": verstuur.get("code"), "send_ok": verstuur.get("ok")}


async def beslis(service: Any, uid: str, draft_id: str, actie: str,
                 expected_updated_at: str | None = None) -> dict[str, Any]:
    """Approve of reject zonder te wachten op Resend. Send is een aparte, latere stap.

    17 nov: één klik die approve+send deed, voelde weg als Resend traag was.
    De inbox haalt de rij weg op approve; send loopt daarna."""
    caller = _caller(uid)
    try:
        if actie == "reject":
            uit = await service.reject_draft(caller, draft_id=draft_id, expected_updated_at=expected_updated_at)
            return {"draft_id": draft_id, "ok": True, "action": "reject", "approval_status": uit.approval_status,
                    "sent": False, "message": uit.message}
        if actie == "approve":
            uit = await service.approve_draft(caller, draft_id=draft_id, expected_updated_at=expected_updated_at)
            return {"draft_id": draft_id, "ok": True, "action": "approve", "approval_status": uit.approval_status,
                    "approved_at": uit.approved_at, "sent": False, "message": uit.message}
        if actie == "send":
            uit = await service.send_approved_communication(caller, draft_id=draft_id, confirm=True)
            return {"draft_id": draft_id, "ok": bool(uit.submitted or uit.duplicate), "action": "send",
                    "sent": bool(uit.submitted), "duplicate": bool(uit.duplicate), "message": uit.message}
    except PolicyDenied as e:
        return {"draft_id": draft_id, "ok": False, "action": actie, "code": e.code, "message": e.message}
    except NotFound:
        return {"draft_id": draft_id, "ok": False, "action": actie, "code": "not_found", "message": "Draft not found."}
    return {"draft_id": draft_id, "ok": False, "action": actie, "code": "invalid_action",
            "message": "Action must be approve, reject or send."}

