"""Android Device Manager pollt meldingen via de AXE Core API.

Geen anon-sleutel, geen user-JWT, geen AXE_API_KEY op het toestel. HQ (ingelogd)
schrijft een SHA-256 van een device-token in core_axe_devices; WorkManager stuurt
dat token hierheen. De API leest core_notifications met service_role.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Header, HTTPException

log = logging.getLogger("axe_core_api.device_notify")

TOKEN_PREFIX = "axe_dev_"
KOLOMMEN = "id,type,message,read,created_at"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def lees_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    soort, _, rest = authorization.partition(" ")
    if soort.lower() != "bearer" or not rest.strip():
        return None
    return rest.strip()


def maak_router(client_factory: Callable[[], Any]) -> APIRouter:
    router = APIRouter()

    def toestel_voor(token: str) -> dict | None:
        if not token.startswith(TOKEN_PREFIX):
            return None
        digest = token_hash(token)
        rijen = (
            client_factory()
            .table("core_axe_devices")
            .select("device_id,device_token_hash")
            .eq("device_token_hash", digest)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rijen:
            return None
        rij = rijen[0]
        bewaard = str(rij.get("device_token_hash") or "")
        if not bewaard or not hmac.compare_digest(bewaard, digest):
            return None
        return rij

    @router.get("/device/notifications")
    def device_notifications(authorization: str | None = Header(default=None)):
        token = lees_bearer(authorization)
        if not token:
            raise HTTPException(status_code=401, detail="Missing device token")
        toestel = toestel_voor(token)
        if toestel is None:
            raise HTTPException(status_code=401, detail="Invalid device token")

        sinds = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        try:
            rijen = (
                client_factory()
                .table("core_notifications")
                .select(KOLOMMEN)
                .eq("read", False)
                .gte("created_at", sinds)
                .order("created_at", desc=True)
                .limit(40)
                .execute()
                .data
                or []
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("device notifications: %s", exc)
            raise HTTPException(status_code=503, detail="notifications unavailable") from exc

        try:
            client_factory().table("core_axe_devices").update(
                {"last_seen": datetime.now(timezone.utc).isoformat()}
            ).eq("device_id", toestel["device_id"]).execute()
        except Exception as exc:  # noqa: BLE001
            log.warning("device last_seen: %s", exc)

        return {"notifications": rijen, "device_id": toestel["device_id"]}

    return router
