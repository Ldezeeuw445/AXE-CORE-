"""De modelbox (ollama.axecompanion.com) via deze API, zonder sleutel op het toestel.

Waarom (30 okt 2026): de app praatte rechtstreeks met de modelbox, en sinds het
slot op die box (2 okt) wil nginx daar per toestel een sleutel. Die stond op geen
enkel toestel, dus Ollama, Hermes en alles erachter stond in Instellingen op
"Failed" -- terwijl deze VPS er wel gewoon bij kan: nginx laat dit IP door
(/health meet het: ollama_box ok, zonder sleutel).

De app heeft de AXE-sleutel al voor elke andere VPS-aanroep. Met deze route gaat
Ollama dezelfde weg: app -> AUTH hier -> modelbox. Geen nieuwe sleutel ergens.

Alleen gebruiken, nooit beheren: wat op de box mocht tot 13 sep (modellen
downloaden, verwijderen, kopiëren) gaat hier niet doorheen.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

# (methode, pad) die door mogen. Alles anders is 403, ook als Ollama het kent.
TOEGESTAAN: frozenset[tuple[str, str]] = frozenset({
    ("GET", "api/tags"), ("GET", "api/version"), ("GET", "api/ps"),
    ("POST", "api/chat"), ("POST", "api/generate"), ("POST", "api/show"),
    ("POST", "api/embed"), ("POST", "api/embeddings"),
    ("GET", "v1/models"), ("POST", "v1/chat/completions"), ("POST", "v1/embeddings"),
})

# Een koude 8B op CPU laadt in 20-90 s; de app wacht zelf 180 s.
TIMEOUT = httpx.Timeout(connect=10.0, read=180.0, write=30.0, pool=10.0)


def modelbox_basis() -> str:
    return os.environ.get("OLLAMA_HOST", "https://ollama.axecompanion.com").rstrip("/")


def mag(methode: str, pad: str) -> bool:
    return (methode.upper(), pad.strip("/")) in TOEGESTAAN


def maak_router() -> APIRouter:
    router = APIRouter()

    @router.api_route("/ollama/{pad:path}", methods=["GET", "POST"])
    async def naar_modelbox(pad: str, request: Request):
        if not mag(request.method, pad):
            raise HTTPException(403, f"{request.method} /{pad.strip('/')} is not allowed through AXE Core")
        kop = {"Content-Type": request.headers.get("content-type", "application/json")}
        sleutel = os.environ.get("OLLAMA_PROXY_KEY", "").strip()
        if sleutel:
            kop["Authorization"] = f"Bearer {sleutel}"
        client = httpx.AsyncClient(timeout=TIMEOUT)
        try:
            upstream = await client.send(
                client.build_request(request.method, f"{modelbox_basis()}/{pad.strip('/')}",
                                     headers=kop, content=await request.body()),
                stream=True,
            )
        except httpx.HTTPError as e:
            await client.aclose()
            raise HTTPException(502, f"modelbox unreachable: {str(e)[:160]}") from e

        async def sluit() -> None:
            await upstream.aclose()
            await client.aclose()

        # Streamend terug: /api/chat met stream:true geeft NDJSON, regel voor regel.
        # aiter_bytes en niet aiter_raw: de Content-Encoding van de box gaat niet mee,
        # dus wat hier doorgaat moet al uitgepakt zijn.
        return StreamingResponse(upstream.aiter_bytes(), status_code=upstream.status_code,
                                 media_type=upstream.headers.get("content-type", "application/json"),
                                 background=BackgroundTask(sluit))

    return router
