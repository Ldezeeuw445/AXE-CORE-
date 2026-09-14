"""Audit: elke MCP-aanroep in dezelfde `core_audit_log` als de rest van AXE CORE.

De tabel staat in AXE Companion (`SUPABASE_URL`) en heeft
`action, resource, details, performed_by, ip_address`. axe-core-api schrijft er al
in (taken, SQL, crew-runs), dus hier komt geen tweede audit-systeem bij.

Lukt schrijven niet, dan gaat de regel naar de lokale store (`audit_fallback`) en
wordt hij later alsnog weggeschreven. Een audit die stil verdwijnt is erger dan
een audit die wacht.

Wat er NOOIT in komt: tokens, sleutels, volledige berichtteksten, e-mailadressen.
`scrub` haalt ze eruit voor het geval een aanroeper ze in een argument stopte.
"""
from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from .store import Store

log = logging.getLogger("northsea_mcp.audit")

GEHEIM = re.compile(r"(ns[as]t|nsrt|sbp|sk|re|tvly|pplx)_[A-Za-z0-9_\-]{8,}|eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}")
EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
LANGE_TEKST = ("body", "message", "text", "findings", "analysis", "draft")


def scrub(value: Any, depth: int = 0) -> Any:
    if depth > 5:
        return "…"
    if isinstance(value, dict):
        return {k: ("[omitted]" if k in LANGE_TEKST else scrub(v, depth + 1)) for k, v in list(value.items())[:50]}
    if isinstance(value, list):
        return [scrub(v, depth + 1) for v in value[:50]]
    if isinstance(value, str):
        return EMAIL.sub("[email]", GEHEIM.sub("[secret]", value))[:500]
    return value


class Auditor:
    def __init__(self, *, axe_url: str, axe_key: str, store: Store, client: httpx.AsyncClient | None = None):
        self._url = axe_url.rstrip("/")
        self._headers = {"apikey": axe_key, "Authorization": f"Bearer {axe_key}", "Content-Type": "application/json",
                         "Prefer": "return=minimal"}
        self._store = store
        self._client = client or httpx.AsyncClient(timeout=10)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def record(self, *, tool: str, resource: str, principal: str, ip: str | None, details: dict) -> None:
        row = {
            "action": f"northsea_mcp.{tool}",
            "resource": resource[:200],
            "performed_by": principal[:200],
            "ip_address": (ip or "")[:64],
            "details": scrub(details),
        }
        try:
            r = await self._client.post(f"{self._url}/rest/v1/core_audit_log", headers=self._headers, json=row)
            if r.status_code >= 400:
                raise RuntimeError(f"audit insert {r.status_code}")
        except Exception as e:  # noqa: BLE001 -- nooit een tool laten falen op audit, wel bewaren
            log.warning("audit naar core_audit_log mislukt (%s); lokaal bewaard", type(e).__name__)
            self._store.audit_fallback(row)

    async def flush(self) -> int:
        """Stuurt lokaal bewaarde regels alsnog door. Geeft het aantal verstuurde."""
        pending = self._store.pending_audit()
        sent: list[int] = []
        for rid, row in pending:
            try:
                r = await self._client.post(f"{self._url}/rest/v1/core_audit_log", headers=self._headers, json=row)
                if r.status_code < 400:
                    sent.append(rid)
            except Exception:  # noqa: BLE001
                break
        self._store.drop_audit(sent)
        return len(sent)

    async def ping(self) -> bool:
        r = await self._client.get(f"{self._url}/rest/v1/core_audit_log", params={"select": "id", "limit": "1"},
                                   headers=self._headers)
        return r.status_code < 400
