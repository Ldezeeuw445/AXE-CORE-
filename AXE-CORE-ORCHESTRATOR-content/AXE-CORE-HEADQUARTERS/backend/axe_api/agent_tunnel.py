"""De Mac mini bereikbaar voor de telefoon, via de VPS.

## Waarom dit bestaat

NorthSea Desk en de MCP-hub lezen hun gegevens via verbindingen (een Supabase-token,
Cloudflare-sleutels, de `gh`-login) die alleen op de Mac mini staan. In de Tauri-app
is dat vanzelf goed: de app praat met de axe_api op diezelfde Mac. Een telefoon kan
`127.0.0.1` van de Mac niet bereiken en praat dus met de VPS, die die verbindingen niet
heeft -- NorthSea gaf een foutmelding, de MCP-tab bleef leeg.

De sleutels naar de VPS kopiëren zou de oplossing zijn die elk geheim op een tweede
plek zet. In plaats daarvan komt het VERKEER naar de sleutels: de Mac mini opent een
omgekeerde SSH-tunnel naar de VPS (`ssh -R 127.0.0.1:18001:127.0.0.1:8001`), en deze
laag stuurt een kleine, vaste lijst paden daardoorheen. Niets wordt gekopieerd, er gaat
geen enkele poort open naar het internet (de tunnelpoort luistert alleen op loopback,
`GatewayPorts no`), en de Mac mini controleert zelf nog eens dezelfde Bearer.

## Wat er WEL en NIET doorheen gaat

Alleen `/northsea/` en `/mcp/hub`. Met opzet niet `/claude/`, `/preview/` of
`/planner/`: die zouden een sleutelhouder een shell op de Mac mini geven in plaats van
een leesbare desk. Wie dat ooit wil, zet het hier bewust bij en leest eerst waarom het
nu uit staat.

## Wat er gebeurt als de tunnel er niet is

Niets nieuws: het verzoek valt door naar de eigen routes van de VPS, zoals vóór deze
laag. Een tunnel die uitvalt maakt de API dus niet kapot, hij maakt NorthSea alleen weer
zo leesbaar-kapot als eerst. Een mislukte poging wordt 10 seconden onthouden zodat een
dode tunnel niet bij elk verzoek twee seconden kost.

## Waar hij in de keten staat

BINNEN de CORS-laag (hij wordt vóór `CORSMiddleware` geregistreerd, en Starlette zet
later toegevoegde middleware erbuiten). Daardoor krijgt een doorgestuurd antwoord
dezelfde CORS-headers als elk ander antwoord -- zonder dat zag de browser een antwoord
zonder `Access-Control-Allow-Origin` en meldde alleen "Failed to fetch", precies zoals
de 500 van de KeyError eerder.
"""
from __future__ import annotations

import hmac
import logging
import time
from typing import Awaitable, Callable, Iterable, Optional

import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse

log = logging.getLogger("axe_core_api.agent_tunnel")

#: Paden die door de tunnel mogen. Een prefix, vergeleken op padgrens (zie `_matcht`).
STANDAARD_PREFIXEN: tuple[str, ...] = ("/northsea", "/mcp/hub")

#: Headers die niet doorgegeven worden: hop-by-hop (RFC 9110 §7.6.1), plus wat httpx zelf zet.
_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
    "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}

#: Hoe lang een mislukte poging onthouden wordt.
TERUGVAL_SECONDEN = 10.0


def _matcht(pad: str, prefixen: Iterable[str]) -> bool:
    """`/northsea` en `/northsea/x` zijn van ons, `/northsea-evil` en `/northseas` niet."""
    return any(pad == p or pad.startswith(p + "/") for p in prefixen)


def _antwoord_headers(h: httpx.Headers) -> dict[str, str]:
    return {k: v for k, v in h.items() if k.lower() not in _HOP and k.lower() != "content-encoding"}


