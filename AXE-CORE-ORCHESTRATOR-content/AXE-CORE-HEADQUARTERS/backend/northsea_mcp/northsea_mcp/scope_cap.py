"""Per-client scope-plafond: bestaande tokens blijven geldig, de cap snijdt.

Claude.ai voor Luka (subject die met acff7a12 begint) mag drafts maken, niet
goedkeuren of versturen. Geen revoke: lookup past de cap toe. Een expliciete
`allowed_scopes` in client-metadata wint van de Claude-heuristiek.
"""
from __future__ import annotations

from urllib.parse import urlparse

from .policy import SCOPES

LUKA_PREFIX = "acff7a12"
VERBODEN = frozenset({"northsea.admin", "northsea.communications.send"})
DRAFTS_ONLY: tuple[str, ...] = tuple(s for s in SCOPES if s not in VERBODEN)


def is_claude_client(client: dict | None) -> bool:
    if not client:
        return False
    naam = (client.get("client_name") or "").lower()
    if "claude" in naam:
        return True
    cid = str(client.get("client_id") or "").lower()
    if "claude.ai" in cid or "anthropic.com" in cid:
        return True
    for u in client.get("redirect_uris") or []:
        host = (urlparse(str(u)).hostname or "").lower()
        if host == "claude.ai" or host.endswith(".claude.ai") or host.endswith("anthropic.com"):
            return True
    return False


def cap_voor(client: dict | None, subject: str) -> frozenset[str] | None:
    if not client:
        return None
    raw = (client.get("metadata") or {}).get("allowed_scopes")
    if isinstance(raw, list) and raw:
        return frozenset(str(s) for s in raw)
    if (subject or "").startswith(LUKA_PREFIX) and is_claude_client(client):
        return frozenset(DRAFTS_ONLY)
    return None


def scopes_na_cap(scopes: tuple[str, ...] | list[str], client: dict | None, subject: str) -> tuple[str, ...]:
    cap = cap_voor(client, subject)
    if cap is None:
        return tuple(scopes)
    return tuple(s for s in scopes if s in cap)