class AgentTunnel:
    """De doorstuur-laag. Eén instantie per app; `install` hangt hem aan een FastAPI-app."""

    def __init__(
        self,
        basis: str,
        api_key: str,
        prefixen: Iterable[str] = STANDAARD_PREFIXEN,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        klok: Callable[[], float] = time.monotonic,
        timeout: float = 120.0,
    ) -> None:
        self.basis = basis.rstrip("/")
        self._sleutel = api_key
        self.prefixen = tuple(prefixen)
        self._klok = klok
        # Verbinden mag kort duren (een dode tunnel moet snel opgeven), lezen lang
        # (NorthSea-vragen aan de hub kunnen tientallen seconden kosten).
        self._client = httpx.AsyncClient(
            transport=transport, timeout=httpx.Timeout(timeout, connect=2.0),
        )
        self._mislukt_tot = 0.0

    # -- status ----------------------------------------------------------------

    def in_terugval(self) -> bool:
        return self._klok() < self._mislukt_tot

    async def bereikbaar(self) -> bool:
        """Antwoordt de Mac mini nu? Geen cache: dit is wat de statusroute meet."""
        try:
            r = await self._client.get(f"{self.basis}/health", timeout=httpx.Timeout(3.0, connect=2.0))
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    async def get_json(self, path: str, params: Optional[dict] = None, timeout: float = 8.0):
        """Een GET naar de Mac mini voor de VPS zelf (niet voor de browser): het antwoord als JSON, of
        None als de Mac niet antwoordt, een fout geeft of geen JSON stuurt. Nooit een uitzondering:
        de aanroeper wil weten "is het er", niet waarom niet."""
        try:
            r = await self._client.get(
                f"{self.basis}{path}", params=params,
                headers={"Authorization": f"Bearer {self._sleutel}"},
                timeout=httpx.Timeout(timeout, connect=2.0),
            )
            return r.json() if r.status_code == 200 else None
        except (httpx.HTTPError, ValueError):
            return None

    # -- auth ------------------------------------------------------------------

    def _toegestaan(self, request: Request) -> bool:
        """Dezelfde Bearer als `require_auth`, constant-time vergeleken."""
        kop = request.headers.get("authorization", "")
        scheme, _, token = kop.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return False
        return hmac.compare_digest(token.encode(), self._sleutel.encode())

    # -- de middleware -----------------------------------------------------------

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        pad = request.url.path
        # OPTIONS is de CORS-preflight en hoort bij CORSMiddleware, niet bij de Mac.
        if request.method == "OPTIONS" or not _matcht(pad, self.prefixen):
            return await call_next(request)
        if not self._toegestaan(request):
            # Zelf afwijzen: een ongeauthenticeerd verzoek mag de tunnel niet eens aanraken.
            return JSONResponse({"detail": "Invalid API key"}, status_code=401)
        if self.in_terugval():
            return await call_next(request)

        url = f"{self.basis}{pad}" + (f"?{request.url.query}" if request.url.query else "")
        headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP}
        body = await request.body()
        try:
            req = self._client.build_request(request.method, url, headers=headers, content=body or None)
            upstream = await self._client.send(req, stream=True)
        except httpx.HTTPError as e:
            # Tunnel dood of Mac mini uit. Onthouden, en terugvallen op de eigen routes.
            self._mislukt_tot = self._klok() + TERUGVAL_SECONDEN
            log.warning("agent tunnel naar %s niet bereikbaar: %s", self.basis, e.__class__.__name__)
            return await call_next(request)

        async def stroom():
            try:
                if upstream.is_stream_consumed:
                    # Al volledig gelezen (testtransport, of een transport dat buffert).
                    yield upstream.content
                else:
                    async for stuk in upstream.aiter_raw():
                        yield stuk
            finally:
                await upstream.aclose()

        return StreamingResponse(
            stroom(), status_code=upstream.status_code, headers=_antwoord_headers(upstream.headers),
            media_type=None,
        )


def install(
    app,
    basis: str,
    api_key: str,
    prefixen: Iterable[str] = STANDAARD_PREFIXEN,
) -> AgentTunnel:
    """Hang de laag aan `app`. Aanroepen VÓÓR `add_middleware(CORSMiddleware, ...)`."""
    tunnel = AgentTunnel(basis, api_key, prefixen)
    app.middleware("http")(tunnel.dispatch)
    return tunnel
